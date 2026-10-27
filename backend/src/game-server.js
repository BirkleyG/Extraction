import { createCanonicalService } from './canonical-game.js';
import { FirestoreCanonicalRepository } from './canonical-repository.js';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { FirestoreGameRepository } from './firestore-game-repository.js';
import { GameService } from './game-service.js';
import { createGameHttpServer } from './game-http.js';
import { DEFAULT_NPC_BUYERS } from './npc.js';
import { generateWorld } from './world.js';
import { validateRuntimeEnvironment } from './server.js';
import { WorldAdmin } from './world-admin.js';
import { FirestoreEventQueue } from './event-queue.js';
import { EventWorker } from './event-worker.js';
import { createHash } from 'node:crypto';

const monthOf = (ms) => `${new Date(ms).getUTCFullYear()}-${String(new Date(ms).getUTCMonth() + 1).padStart(2, '0')}`;

export function buildGameServer(env = process.env, { clock = Date.now } = {}) {
  const runtime = validateRuntimeEnvironment(env);
  const app = initializeApp({ projectId: runtime.projectId, ...(runtime.emulator ? {} : { credential: applicationDefault() }) }, `extraction-game-${runtime.projectId}`);
  const firestore = getFirestore(app);
  const repository = new FirestoreGameRepository(firestore);
  const game = new GameService(repository, { npcBuyers: DEFAULT_NPC_BUYERS });
  const canonicalRepository = new FirestoreCanonicalRepository(firestore);
  const canonical = createCanonicalService({ repository: canonicalRepository, clock, seedSecret: env.WORLD_SEED_SECRET ?? '' });
  // Handlers are registered here as event types are migrated onto the durable queue (none yet; an empty queue costs reads only).
  const eventWorker = env.WORLD_SEED_SECRET ? new EventWorker({
    queue: new FirestoreEventQueue(firestore), handlers: {}, workerId: `tick-${process.env.K_REVISION || 'local'}`,
    seedFor: ({ worldId, monthId }) => createHash('sha256').update(`${env.WORLD_SEED_SECRET}|events|${worldId}|${monthId}`).digest('hex'),
  }) : null;
  const admin = env.WORLD_SEED_SECRET ? new WorldAdmin({ eventWorker, canonical, canonicalRepository,
    firestore, game, repository, inviteCode: env.INVITE_CODE || null, seedSecret: env.WORLD_SEED_SECRET,
    maxMembers: Number(env.MAX_MEMBERS || 10), players: Number(env.WORLD_PLAYERS || 10),
  }) : null;
  const server = createGameHttpServer({ auth: getAuth(app), clock, game, canonical, admin, internalToken: env.INTERNAL_TOKEN || null, allowOrigin: env.ALLOW_ORIGIN || null });
  return { server, game, canonical, canonicalRepository, firestore, admin };
}

/** Idempotent month setup for a world: generated planet (server-only) and NPC buyer budgets. */
export async function prepareMonth(game, { worldId, monthId, seed, players, nowMs }) {
  await game.storePlanet({ worldId, monthId, planet: generateWorld({ seed, monthId, players }) });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { server } = buildGameServer();
    const port = Number(process.env.PORT || 8788);
    // Cloud Run requires listening on all interfaces; local development stays loopback-only.
    server.listen(port, process.env.K_SERVICE ? '0.0.0.0' : '127.0.0.1', () => process.stdout.write(`Game server listening on 127.0.0.1:${port}\n`));
  } catch (error) {
    process.stderr.write(`Game server startup failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
