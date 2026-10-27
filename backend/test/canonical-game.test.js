import test from "node:test";
import assert from "node:assert/strict";
import { createCanonicalService } from "../src/canonical-game.js";
import { MemoryCanonicalRepository } from "../src/canonical-repository.js";
import { stepGame } from "../src/gameplay/model.js";
const t = Date.UTC(2026, 9, 27, 12);
async function fixture(maxSteps = 300) {
  const repository = new MemoryCanonicalRepository();
  await repository.updateWorldMembership("w", "u");
  return {
    repository,
    service: createCanonicalService({ repository, clock: () => t, maxSteps }),
  };
}
const ctx = { worldId: "w", uid: "u" };
const code = (expected) => (error) => error.code === expected;
test("fresh server game uses shared model, no wallet grant; validates ownership and injected outcomes", async () => {
  const { service } = await fixture();
  const initial = await service.state(ctx);
  assert.equal(initial.state.coins, 0);
  assert.equal(initial.state.production.surface.unitsByOre[0].units, 10);
  await assert.rejects(
    service.state({ ...ctx, uid: "intruder" }),
    code("FORBIDDEN"),
  );
  for (const payload of [{ coins: 100 }, { seed: "x" }, { elapsed: 100000 }])
    await assert.rejects(
      service.command({ ...ctx, requestId: "bad", kind: "dispatch", payload }),
      code("INJECTED_FIELD"),
    );
  await assert.rejects(
    service.command({ ...ctx, requestId: "grant", kind: "grant", payload: {} }),
    code("INVALID_COMMAND"),
  );
});
test("dispatch and retry races pay once, persist immutable rows, and upgrades use checked ledger", async () => {
  const { service, repository } = await fixture();
  await service.state(ctx);
  const intent = {
    ...ctx,
    requestId: "sale",
    kind: "dispatch",
    payload: {},
    expectedVersion: 1,
  };
  const [a, b] = await Promise.all([
    service.command(intent),
    service.command(intent),
  ]);
  assert.deepEqual(a, b);
  assert(a.state.coins > 0);
  await assert.rejects(
    service.command({ ...intent, payload: { destinationId: "x" } }),
    code("INJECTED_FIELD"),
  );
  const upgraded = await service.command({
    ...ctx,
    requestId: "upgrade",
    kind: "upgrade",
    payload: { type: "pick", count: 1 },
    expectedVersion: a.version,
  });
  assert.equal(upgraded.state.upgrades.pick, 1);
  assert(upgraded.state.coins < a.state.coins);
  const stored = repository.records.get(JSON.stringify(["w", "u"]));
  assert.equal(Object.keys(stored.ledger).length, 2);
  assert.equal(
    upgraded.state.ledger.reduce((sum, row) => sum + row.ownerDelta, 0),
    upgraded.state.coins,
  );
  assert.deepEqual(await service.command(intent), a);
});
test("bounded catch-up checkpoints before rejecting intent; no lost fractional wall time, exact shared replay", async () => {
  const { service } = await fixture(3);
  const first = await service.state({ ...ctx, nowMs: t + 125 });
  let direct = first.state;
  for (let i = 0; i < 10; i++) direct = stepGame(direct);
  await assert.rejects(
    service.command({
      ...ctx,
      nowMs: t + 10500,
      requestId: "later",
      kind: "policy",
      payload: { auto: false },
    }),
    (error) =>
      error.code === "CATCHING_UP" && error.snapshot.state.simSeconds === 3,
  );
  let result;
  do {
    result = await service.state({ ...ctx, nowMs: t + 10500 });
  } while (result.catchingUp);
  assert.deepEqual(result.state, direct);
  const still = await service.state({ ...ctx, nowMs: t + 11000 });
  assert.equal(still.state.simSeconds, 10);
  const tick = await service.state({ ...ctx, nowMs: t + 11125 });
  assert.equal(tick.state.simSeconds, 11);
});
test("month closing catches up exclusively before boundary and archives owned coin once", async () => {
  const { repository, service } = await fixture(3);
  const start = Date.UTC(2026, 9, 31, 23, 59, 55);
  await service.state({ ...ctx, nowMs: start });
  const sale = await service.command({
    ...ctx,
    nowMs: start,
    requestId: "old-sale",
    kind: "dispatch",
    payload: {},
  });
  const end = Date.UTC(2026, 10, 1);
  const partial = await service.state({ ...ctx, nowMs: end });
  assert(partial.closing);
  assert.equal(partial.monthId, "2026-10");
  const fresh = await service.state({ ...ctx, nowMs: end });
  assert.equal(fresh.monthId, "2026-11");
  assert.equal(fresh.state.coins, 0);
  assert.equal(fresh.state.simSeconds, 0);
  const record = repository.records.get(JSON.stringify(["w", "u"]));
  assert.equal(record.archives["2026-10"].ownedCoin, sale.state.coins);
  assert.equal(record.months["2026-10"].state.simSeconds, 4);
  const oldState = record.months["2026-10"].state;
  assert.equal(oldState.coins, 0);
  assert.equal(
    oldState.ledger.filter((row) => row.type === "MONTH_CLOSE_BURN").length,
    1,
  );
  assert(
    Object.values(oldState.shipmentStatusById).every(
      (status) => status === "DELIVERED",
    ),
  );
  assert(
    oldState.shipments.some(
      (shipment) => shipment.arrivalAtSecond > oldState.simSeconds,
    ),
  );
  assert.equal(
    oldState.ledger.reduce((sum, row) => sum + row.ownerDelta, 0),
    0,
  );
  assert.deepEqual(
    await service.command({
      ...ctx,
      nowMs: end,
      requestId: "old-sale",
      kind: "dispatch",
      payload: {},
    }),
    sale,
  );
});

test("industry purchase, routing, refined sale and escrow use the same server model ledger", async () => {
  const { service, repository } = await fixture();
  let now = t;
  let result = await service.state({ ...ctx, nowMs: now });
  assert.deepEqual(await repository.listMembers("w"), ["u"]);
  now += 8 * 3600_000;
  do {
    result = await service.state({ ...ctx, nowMs: now });
  } while (result.catchingUp);
  let id = 0;
  const act = (action) =>
    service.command({
      ...ctx,
      nowMs: now,
      requestId: `industry-${++id}`,
      kind: "industry",
      payload: { action },
    });
  result = await act({ type: "buildRefinery" });
  const ownedBefore = result.state.coins;
  result = await act({ type: "fundBudget", amount: 100 });
  assert.equal(result.state.coins, ownedBefore - 100);
  assert.equal(result.state.industry.refinery.budget, 100);
  result = await act({ type: "releaseBudget", amount: 50 });
  assert.equal(result.state.coins, ownedBefore - 50);
  await act({ type: "setAutoRoute", enabled: true });
  now += 180_000;
  result = await service.state({ ...ctx, nowMs: now });
  const [oreId, stock] = Object.entries(
    result.state.industry.refinery.output,
  ).find(([, units]) => units >= 1);
  const beforeSale = result.state.coins;
  result = await act({ type: "sellRefinedNpc", oreId, units: 1 });
  assert(result.state.coins > beforeSale);
  result = await act({ type: "buildStation" });
  const offer = result.state.industry.market.offers.find(
    (row) => row.oreId === oreId,
  );
  assert(result.state.industry.refinery.output[oreId] >= offer.units);
  result = await act({ type: "transferToStation", oreId, units: offer.units });
  const beforeContract = result.state.coins;
  result = await act({ type: "acceptContract", contractId: offer.id });
  assert.equal(
    result.state.coins,
    beforeContract + offer.units * offer.unitPrice,
  );
  assert(result.state.industry.market.completed.includes(offer.id));
  const rows = result.state.ledger;
  assert.equal(
    rows.reduce(
      (n, row) => n + row.ownerDelta,
      result.state.historyArchive.ledger.ownerDelta,
    ),
    result.state.coins,
  );
  assert.equal(
    rows.reduce(
      (n, row) => n + (row.escrowDelta ?? 0),
      result.state.historyArchive.ledger.escrowDelta,
    ),
    50,
  );
  const stored = repository.records.get(JSON.stringify(["w", "u"]));
  assert(Object.keys(stored.ledger).length > result.state.ledger.length);
  await assert.rejects(
    act({ type: "fundBudget", amount: 1, coins: 999 }),
    code("INJECTED_FIELD"),
  );
});

test("request IDs are opaque strings and background roster only includes initialized active members", async () => {
  const { service, repository } = await fixture();
  await repository.updateWorldMembership("w", "legacy-only");
  assert.deepEqual(await repository.listMembers("w"), []);
  await service.state(ctx);
  assert.deepEqual(await repository.listMembers("w"), ["u"]);
  const intent = {
    ...ctx,
    kind: "dispatch",
    requestId: "__proto__",
    payload: {},
  };
  const first = await service.command(intent);
  assert.deepEqual(await service.command(intent), first);
  repository.members.get(JSON.stringify(["w", "u"])).status = "removed";
  assert.deepEqual(await repository.listMembers("w"), []);
  await assert.rejects(service.command(intent), code("FORBIDDEN"));
});

test("private alpha owners have equal month starts without sharing mutable state", async () => {
  const { repository, service } = await fixture();
  await repository.updateWorldMembership("w", "other");
  const one = await service.state(ctx);
  const two = await service.state({ ...ctx, uid: "other" });
  assert.deepEqual(one.state, two.state);
  assert.equal(one.cosmeticSeed, two.cosmeticSeed);
  await service.command({
    ...ctx,
    kind: "dispatch",
    payload: {},
    requestId: "owner-sale",
  });
  const unchanged = await service.state({ ...ctx, uid: "other" });
  assert.deepEqual(unchanged.state, two.state);
});

test("Maker dispatch persists validated cosmetics without changing economy or inventing facts", async () => {
  const { createMakerBrief, fallbackMakerContent } =
    await import("../src/gameplay/presentation.js");
  const { DESTINATIONS } = await import("../src/gameplay/model.js");
  const { service, repository } = await fixture();
  await service.state(ctx);
  const sale = await service.command({
    ...ctx,
    kind: "dispatch",
    requestId: "maker-sale",
    payload: {},
  });
  const brief = createMakerBrief({
    buyers: DESTINATIONS,
    events: sale.state.log
      .slice(-5)
      .map((event, index) => ({ id: `event-${index}`, text: event.message })),
  });
  const content = fallbackMakerContent(brief);
  const saved = await service.command({
    ...ctx,
    kind: "maker",
    requestId: "maker-save",
    payload: { content, how: "fallback" },
  });
  assert.deepEqual(saved.state.maker, {
    content,
    how: "fallback",
    status: "Colony dispatch saved online.",
  });
  const cosmeticFree = structuredClone(saved.state);
  delete cosmeticFree.maker;
  assert.deepEqual(cosmeticFree, sale.state);
  const restarted = createCanonicalService({ repository, clock: () => t });
  assert.deepEqual((await restarted.state(ctx)).state.maker, saved.state.maker);
  const initialLedger = Object.keys(
    repository.records.get(JSON.stringify(["w", "u"])).ledger,
  ).length;
  const forgedNews = structuredClone(content);
  forgedNews.news[0].text = "Invented payment: 999999 coins";
  await assert.rejects(
    service.command({
      ...ctx,
      kind: "maker",
      requestId: "fake-news",
      payload: { content: forgedNews, how: "ai" },
    }),
    code("INVALID_COMMAND"),
  );
  const forgedCoins = { ...structuredClone(content), coins: 999999 };
  await assert.rejects(
    service.command({
      ...ctx,
      kind: "maker",
      requestId: "fake-coins",
      payload: { content: forgedCoins, how: "ai" },
    }),
    code("INVALID_COMMAND"),
  );
  const forgedFacility = structuredClone(content);
  forgedFacility.facilities.push({ id: "station", name: "Imaginary Works" });
  await assert.rejects(
    service.command({
      ...ctx,
      kind: "maker",
      requestId: "fake-facility",
      payload: { content: forgedFacility, how: "ai" },
    }),
    code("INVALID_COMMAND"),
  );
  assert.equal(
    Object.keys(repository.records.get(JSON.stringify(["w", "u"])).ledger)
      .length,
    initialLedger,
  );
  assert.deepEqual((await restarted.state(ctx)).state.maker, saved.state.maker);
});
