import test from "node:test";
import assert from "node:assert/strict";
import {
  createIndustry,
  applyIndustryAction,
  advanceIndustry,
  validateIndustry,
  clearIndustryMarket,
  refineryStats,
} from "../industry.js";
const ctx = { coins: 1000000, availableRawByOre: { ferrite: 10000 } };
const action = (i, type, rest = {}) =>
  applyIndustryAction(i, { type, ...rest }, ctx);
const setup = () => action(createIndustry("test"), "buildRefinery").industry;
test("construction and escrow use exact sinks/internal transfers", () => {
  let i = createIndustry();
  assert.equal(action(i, "buildRefinery").coinDelta, -25000);
  i = setup();
  const funded = action(i, "fundBudget", { amount: 100 });
  assert.equal(funded.coinDelta, -100);
  assert.equal(funded.industry.refinery.budget, 100);
  const released = action(funded.industry, "releaseBudget", { amount: 100 });
  assert.equal(released.coinDelta, 100);
  assert.equal(released.industry.refinery.budget, 0);
  assert.throws(() => action(i, "releaseBudget", { amount: 1 }));
  assert.throws(() =>
    applyIndustryAction(i, { type: "buildStation" }, { coins: 1 }),
  );
});
test("invalid quantities, capacities and actions reject without mutation", () => {
  const i = setup(),
    before = structuredClone(i);
  for (const units of [-1, 0, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => action(i, "importRaw", { oreId: "ferrite", units }));
  assert.throws(() =>
    action(i, "importRaw", { oreId: "ferrite", units: 1001 }),
  );
  assert.throws(() =>
    action(i, "sellRawGalactic", { oreId: "ferrite", units: 1 }),
  );
  assert.deepEqual(i, before);
});
test("whole raw input refines with explicit loss and owner transfers never pay", () => {
  let i = setup();
  let result = action(i, "importRaw", { oreId: "ferrite", units: 100 });
  assert.equal(result.coinDelta, 0);
  assert.deepEqual(result.rawWithdrawal, { oreId: "ferrite", units: 100 });
  i = advanceIndustry(result.industry, 60).industry;
  assert.ok(Math.abs(i.refinery.output.ferrite - 70) < 1e-8);
  assert.ok(Math.abs(i.refinery.lostUnits - 30) < 1e-8);
  assert.equal(i.refinery.input.ferrite, 0);
  i = action(i, "buildStation").industry;
  result = action(i, "transferToStation", { oreId: "ferrite", units: 60 });
  assert.equal(result.coinDelta, 0);
  assert.equal(result.industry.station.stock.ferrite, 60);
  assert.throws(() =>
    action(result.industry, "transferToStation", {
      oreId: "ferrite",
      units: 60,
    }),
  );
});
test("NPC refined sale pays once, never sells absent inventory or overflows coin", () => {
  let i = advanceIndustry(
    action(setup(), "importRaw", { oreId: "ferrite", units: 100 }).industry,
    60,
  ).industry;
  const result = action(i, "sellRefinedNpc", { oreId: "ferrite", units: 60 });
  assert.equal(result.ledgerType, "NPC_REFINED_PURCHASE");
  assert.equal(result.coinDelta, 5760);
  assert.throws(() =>
    action(result.industry, "sellRefinedNpc", { oreId: "ferrite", units: 60 }),
  );
  assert.throws(() =>
    applyIndustryAction(
      i,
      { type: "sellRefinedNpc", oreId: "ferrite", units: 60 },
      { coins: Number.MAX_SAFE_INTEGER },
    ),
  );
});
test("hourly market catchup is identical to repeated seconds and bounded", () => {
  const i = action(setup(), "importRaw", {
    oreId: "ferrite",
    units: 1000,
  }).industry;
  const one = advanceIndustry(i, 7200);
  let many = i;
  for (let n = 0; n < 7200; n++) many = advanceIndustry(many, 1).industry;
  assert.deepEqual(one.industry, many);
  assert.equal(one.events.length, 2);
  for (const id of Object.keys(i.market.prices))
    assert.ok(
      one.industry.market.prices[id] <=
        Math.ceil(i.market.prices[id] * 1.1 ** 2) + 1,
    );
});
test("market supply pressure and last valid fallback", () => {
  const i = createIndustry(),
    s = Object.fromEntries(Object.keys(i.market.prices).map((id) => [id, 100]));
  const more = { ...s, ferrite: 1000 };
  assert.ok(
    clearIndustryMarket(i.market.prices, i.market.prices, more, s).prices
      .ferrite <=
      clearIndustryMarket(i.market.prices, i.market.prices, s, s).prices
        .ferrite,
  );
  const bad = { ...s, ferrite: NaN };
  const result = clearIndustryMarket(i.market.prices, i.market.prices, bad, s);
  assert.equal(result.fallback, true);
  assert.equal(result.prices.ferrite, i.market.prices.ferrite);
});
test("spot contracts require stock, pay once and only refined goods", () => {
  let i = action(setup(), "buildStation").industry;
  const offer = i.market.offers.find((o) => o.oreId === "ferrite");
  assert.throws(() => action(i, "acceptContract", { contractId: offer.id }));
  i = advanceIndustry(
    action(i, "importRaw", { oreId: "ferrite", units: 1000 }).industry,
    600,
  ).industry;
  i = action(i, "transferToStation", { oreId: "ferrite", units: 200 }).industry;
  const result = action(i, "acceptContract", { contractId: offer.id });
  assert.equal(result.ledgerType, "GALACTIC_CONTRACT_SALE");
  assert.equal(result.coinDelta, offer.units * offer.unitPrice);
  assert.throws(() =>
    action(result.industry, "acceptContract", { contractId: offer.id }),
  );
  assert.equal(result.industry.station.stock.ferrite, 200 - offer.units);
});
test("yield caps, storage validation and serialization remain safe", () => {
  const i = setup();
  i.refinery.levels.yield = 1000;
  assert.equal(refineryStats(i.refinery).yield, 0.95);
  assert.throws(() =>
    action(i, "upgrade", { facility: "refinery", line: "yield" }),
  );
  assert.equal(validateIndustry(JSON.parse(JSON.stringify(i))), true);
  i.refinery.input.ferrite = 1001;
  assert.throws(() => validateIndustry(i));
});

test("escrow funding and release preserve total owner coin", () => {
  let industry = setup();
  let coins = 1000;
  const initialOwned = coins + industry.refinery.budget;
  for (const [type, amount] of [
    ["fundBudget", 700],
    ["releaseBudget", 250],
    ["fundBudget", 100],
    ["releaseBudget", 550],
  ]) {
    const result = applyIndustryAction(industry, { type, amount }, { coins });
    coins += result.coinDelta;
    industry = result.industry;
    assert.equal(coins + industry.refinery.budget, initialOwned);
    assert.equal(
      result.ledgerType,
      type === "fundBudget" ? "ESCROW_FUND" : "ESCROW_RELEASE",
    );
  }
  assert.equal(coins, initialOwned);
  assert.equal(industry.refinery.budget, 0);
});

test("market history is bounded to current hour and stale contracts remain unavailable", () => {
  let industry = action(setup(), "buildStation").industry;
  const offer = industry.market.offers.find((o) => o.oreId === "ferrite");
  industry = advanceIndustry(
    action(industry, "importRaw", { oreId: "ferrite", units: 1000 }).industry,
    600,
  ).industry;
  industry = action(industry, "transferToStation", {
    oreId: "ferrite",
    units: 200,
  }).industry;
  industry = action(industry, "acceptContract", {
    contractId: offer.id,
  }).industry;
  assert.deepEqual(industry.market.completed, [offer.id]);
  industry = advanceIndustry(industry, 3000).industry;
  assert.deepEqual(industry.market.completed, []);
  assert.throws(() =>
    action(industry, "acceptContract", { contractId: offer.id }),
  );
});

test("validation rejects malformed routing and duplicate market records", () => {
  for (const mutate of [
    (i) => {
      i.autoRoute = "true";
    },
    (i) => {
      i.market.offers.push({ ...i.market.offers[0] });
    },
    (i) => {
      i.market.completed = ["spot-0-ferrite", "spot-0-ferrite"];
    },
    (i) => {
      i.market.completed = ["spot-9-ferrite"];
    },
    (i) => {
      i.market.diagnostics = Array(25).fill("fallback");
    },
  ]) {
    const industry = createIndustry();
    mutate(industry);
    assert.throws(() => validateIndustry(industry));
  }
});

test("yield follows the exact registered coefficient across levels", () => {
  const industry = setup();
  for (const level of [0, 1, 100, 500, 999, 1000]) {
    industry.refinery.levels.yield = level;
    assert.equal(
      refineryStats(industry.refinery).yield,
      0.7 + (0.25 * level) / 1000,
    );
  }
});

test("existing saves anchor industry at present without historical earnings or processing", () => {
  const industry = createIndustry("old-save", 100123);
  assert.equal(industry.elapsedSeconds, 100123);
  assert.equal(industry.market.hour, Math.floor(100123 / 3600));
  assert.equal(industry.refinery, null);
  assert.equal(industry.station, null);
  assert.deepEqual(industry.market.completed, []);
  assert.equal(industry.market.supplied.ferrite, 0);
  assert.equal(industry.market.prices.ferrite, 120);
  assert.ok(
    industry.market.offers.every(
      (offer) => offer.id.startsWith("spot-27-") && offer.expiresAt === 100800,
    ),
  );
  assert.equal(validateIndustry(industry), true);
  const advanced = advanceIndustry(industry, 1);
  assert.deepEqual(advanced.events, []);
  assert.equal(advanced.industry.elapsedSeconds, 100124);
  assert.equal(advanced.industry.market.hour, 27);
  for (const invalid of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => createIndustry("bad", invalid));
  }
  assert.deepEqual(createIndustry("same"), createIndustry("same", 0));
});

test("lifetime refined sales preserve ore accounting across clearing and failed retries", () => {
  let industry = action(setup(), "buildStation").industry;
  industry = action(industry, "importRaw", {
    oreId: "ferrite",
    units: 1000,
  }).industry;
  industry = advanceIndustry(industry, 600).industry;
  industry = action(industry, "sellRefinedNpc", {
    oreId: "ferrite",
    units: 100,
  }).industry;
  industry = action(industry, "transferToStation", {
    oreId: "ferrite",
    units: 200,
  }).industry;
  const offer = industry.market.offers.find((o) => o.oreId === "ferrite");
  industry = action(industry, "acceptContract", {
    contractId: offer.id,
  }).industry;
  assert.equal(industry.accounting.soldRefinedByOre.ferrite, 100 + offer.units);
  const beforeRetry = structuredClone(industry);
  assert.throws(() =>
    action(industry, "acceptContract", { contractId: offer.id }),
  );
  assert.deepEqual(industry, beforeRetry);
  industry = advanceIndustry(industry, 3600).industry;
  assert.equal(industry.market.supplied.ferrite, 0);
  const accounted =
    industry.refinery.input.ferrite +
    industry.refinery.output.ferrite +
    industry.station.stock.ferrite +
    industry.accounting.soldRefinedByOre.ferrite +
    industry.refinery.lostUnits;
  assert.ok(Math.abs(1000 - accounted) < 1e-7);
  assert.equal(industry.accounting.soldRefinedByOre.ferrite, 100 + offer.units);
});
