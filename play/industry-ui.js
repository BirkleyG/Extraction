import {
  INDUSTRY_ORES,
  INDUSTRY_COSTS,
  refineryStats,
  stationStats,
  industryUpgradeCost,
  npcRefinedPrice,
} from "./industry.js";

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
const whole = (value) =>
  Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
const total = (stock) =>
  Object.values(stock || {}).reduce(
    (sum, value) => sum + (Number.isFinite(value) && value >= 0 ? value : 0),
    0,
  );
const oreIds = new Set(INDUSTRY_ORES.map((ore) => ore.id));
const yard = (state, id) =>
  whole(
    state.production?.surface?.unitsByOre?.find((row) => row.oreId === id)
      ?.units,
  );
const button = (action, label, data = {}, disabled = false, cls = "") =>
  `<button type="button" class="buy sm ${cls}" data-industry="${escape(action)}"${Object.entries(
    data,
  )
    .map(([key, value]) => ` data-${key}="${escape(value)}"`)
    .join("")}${disabled ? " disabled" : ""}>${label}</button>`;
const meter = (value, capacity, label, fmt) =>
  `<div class="d">${escape(label)}: ${escape(fmt(value))} / ${escape(fmt(capacity))} u</div><div class="meter" role="meter" aria-label="${escape(label)}" aria-valuemin="0" aria-valuemax="${capacity}" aria-valuenow="${Math.min(capacity, value)}"><i style="width:${Math.max(0, Math.min(100, capacity > 0 ? (value / capacity) * 100 : 0))}%"></i></div>`;

/** Render the local industry read model. No clocks, writes or hidden market fields. */
export function renderIndustry(state, helpers = {}) {
  const fmt =
    helpers.fmt ||
    ((value) =>
      Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const names = new Map(
    (helpers.ores || helpers.ORES || INDUSTRY_ORES).map((ore) => [
      ore.id,
      ore.name || ore.id,
    ]),
  );
  const name = (id) => escape(names.get(id) || id);
  const ind = state.industry;
  if (!ind)
    return '<h2>Industry</h2><div class="note">Industry is available in the local sandbox. Start a local mine to build your supply chain.</div>';
  const facilityName = (id, fallback) =>
    escape(
      state.maker?.content?.facilities?.find((facility) => facility.id === id)
        ?.name || fallback,
    );
  const r = ind.refinery;
  const s = ind.station;
  const rs = r && refineryStats(r);
  const ss = s && stationStats(s);
  const qtyButtons = (action, oreId, available, free = Infinity) => {
    const max = Math.min(
      whole(available),
      whole(Number.isFinite(free) ? free : available),
    );
    return `<div class="btnrow">${[10, 100].map((units) => button(action, `${units} u`, { ore: oreId, units }, max < units, "ghost")).join("")}${button(action, `All (${escape(fmt(max))})`, { ore: oreId, units: max }, max < 1)}</div>`;
  };
  const upgrade = (facility, line, label, effect) => {
    const asset = facility === "refinery" ? r : s;
    let cost;
    try {
      cost = industryUpgradeCost(asset, line);
    } catch {
      cost = null;
    }
    return `<div class="row"><div><div class="t">${escape(label)} <span class="own">Lv ${whole(asset.levels[line])}</span></div><div class="d">${escape(effect)}</div></div>${button("upgrade", Number.isSafeInteger(cost) ? `${escape(fmt(cost))} ◉` : "At cap", { facility, line }, !Number.isSafeInteger(cost) || cost < 1 || state.coins < cost)}</div>`;
  };
  let html =
    '<h2>Industry</h2><p class="lede">Mine → refinery → station → buyers. Build a business around the ore you already produce.</p><div class="note">Single-player · local sandbox. Construction, offers and transport are provisional playtest fixtures. Only published offers are shown.</div>';
  html += `<h3>${facilityName("refinery", "Your refinery")}</h3>`;
  if (!r)
    html += `<div class="row"><div><div class="t">Build a refinery</div><div class="d">Convert your raw ore into refined goods. Base yield: 70%.</div></div>${button("buildRefinery", `${escape(fmt(INDUSTRY_COSTS.refinery))} ◉`, {}, state.coins < INDUSTRY_COSTS.refinery)}</div>`;
  else {
    const input = total(r.input);
    const output = total(r.output);
    html += `<div class="devbox"><b>Refining line</b><p class="d">${escape(fmt(rs.speedPerMinute))} raw u/min per ore · ${escape(fmt(rs.yield * 100))}% yield. ${output >= rs.outputCapacity ? "Output full — sell or transfer goods." : input ? "Processing stored ore." : "Waiting for raw ore."}</p>${meter(input, rs.inputCapacity, "Raw input", fmt)}${meter(output, rs.outputCapacity, "Refined output", fmt)}<div class="btnrow">${button("setAutoRoute", ind.autoRoute ? "Auto-route: ON" : "Auto-route: OFF", { enabled: !ind.autoRoute }, false, ind.autoRoute ? "ok" : "ghost")}</div><p class="d">Auto-route sends available yard ore to your refinery. Transfers arrive immediately in this local preview and earn no coin.</p></div>`;
    const outputPolicy = ind.outputPolicy ?? "hold";
    html += `<div class="devbox"><b>Refined output policy</b><div class="btnrow">${[
      ["hold", "Hold / manual"],
      ["npc", "Auto-sell to NPC"],
      ["station", "Auto-fill own station"],
    ]
      .map(([policy, label]) =>
        button(
          "setOutputPolicy",
          label,
          { policy },
          policy === "station" && !s,
          outputPolicy === policy ? "ok" : "ghost",
        ),
      )
      .join(
        "",
      )}</div><p class="d">Every 30 simulation seconds, move whole available output using the selected policy. NPC sales use the current bid; own-station transfers earn no coin and wait when a silo is full. Station contracts remain manual.</p></div>`;
    html +=
      '<div class="rows">' +
      INDUSTRY_ORES.map(
        ({ id }) =>
          `<div class="devbox"><b>${name(id)}</b><div class="d">Yard: ${escape(fmt(yard(state, id)))} u · input: ${escape(fmt(whole(r.input[id])))} u · refined: ${escape(fmt(whole(r.output[id])))} u</div><div class="d">Send raw ore to refinery</div>${qtyButtons("importRaw", id, yard(state, id), rs.inputCapacity - input)}<div class="d">Sell refined to NPC station · ${escape(fmt(npcRefinedPrice(ind, id)))} ◉/u · paid immediately in this local preview</div>${qtyButtons("sellRefinedNpc", id, r.output[id])}${s ? `<div class="d">Send refined to your station</div>${qtyButtons("transferToStation", id, r.output[id], ss.siloCapacity - whole(s.stock[id]))}` : ""}</div>`,
      ).join("") +
      "</div>";
    html +=
      '<h3>Refinery upgrades</h3><div class="rows">' +
      upgrade(
        "refinery",
        "speed",
        "Processing speed",
        `${fmt(rs.speedPerMinute)} raw units per minute`,
      ) +
      upgrade(
        "refinery",
        "yield",
        "Refining yield",
        `${fmt(rs.yield * 100)}% of raw input becomes refined goods; cap 95%`,
      ) +
      upgrade(
        "refinery",
        "input",
        "Input storage",
        `${fmt(rs.inputCapacity)} raw units`,
      ) +
      upgrade(
        "refinery",
        "output",
        "Output storage",
        `${fmt(rs.outputCapacity)} refined units`,
      ) +
      "</div>";
    html += `<div class="note">At this yield, 100 raw units produce about ${escape(fmt(rs.yield * 100))} refined units. NPC revenue for that batch of ${name(state.site?.commonOreId || "ferrite")}: approximately ${escape(fmt(Math.floor(rs.yield * 100) * npcRefinedPrice(ind, state.site?.commonOreId || "ferrite")))} ◉ before the raw ore’s sale opportunity and construction costs. Ownership does not guarantee a higher margin.</div>`;
  }
  html += `<h3>${facilityName("station", "Your space station")}</h3>`;
  if (!s)
    html += `<div class="row"><div><div class="t">Build a space station</div><div class="d">Stock refined goods and accept published buyer contracts.</div></div>${button("buildStation", `${escape(fmt(INDUSTRY_COSTS.station))} ◉`, {}, state.coins < INDUSTRY_COSTS.station)}</div>`;
  else {
    html += `<div class="devbox"><b>Station silos</b><p class="d">${escape(fmt(ss.siloCapacity))} u capacity per product · transfers arrive immediately in this local preview.</p><div class="chips">${INDUSTRY_ORES.map(({ id }) => `<span class="chip">${name(id)} ${escape(fmt(whole(s.stock[id])))} u</span>`).join("")}</div></div><div class="rows">${upgrade("station", "silo", "Silo storage", `${fmt(ss.siloCapacity)} refined units`)}</div>`;
  }
  const offers = (ind.market?.offers || []).filter(
    (offer) => offer.expiresAt > ind.elapsedSeconds,
  );
  html +=
    '<h3>Published galactic contracts</h3><p class="d">Spot orders use goods already in your station. Revenue posts when the contract completes.</p><div class="rows">';
  html += offers.length
    ? offers
        .map(
          (offer) =>
            `<div class="row"><div><div class="t">${name(offer.oreId)} · ${escape(fmt(offer.units))} u</div><div class="d">${escape(fmt(offer.unitPrice))} ◉/u · ${escape(fmt(offer.units * offer.unitPrice))} ◉ total · expires in ${Math.max(0, Math.ceil(offer.expiresAt - ind.elapsedSeconds))}s</div></div>${button("acceptContract", "Accept order", { contract: offer.id }, !s || whole(s.stock[offer.oreId]) < offer.units)}</div>`,
        )
        .join("")
    : '<div class="note">No live offers. New buyers publish orders as simulation time advances.</div>';
  html += "</div>";
  if (ind.market?.completed?.length)
    html += `<h3>Completed business</h3><div class="note">${ind.market.completed.length} contracts completed. Contract receipts and NPC sales appear in Records.</div>`;
  return html;
}

/** Parse only known UI commands. The engine must still atomically validate inventory/funds. */
export function actionFromIndustryButton(element, state) {
  const d = element?.dataset;
  if (!d?.industry || element.disabled || !state?.industry) return null;
  const type = d.industry;
  if (type === "buildRefinery" || type === "buildStation") return { type };
  if (type === "setAutoRoute" && /^(true|false)$/.test(d.enabled || ""))
    return { type, enabled: d.enabled === "true" };
  if (type === "setOutputPolicy") {
    if (
      !["hold", "npc", "station"].includes(d.policy) ||
      (d.policy === "station" && !state.industry.station)
    )
      return null;
    return { type, policy: d.policy };
  }
  if (type === "upgrade") {
    const lines =
      d.facility === "refinery"
        ? ["input", "output", "speed", "yield"]
        : d.facility === "station"
          ? ["silo"]
          : [];
    return lines.includes(d.line)
      ? { type, facility: d.facility, line: d.line }
      : null;
  }
  if (["importRaw", "transferToStation", "sellRefinedNpc"].includes(type)) {
    if (!oreIds.has(d.ore) || !/^[1-9]\d*$/.test(d.units || "")) return null;
    const units = Number(d.units);
    return Number.isSafeInteger(units) ? { type, oreId: d.ore, units } : null;
  }
  if (
    type === "acceptContract" &&
    typeof d.contract === "string" &&
    state.industry.market?.offers?.some(
      (offer) =>
        offer.id === d.contract &&
        offer.expiresAt > state.industry.elapsedSeconds,
    )
  )
    return { type, contractId: d.contract };
  return null;
}
