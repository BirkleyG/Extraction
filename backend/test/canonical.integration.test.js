import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createCanonicalService } from "../src/canonical-game.js";
import {
  FirestoreCanonicalRepository,
  digest,
} from "../src/canonical-repository.js";
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
test(
  "canonical Firestore transactions persist shared model, receipts, ledger and deny other owners",
  { skip: !enabled },
  async () => {
    assert.equal(process.env.FIREBASE_PROJECT_ID, "demo-extraction");
    const { initializeApp, deleteApp } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    const app = initializeApp(
      { projectId: "demo-extraction" },
      `canonical-${randomUUID()}`,
    );
    const db = getFirestore(app);
    try {
      const worldId = `canonical-${randomUUID()}`,
        uid = "owner",
        scope = { worldId, uid };
      let now = Date.UTC(2026, 9, 31, 23, 59, 55);
      const world = db.collection("worlds").doc(digest(worldId));
      await world.set({ worldId, status: "active" });
      const owner = world.collection("owners").doc(digest(uid));
      await owner.set({ uid, status: "active" });
      const make = () =>
        createCanonicalService({
          repository: new FirestoreCanonicalRepository(db),
          clock: () => now,
        });
      const a = make(),
        b = make();
      const repo = new FirestoreCanonicalRepository(db);
      assert.deepEqual(await repo.listMembers(worldId), []);
      const first = await a.state(scope);
      assert.equal(first.state.coins, 0);
      assert.deepEqual(await repo.listMembers(worldId), [uid]);
      const command = {
        ...scope,
        kind: "dispatch",
        requestId: "once",
        payload: {},
        expectedVersion: first.version,
      };
      const [one, two] = await Promise.all([
        a.command(command),
        b.command(command),
      ]);
      assert.deepEqual(one, two);
      assert.deepEqual(await make().command(command), one);
      const ledger = await owner
        .collection("gameplay")
        .doc("2026-10")
        .collection("ledger")
        .get();
      assert.equal(ledger.size, 1);
      const batch = JSON.parse(ledger.docs[0].data().json);
      assert.equal(batch.hash, digest(JSON.stringify(batch.entries)));
      const rows = batch.entries.map((entry) => {
        assert.equal(entry.id, entry.row.id);
        assert.equal(entry.hash, digest(JSON.stringify(entry.row)));
        return entry.row;
      });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].ownerDelta, one.state.coins);
      await assert.rejects(
        a.state({ worldId, uid: "another" }),
        (error) => error.code === "FORBIDDEN",
      );
      await owner.update({ status: "removed" });
      await assert.rejects(
        a.command(command),
        (error) => error.code === "FORBIDDEN",
      );

      await owner.update({ status: "active" });
      now = Date.UTC(2026, 10, 1);
      const fresh = await make().state(scope);
      assert.equal(fresh.monthId, "2026-11");
      assert.equal(fresh.state.coins, 0);
      assert.deepEqual(await make().command(command), one);
      const old = JSON.parse(
        (await owner.collection("gameplay").doc("2026-10").get()).data().json,
      );
      assert.equal(old.state.coins, 0);
      assert(old.closed);
      const archived = await owner
        .collection("gameplay")
        .doc("2026-10")
        .collection("archive")
        .doc("final")
        .get();
      assert.equal(archived.data().ownedCoin, one.state.coins);
      const closedLedger = await owner
        .collection("gameplay")
        .doc("2026-10")
        .collection("ledger")
        .get();
      assert.equal(closedLedger.size, 2);
      const closedRows = closedLedger.docs.flatMap((doc) =>
        JSON.parse(doc.data().json).entries.map((entry) => entry.row),
      );
      assert.equal(
        closedRows.filter((row) => row.type === "NPC_RAW_PURCHASE").length,
        1,
      );
      assert.equal(
        closedRows.filter((row) => row.type === "MONTH_CLOSE_BURN").length,
        1,
      );
      assert.equal(
        closedRows.reduce((sum, row) => sum + row.ownerDelta, 0),
        0,
      );
      now += 300_000;
      const advanced = await make().state(scope);
      const newMonthRef = owner.collection("gameplay").doc("2026-11");
      const newLedger = await newMonthRef.collection("ledger").get();
      assert.equal(
        newLedger.size,
        1,
        "many logical events use one immutable checkpoint document",
      );
      const checkpoint = JSON.parse(newLedger.docs[0].data().json);
      assert(checkpoint.entries.length > 1);
      assert.equal(
        new Set(checkpoint.entries.map((entry) => entry.id)).size,
        checkpoint.entries.length,
      );
      assert.equal(
        checkpoint.entries.reduce(
          (sum, entry) => sum + entry.row.ownerDelta,
          0,
        ),
        advanced.state.coins,
      );
      const beforeCollision = (await newMonthRef.get()).data().json;
      await assert.rejects(
        repo.transact(scope, async (data) => {
          for (const entry of checkpoint.entries) {
            const row = { ...entry.row };
            if (row.id === checkpoint.firstRecordId)
              row.description = "Conflicting immutable record";
            data.ledger[`${row.monthId}:${row.id}`] = row;
          }
          data.months["2026-11"].state.coins += 1;
        }),
        (error) => error.code === "LEDGER_CONFLICT",
      );
      assert.equal(
        (await newMonthRef.get()).data().json,
        beforeCollision,
        "ledger collision rolls back the entire checkpoint",
      );
    } finally {
      await deleteApp(app);
    }
  },
);
