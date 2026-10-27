import { createHash } from "node:crypto";
export const digest = (value) =>
  createHash("sha256").update(String(value)).digest("hex");
const copy = (value) => structuredClone(value);
export const canonicalError = (code) =>
  Object.assign(new Error(code), { code });
function authorize(world, member, worldId, uid) {
  if (!world || world.worldId !== worldId)
    throw canonicalError("WORLD_NOT_FOUND");
  if (world.status !== "active") throw canonicalError("WORLD_CLOSED");
  if (!member || member.uid !== uid || member.status !== "active")
    throw canonicalError("FORBIDDEN");
}
export class MemoryCanonicalRepository {
  constructor() {
    this.worlds = new Map();
    this.members = new Map();
    this.records = new Map();
    this.tail = Promise.resolve();
  }
  async updateWorldMembership(worldId, uid) {
    this.worlds.set(worldId, { worldId, status: "active" });
    this.members.set(JSON.stringify([worldId, uid]), { uid, status: "active" });
  }
  async listMembers(worldId) {
    return [...this.members.values()]
      .filter(
        (member) =>
          member.status === "active" &&
          this.records.has(JSON.stringify([worldId, member.uid])) &&
          this.members.get(JSON.stringify([worldId, member.uid])) === member,
      )
      .slice(0, 10)
      .map((member) => member.uid);
  }
  async transact({ worldId, uid, requestId }, work) {
    const previous = this.tail;
    let release;
    this.tail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const key = JSON.stringify([worldId, uid]);
      authorize(this.worlds.get(worldId), this.members.get(key), worldId, uid);
      const data = copy(
        this.records.get(key) ?? {
          currentMonth: null,
          months: {},
          receipts: {},
          ledger: {},
          archives: {},
        },
      );
      const result = await work(data);
      this.records.set(key, data);
      return copy(result);
    } finally {
      release();
    }
  }
}
export class FirestoreCanonicalRepository {
  constructor(firestore, { transactionMaxAttempts = 8 } = {}) {
    this.firestore = firestore;
    this.transactionMaxAttempts = transactionMaxAttempts;
  }
  async listMembers(worldId) {
    const snapshots = await this.firestore
      .collection("worlds")
      .doc(digest(worldId))
      .collection("owners")
      .where("status", "==", "active")
      .limit(10)
      .get();
    const started = await Promise.all(
      snapshots.docs.map(async (doc) => {
        const meta = await doc.ref
          .collection("gameplayMeta")
          .doc("current")
          .get();
        return meta.exists ? doc.data().uid : null;
      }),
    );
    return started.filter((uid) => typeof uid === "string" && uid.length > 0);
  }
  async transact({ worldId, uid, requestId }, work) {
    const worldRef = this.firestore.collection("worlds").doc(digest(worldId));
    const ownerRef = worldRef.collection("owners").doc(digest(uid));
    const metaRef = ownerRef.collection("gameplayMeta").doc("current");
    const receiptRef = requestId
      ? ownerRef.collection("gameplayReceipts").doc(digest(requestId))
      : null;
    return this.firestore.runTransaction(
      async (tx) => {
        const refs = [
          worldRef,
          ownerRef,
          metaRef,
          ...(receiptRef ? [receiptRef] : []),
        ];
        const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
        authorize(
          snaps[0].exists ? snaps[0].data() : null,
          snaps[1].exists ? snaps[1].data() : null,
          worldId,
          uid,
        );
        const currentMonth = snaps[2].exists
          ? snaps[2].data().currentMonth
          : null;
        const monthIds = [
          ...new Set(
            [currentMonth, new Date().toISOString().slice(0, 7)].filter(
              Boolean,
            ),
          ),
        ];
        // Work may request a deterministic test clock month; load it lazily before buffered writes.
        const data = {
          currentMonth,
          months: {},
          receipts: {},
          ledger: {},
          archives: {},
        };
        if (receiptRef && snaps[3].exists)
          Object.defineProperty(data.receipts, requestId, {
            value: JSON.parse(snaps[3].data().json),
            enumerable: true,
            configurable: true,
            writable: true,
          });
        data.loadMonth = async (month) => {
          if (Object.hasOwn(data.months, month)) return;
          const snap = await tx.get(ownerRef.collection("gameplay").doc(month));
          data.months[month] = snap.exists
            ? JSON.parse(snap.data().json)
            : null;
        };
        for (const month of monthIds) await data.loadMonth(month);
        const beforeMonths = JSON.stringify(data.months);
        const result = await work(data);
        const rowsByMonth = new Map();
        for (const row of Object.values(data.ledger)) {
          const rows = rowsByMonth.get(row.monthId) ?? [];
          rows.push(row);
          rowsByMonth.set(row.monthId, rows);
        }
        const ledgerWrites = [];
        for (const [monthId, rows] of rowsByMonth) {
          rows.sort((a, b) => a.id.localeCompare(b.id));
          const entries = rows.map((row) => ({
            id: row.id,
            hash: digest(JSON.stringify(row)),
            row,
          }));
          const firstRecordId = entries[0].id;
          const lastRecordId = entries.at(-1).id;
          const id = digest(
            JSON.stringify([monthId, firstRecordId, lastRecordId]),
          );
          const batch = {
            id,
            monthId,
            firstRecordId,
            lastRecordId,
            entries,
            hash: digest(JSON.stringify(entries)),
          };
          const json = JSON.stringify(batch);
          // A bounded checkpoint remains comfortably below Firestore's document limit.
          if (Buffer.byteLength(json, "utf8") > 900_000)
            throw canonicalError("LEDGER_BATCH_TOO_LARGE");
          const ref = ownerRef
            .collection("gameplay")
            .doc(monthId)
            .collection("ledger")
            .doc(id);
          const snap = await tx.get(ref);
          if (snap.exists && snap.data().json !== json)
            throw canonicalError("LEDGER_CONFLICT");
          if (!snap.exists) ledgerWrites.push({ ref, json, batch });
        }
        // All reads, including immutable checkpoint collision checks, precede every write.
        for (const { ref, json, batch } of ledgerWrites)
          tx.create(ref, {
            json,
            monthId: batch.monthId,
            id: batch.id,
            hash: batch.hash,
            count: batch.entries.length,
          });
        if (beforeMonths !== JSON.stringify(data.months))
          for (const [month, record] of Object.entries(data.months))
            if (record)
              tx.set(ownerRef.collection("gameplay").doc(month), {
                json: JSON.stringify(record),
                version: record.version,
                lastServerMs: record.lastServerMs,
              });
        if (currentMonth !== data.currentMonth)
          tx.set(metaRef, { currentMonth: data.currentMonth });
        for (const [month, archive] of Object.entries(data.archives))
          tx.create(
            ownerRef
              .collection("gameplay")
              .doc(month)
              .collection("archive")
              .doc("final"),
            archive,
          );
        if (receiptRef && !snaps[3].exists && data.receipts[requestId]) {
          const receipt = data.receipts[requestId];
          tx.create(receiptRef, { json: JSON.stringify(receipt) });
          tx.create(
            ownerRef
              .collection("gameplay")
              .doc(receipt.result.monthId)
              .collection("receipts")
              .doc(digest(requestId)),
            { json: JSON.stringify(receipt) },
          );
        }
        return result;
      },
      { maxAttempts: this.transactionMaxAttempts },
    );
  }
}
