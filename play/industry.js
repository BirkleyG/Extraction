/* Deterministic LOCAL industry preview. Provisional coefficients; not the CES market
 * or multiplayer authority. Transfers are immediate local facility transfers. */
export const INDUSTRY_ORES = Object.freeze(
  [
    "ferrite",
    "cobalt",
    "lithium",
    "sulfur",
    "crystal",
    "iridium",
    "mythic",
  ].map((id, i) =>
    Object.freeze({ id, basePrice: [120, 138, 126, 108, 180, 276, 480][i] }),
  ),
);
export const INDUSTRY_COSTS = Object.freeze({
  refinery: 25000,
  station: 250000,
});
const ids = INDUSTRY_ORES.map((o) => o.id),
  map = (value = 0) => Object.fromEntries(ids.map((id) => [id, value]));
const clone = (x) => structuredClone(x);
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const integer = (x) => Number.isSafeInteger(x) && x >= 0;
const qty = (x) => Number.isSafeInteger(x) && x > 0;
const stock = (x) => Number.isFinite(x) && x >= 0;
const sum = (x) => Object.values(x).reduce((a, b) => a + b, 0);
function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function refineryStats(r) {
  const l = r.levels;
  return {
    inputCapacity: 1000 * (1 + 0.04 * l.input),
    outputCapacity: 1000 * (1 + 0.04 * l.output),
    speedPerMinute: 120 * (1 + 0.04 * l.speed),
    yield: 0.7 + (0.25 * l.yield) / 1000,
  };
}
export function stationStats(s) {
  return { siloCapacity: 2000 * (1 + 0.04 * s.levels.silo) };
}
export function industryUpgradeCost(facility, line) {
  const level = facility?.levels?.[line];
  check(integer(level) && level < 1000, "Upgrade unavailable or capped");
  return Math.round(
    (["speed", "yield"].includes(line) ? 100 : 50) *
      (["speed", "yield"].includes(line) ? 1.019 : 1.0195) ** level,
  );
}
export function npcRefinedPrice(i, id) {
  check(ids.includes(id), "Unknown ore");
  return Math.max(1, Math.floor(i.market.prices[id] * 0.8));
}
function offers(i) {
  return ids.map((id) => ({
    id: `spot-${i.market.hour}-${id}`,
    oreId: id,
    units: 20 + (hash(`${i.seed}|${i.market.hour}|${id}`) % 81),
    unitPrice: i.market.prices[id],
    expiresAt: (i.market.hour + 1) * 3600,
  }));
}
export function createIndustry(seed = "local", startSecond = 0) {
  check(
    integer(startSecond) &&
      Number.isSafeInteger((Math.floor(startSecond / 3600) + 1) * 3600),
    "Invalid industry start time",
  );
  const prices = Object.fromEntries(
    INDUSTRY_ORES.map((o) => [o.id, o.basePrice]),
  );
  const i = {
    version: 1,
    seed: String(seed),
    elapsedSeconds: startSecond,
    autoRoute: false,
    accounting: { soldRefinedByOre: map() },
    refinery: null,
    station: null,
    market: {
      hour: Math.floor(startSecond / 3600),
      prices,
      lastValidPrices: { ...prices },
      supplied: map(),
      offers: [],
      completed: [],
      diagnostics: [],
    },
  };
  i.market.offers = offers(i);
  return i;
}
export function validateIndustry(i) {
  for (const id of ids)
    check(
      stock(i?.accounting?.soldRefinedByOre?.[id]) &&
        i.accounting.soldRefinedByOre[id] <= Number.MAX_SAFE_INTEGER,
      "Invalid lifetime refined sales",
    );
  check(
    i?.version === 1 &&
      typeof i.seed === "string" &&
      typeof i.autoRoute === "boolean" &&
      integer(i.elapsedSeconds),
    "Invalid industry state",
  );
  check(
    integer(i.market?.hour) &&
      i.market.hour === Math.floor(i.elapsedSeconds / 3600),
    "Invalid market clock",
  );
  for (const field of ["prices", "lastValidPrices", "supplied"])
    for (const id of ids)
      check(
        field === "supplied"
          ? stock(i.market[field]?.[id])
          : qty(i.market[field]?.[id]),
        "Invalid market values",
      );
  check(
    Array.isArray(i.market.offers) &&
      Array.isArray(i.market.completed) &&
      Array.isArray(i.market.diagnostics),
    "Invalid market records",
  );
  check(
    new Set(i.market.offers.map((o) => o.id)).size === i.market.offers.length,
    "Duplicate offer IDs",
  );
  check(
    new Set(i.market.completed).size === i.market.completed.length &&
      i.market.completed.every(
        (id) =>
          typeof id === "string" && id.startsWith(`spot-${i.market.hour}-`),
      ),
    "Invalid completed contract IDs",
  );
  check(
    i.market.completed.length <= ids.length &&
      i.market.diagnostics.length <= 24 &&
      i.market.diagnostics.every((d) => typeof d === "string"),
    "Unbounded market records",
  );
  for (const o of i.market.offers)
    check(
      typeof o.id === "string" &&
        ids.includes(o.oreId) &&
        qty(o.units) &&
        qty(o.unitPrice) &&
        integer(o.expiresAt) &&
        o.id === `spot-${i.market.hour}-${o.oreId}` &&
        !i.market.completed.includes(o.id) &&
        o.expiresAt === (i.market.hour + 1) * 3600,
      "Invalid offer",
    );
  if (i.refinery) {
    const r = i.refinery;
    for (const k of ["input", "output", "speed", "yield"])
      check(
        integer(r.levels?.[k]) && r.levels[k] <= 1000,
        "Invalid refinery level",
      );
    check(
      integer(r.budget) && stock(r.processedRaw) && stock(r.lostUnits),
      "Invalid refinery totals",
    );
    for (const k of ["input", "output"])
      for (const id of ids) check(stock(r[k]?.[id]), "Invalid refinery stock");
    const s = refineryStats(r);
    check(
      sum(r.input) <= s.inputCapacity + 1e-7 &&
        sum(r.output) <= s.outputCapacity + 1e-7,
      "Refinery storage exceeded",
    );
  }
  if (i.station) {
    const s = i.station;
    check(
      integer(s.levels?.silo) && s.levels.silo <= 1000,
      "Invalid silo level",
    );
    for (const id of ids)
      check(
        stock(s.stock?.[id]) &&
          s.stock[id] <= stationStats(s).siloCapacity + 1e-7 &&
          Number.isFinite(s.markup?.[id]) &&
          s.markup[id] >= 0 &&
          s.markup[id] <= 100,
        "Invalid station stock or markup",
      );
  }
  return true;
}
/** Pure bounded hourly price adjustment; invalid solver input keeps the last valid quote. */
export function clearIndustryMarket(prices, lastValid, supply, demand) {
  const next = {};
  let fallback = false;
  for (const id of ids) {
    const p = prices[id],
      s = supply[id],
      d = demand[id];
    if (!qty(p) || !stock(s) || !stock(d)) {
      next[id] = lastValid[id];
      fallback = true;
      continue;
    }
    const pressure = (d - s) / Math.max(1, d + s);
    next[id] = Math.max(1, Math.round(p * (1 + 0.1 * pressure)));
  }
  return { prices: next, fallback };
}
export function advanceIndustry(industry, seconds) {
  validateIndustry(industry);
  check(integer(seconds) && seconds <= 2678400, "Invalid industry duration");
  const i = clone(industry),
    events = [];
  for (let t = 0; t < seconds; t++) {
    if (i.refinery) {
      const r = i.refinery,
        s = refineryStats(r);
      let free = Math.max(0, s.outputCapacity - sum(r.output));
      for (const id of ids) {
        const raw = Math.min(
          r.input[id],
          s.speedPerMinute / 60,
          free / s.yield,
        );
        if (raw <= 0) continue;
        const out = raw * s.yield;
        r.input[id] = Math.max(0, r.input[id] - raw);
        r.output[id] += out;
        r.processedRaw += raw;
        r.lostUnits += raw - out;
        free = Math.max(0, free - out);
      }
    }
    i.elapsedSeconds++;
    if (i.elapsedSeconds % 3600 === 0) {
      const supply = {},
        demand = {};
      for (const id of ids) {
        const h = hash(`${i.seed}|${i.market.hour + 1}|${id}`);
        supply[id] = 1000 + (h % 400) + i.market.supplied[id];
        demand[id] = 1000 + ((h >>> 9) % 400);
      }
      const cleared = clearIndustryMarket(
        i.market.prices,
        i.market.lastValidPrices,
        supply,
        demand,
      );
      i.market.prices = cleared.prices;
      i.market.lastValidPrices = { ...cleared.prices };
      if (cleared.fallback)
        i.market.diagnostics.push(`fallback:${i.elapsedSeconds}`);
      i.market.diagnostics = i.market.diagnostics.slice(-24);
      i.market.hour++;
      i.market.completed = [];
      i.market.supplied = map();
      i.market.offers = offers(i);
      events.push({
        type: "industry-market",
        coinDelta: 0,
        atSecond: i.elapsedSeconds,
      });
    }
  }
  validateIndustry(i);
  return { industry: i, events };
}
export function applyIndustryAction(industry, action, context = {}) {
  validateIndustry(industry);
  check(action && typeof action.type === "string", "Invalid industry action");
  check(integer(context.coins), "Invalid coin balance");
  const i = clone(industry);
  let coinDelta = 0,
    ledgerType = "SELF_INVENTORY_TRANSFER",
    description = "",
    rawWithdrawal;
  const pay = (n, type) => {
    check(
      Number.isSafeInteger(n) &&
        Number.isSafeInteger(context.coins + n) &&
        context.coins + n >= 0,
      "Insufficient coin or coin overflow",
    );
    coinDelta = n;
    ledgerType = type;
  };
  const r = i.refinery,
    s = i.station,
    id = action.oreId,
    u = action.units;
  if (action.type === "setAutoRoute") {
    check(typeof action.enabled === "boolean", "Invalid automatic routing");
    i.autoRoute = action.enabled;
    description = action.enabled
      ? "Enabled own-refinery routing"
      : "Disabled own-refinery routing";
  } else if (action.type === "buildRefinery") {
    check(!r, "Refinery already built");
    pay(-INDUSTRY_COSTS.refinery, "SYSTEM_PURCHASE");
    i.refinery = {
      input: map(),
      output: map(),
      levels: { input: 0, output: 0, speed: 0, yield: 0 },
      budget: 0,
      processedRaw: 0,
      lostUnits: 0,
    };
    description = "Built local refinery";
  } else if (action.type === "buildStation") {
    check(!s, "Station already built");
    pay(-INDUSTRY_COSTS.station, "SYSTEM_PURCHASE");
    i.station = { stock: map(), levels: { silo: 0 }, markup: map() };
    description = "Built local orbital station";
  } else if (action.type === "upgrade") {
    const f = i[action.facility];
    check(
      ["refinery", "station"].includes(action.facility) && f,
      "Build the facility first",
    );
    const allowed =
      action.facility === "refinery"
        ? ["input", "output", "speed", "yield"]
        : ["silo"];
    check(allowed.includes(action.line), "Unknown industry upgrade");
    pay(-industryUpgradeCost(f, action.line), "SYSTEM_PURCHASE");
    f.levels[action.line]++;
    description = `Upgraded ${action.facility} ${action.line}`;
  } else if (action.type === "setStationMarkup") {
    check(
      s &&
        ids.includes(id) &&
        Number.isFinite(action.markup) &&
        action.markup >= 0 &&
        action.markup <= 100,
      "Invalid station markup",
    );
    s.markup[id] = action.markup;
    description = "Changed station asking markup";
  } else if (["fundBudget", "releaseBudget"].includes(action.type)) {
    check(r && qty(action.amount), "Invalid purchasing budget");
    const funding = action.type === "fundBudget";
    check(funding || r.budget >= action.amount, "Insufficient escrow");
    check(
      !funding || Number.isSafeInteger(r.budget + action.amount),
      "Budget overflow",
    );
    pay(
      funding ? -action.amount : action.amount,
      funding ? "ESCROW_FUND" : "ESCROW_RELEASE",
    );
    r.budget += funding ? action.amount : -action.amount;
    description = funding
      ? "Funded refinery purchasing escrow"
      : "Released unused refinery purchasing escrow";
  } else if (action.type === "acceptContract") {
    check(s, "Build a station first");
    const o = i.market.offers.find((o) => o.id === action.contractId);
    check(
      o && !i.market.completed.includes(o.id) && o.expiresAt > i.elapsedSeconds,
      "Contract unavailable",
    );
    check(s.markup[o.oreId] === 0, "Buyer declined station asking markup");
    check(s.stock[o.oreId] + 1e-9 >= o.units, "Not enough refined silo stock");
    const amount = o.units * o.unitPrice;
    pay(amount, "GALACTIC_CONTRACT_SALE");
    s.stock[o.oreId] = Math.max(0, s.stock[o.oreId] - o.units);
    check(
      Number.isSafeInteger(i.accounting.soldRefinedByOre[o.oreId] + o.units),
      "Lifetime refined sales overflow",
    );
    i.accounting.soldRefinedByOre[o.oreId] += o.units;
    i.market.supplied[o.oreId] += o.units;
    i.market.completed.push(o.id);
    i.market.offers = i.market.offers.filter((x) => x.id !== o.id);
    description = `Completed ${o.id}: ${o.units} refined ${o.oreId}`;
  } else {
    check(
      r && ids.includes(id) && qty(u),
      "Select a whole positive quantity and build a refinery",
    );
    if (action.type === "importRaw") {
      check(
        stock(context.availableRawByOre?.[id]) &&
          context.availableRawByOre[id] + 1e-9 >= u,
        "Not enough raw ore in yard",
      );
      check(
        sum(r.input) + u <= refineryStats(r).inputCapacity + 1e-9,
        "Refinery input storage full",
      );
      r.input[id] += u;
      rawWithdrawal = { oreId: id, units: u };
      description = `Moved ${u} raw ${id} into own refinery (no payment)`;
    } else if (action.type === "transferToStation") {
      check(s, "Build a station first");
      check(r.output[id] + 1e-9 >= u, "Not enough refined goods");
      check(
        s.stock[id] + u <= stationStats(s).siloCapacity + 1e-9,
        "Station silo full",
      );
      r.output[id] = Math.max(0, r.output[id] - u);
      s.stock[id] += u;
      description = `Moved ${u} refined ${id} to own station (no payment)`;
    } else if (action.type === "sellRefinedNpc") {
      check(r.output[id] + 1e-9 >= u, "Not enough refined goods");
      pay(u * npcRefinedPrice(i, id), "NPC_REFINED_PURCHASE");
      r.output[id] = Math.max(0, r.output[id] - u);
      check(
        Number.isSafeInteger(i.accounting.soldRefinedByOre[id] + u),
        "Lifetime refined sales overflow",
      );
      i.accounting.soldRefinedByOre[id] += u;
      i.market.supplied[id] += u;
      description = `Sold ${u} refined ${id} to NPC station`;
    } else
      throw new Error(
        "Unknown industry action; raw ore cannot be sold to galactic buyers",
      );
  }
  validateIndustry(i);
  return {
    industry: i,
    coinDelta,
    ledgerType,
    description,
    ...(rawWithdrawal ? { rawWithdrawal } : {}),
  };
}
