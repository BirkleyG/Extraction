// Persistence for the shared game. Postgres when DATABASE_URL is set (Railway),
// otherwise an in-memory store for local runs and tests.
import pg from 'pg';

export async function createStore(databaseUrl) {
  if (!databaseUrl) return new MemoryStore();
  const store = new PgStore(databaseUrl);
  await store.migrate();
  return store;
}

class MemoryStore {
  constructor() {
    this.kind = 'memory';
    this.docs = new Map(); // "coll/id" -> {coll,id,data,updated}
    this.players = new Map(); // id -> player
    this.locks = new Map(); // name -> {holder, expires}
    this.ai = new Map(); // "day|player" -> count
  }
  async getDoc(coll, id) { const d = this.docs.get(coll + '/' + id); return d ? clone(d.data) : null; }
  async setDoc(coll, id, data) { const updated = Date.now(); this.docs.set(coll + '/' + id, { coll, id, data: clone(data), updated }); return updated; }
  async listColl(coll, { orderBy, desc, limit } = {}) {
    let rows = [...this.docs.values()].filter(d => d.coll === coll).map(d => ({ id: d.id, data: clone(d.data) }));
    if (orderBy) rows.sort((a, b) => cmp(a.data[orderBy], b.data[orderBy]) * (desc ? -1 : 1));
    return limit ? rows.slice(0, limit) : rows;
  }
  async pruneColl(coll, keep) {
    const rows = await this.listColl(coll, { orderBy: 't', desc: true });
    for (const r of rows.slice(keep)) this.docs.delete(coll + '/' + r.id);
  }
  async createPlayer(p) { this.players.set(p.id, { ...p }); return p; }
  async playerByToken(hash) { for (const p of this.players.values()) if (p.tokenHash === hash) return { ...p }; return null; }
  async playerByName(name) { const n = name.toLowerCase(); for (const p of this.players.values()) if (p.name.toLowerCase() === n) return { ...p }; return null; }
  async updatePlayerToken(id, tokenHash) { const p = this.players.get(id); if (p) p.tokenHash = tokenHash; }
  async setOwner(id, owner) { const p = this.players.get(id); if (p) p.owner = owner; }
  async players_(ids) { return ids.map(id => this.players.get(id)).filter(Boolean).map(p => ({ id: p.id, name: p.name })); }
  async acquireLock(name, holder, ttlMs) {
    const now = Date.now(); const l = this.locks.get(name);
    if (l && l.expires > now && l.holder !== holder) return false;
    this.locks.set(name, { holder, expires: now + ttlMs }); return true;
  }
  async bumpAi(day, playerId) {
    const k = day + '|' + playerId, t = day + '|*';
    this.ai.set(k, (this.ai.get(k) || 0) + 1); this.ai.set(t, (this.ai.get(t) || 0) + 1);
    return { mine: this.ai.get(k), total: this.ai.get(t) };
  }
  async aiCounts(day, playerId) { return { mine: this.ai.get(day + '|' + playerId) || 0, total: this.ai.get(day + '|*') || 0 }; }
  async close() {}
}

class PgStore {
  constructor(url) {
    this.kind = 'postgres';
    const local = /localhost|127\.0\.0\.1|\.railway\.internal/.test(url);
    this.pool = new pg.Pool({ connectionString: url, max: 8, ssl: local ? false : { rejectUnauthorized: false } });
  }
  async migrate() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS docs (
        coll text NOT NULL, id text NOT NULL, data jsonb NOT NULL, updated bigint NOT NULL,
        PRIMARY KEY (coll, id));
      CREATE TABLE IF NOT EXISTS players (
        id text PRIMARY KEY, name text NOT NULL, token_hash text NOT NULL, owner boolean NOT NULL DEFAULT false,
        created bigint NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS players_name_lower ON players (lower(name));
      CREATE INDEX IF NOT EXISTS players_token ON players (token_hash);
      CREATE TABLE IF NOT EXISTS locks (name text PRIMARY KEY, holder text NOT NULL, expires bigint NOT NULL);
      CREATE TABLE IF NOT EXISTS ai_usage (day text NOT NULL, player text NOT NULL, n integer NOT NULL,
        PRIMARY KEY (day, player));`);
  }
  async getDoc(coll, id) { const r = await this.pool.query('SELECT data FROM docs WHERE coll=$1 AND id=$2', [coll, id]); return r.rows[0] ? r.rows[0].data : null; }
  async setDoc(coll, id, data) {
    const updated = Date.now();
    await this.pool.query(`INSERT INTO docs (coll,id,data,updated) VALUES ($1,$2,$3,$4)
      ON CONFLICT (coll,id) DO UPDATE SET data=EXCLUDED.data, updated=EXCLUDED.updated`, [coll, id, JSON.stringify(data), updated]);
    return updated;
  }
  async listColl(coll, { orderBy, desc, limit } = {}) {
    let sql = 'SELECT id, data FROM docs WHERE coll=$1'; const args = [coll];
    if (orderBy) { args.push(orderBy); sql += ` ORDER BY (data->>$2)::double precision ${desc ? 'DESC' : 'ASC'} NULLS LAST`; }
    if (limit) { args.push(limit); sql += ` LIMIT $${args.length}`; }
    const r = await this.pool.query(sql, args); return r.rows;
  }
  async pruneColl(coll, keep) {
    await this.pool.query(`DELETE FROM docs WHERE coll=$1 AND id NOT IN (
      SELECT id FROM docs WHERE coll=$1 ORDER BY (data->>'t')::double precision DESC NULLS LAST LIMIT $2)`, [coll, keep]);
  }
  async createPlayer(p) {
    await this.pool.query('INSERT INTO players (id,name,token_hash,owner,created) VALUES ($1,$2,$3,$4,$5)', [p.id, p.name, p.tokenHash, !!p.owner, Date.now()]);
    return p;
  }
  row(r) { return r && { id: r.id, name: r.name, tokenHash: r.token_hash, owner: r.owner }; }
  async playerByToken(hash) { const r = await this.pool.query('SELECT * FROM players WHERE token_hash=$1', [hash]); return this.row(r.rows[0]); }
  async playerByName(name) { const r = await this.pool.query('SELECT * FROM players WHERE lower(name)=lower($1)', [name]); return this.row(r.rows[0]); }
  async updatePlayerToken(id, tokenHash) { await this.pool.query('UPDATE players SET token_hash=$2 WHERE id=$1', [id, tokenHash]); }
  async setOwner(id, owner) { await this.pool.query('UPDATE players SET owner=$2 WHERE id=$1', [id, owner]); }
  async players_(ids) { const r = await this.pool.query('SELECT id, name FROM players WHERE id = ANY($1)', [ids]); return r.rows; }
  async acquireLock(name, holder, ttlMs) {
    const now = Date.now();
    const r = await this.pool.query(`INSERT INTO locks (name,holder,expires) VALUES ($1,$2,$3)
      ON CONFLICT (name) DO UPDATE SET holder=EXCLUDED.holder, expires=EXCLUDED.expires
      WHERE locks.expires < $4 OR locks.holder = EXCLUDED.holder RETURNING holder`, [name, holder, now + ttlMs, now]);
    return r.rowCount === 1;
  }
  async bumpAi(day, playerId) {
    const q = `INSERT INTO ai_usage (day,player,n) VALUES ($1,$2,1) ON CONFLICT (day,player) DO UPDATE SET n=ai_usage.n+1 RETURNING n`;
    const a = await this.pool.query(q, [day, playerId]); const b = await this.pool.query(q, [day, '*']);
    return { mine: a.rows[0].n, total: b.rows[0].n };
  }
  async aiCounts(day, playerId) {
    const r = await this.pool.query('SELECT player, n FROM ai_usage WHERE day=$1 AND player = ANY($2)', [day, [playerId, '*']]);
    const m = Object.fromEntries(r.rows.map(x => [x.player, x.n]));
    return { mine: m[playerId] || 0, total: m['*'] || 0 };
  }
  async close() { await this.pool.end(); }
}

function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
function cmp(a, b) { if (a == null) return b == null ? 0 : 1; if (b == null) return -1; return a < b ? -1 : a > b ? 1 : 0; }
