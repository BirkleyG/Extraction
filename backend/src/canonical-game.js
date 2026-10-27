import {
  createGameState,
  stepGame,
  validateGameState,
  purchaseUpgrade,
  buyNextShaft,
  dispatchNow,
  industryCommand,
  frontierCommand,
  setAutoLaunch,
  selectDestination,
  DESTINATIONS,
} from "./gameplay/model.js";
import {
  createMakerBrief,
  validateMakerContent,
} from "./gameplay/presentation.js";
import { canonicalError, digest } from "./canonical-repository.js";
const fail = (code) => {
  throw canonicalError(code);
};
const clone = (value) => structuredClone(value);
const keys = (value, allowed) => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("INVALID_COMMAND");
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    fail("INJECTED_FIELD");
};
const industryKeys = {
  setOutputPolicy: ["policy"],
  setAutoRoute: ["enabled"],
  buildRefinery: [],
  buildStation: [],
  upgrade: ["facility", "line"],
  setStationMarkup: ["oreId", "markup"],
  fundBudget: ["amount"],
  releaseBudget: ["amount"],
  acceptContract: ["contractId"],
  importRaw: ["oreId", "units"],
  transferToStation: ["oreId", "units"],
  sellRefinedNpc: ["oreId", "units"],
};
function validateCommand(kind, payload) {
  const allowed = {
    upgrade: ["type", "count", "shaftNumber"],
    shaft: [],
    dispatch: [],
    industry: ["action"],
    frontier: [],
    policy: ["auto", "destinationId"],
    maker: ["content", "how"],
  };
  if (!Object.hasOwn(allowed, kind)) fail("INVALID_COMMAND");
  keys(payload, allowed[kind]);
  if (kind === "maker" && !["ai", "fallback"].includes(payload.how))
    fail("INVALID_COMMAND");
  if (kind === "industry") {
    const action = payload.action;
    if (!action || !Object.hasOwn(industryKeys, action.type))
      fail("INVALID_COMMAND");
    keys(action, ["type", ...industryKeys[action.type]]);
  }
  if (
    kind === "upgrade" &&
    (typeof payload.type !== "string" ||
      !(
        payload.count === "max" ||
        (Number.isSafeInteger(payload.count ?? 1) && (payload.count ?? 1) > 0)
      ) ||
      !Number.isSafeInteger(payload.shaftNumber ?? 1) ||
      (payload.shaftNumber ?? 1) < 1)
  )
    fail("INVALID_COMMAND");
  if (
    kind === "policy" &&
    ((payload.auto !== undefined && typeof payload.auto !== "boolean") ||
      (payload.destinationId !== undefined &&
        typeof payload.destinationId !== "string"))
  )
    fail("INVALID_COMMAND");
}
function apply(state, kind, p) {
  switch (kind) {
    case "upgrade":
      return purchaseUpgrade(state, p.type, {
        count: p.count ?? 1,
        shaftNumber: p.shaftNumber ?? 1,
      });
    case "shaft":
      return buyNextShaft(state);
    case "dispatch":
      return dispatchNow(state);
    case "industry":
      return industryCommand(state, p.action);
    case "frontier":
      return frontierCommand(state, { type: "recruit-infantry" });
    case "maker": {
      if (!Array.isArray(p.content?.news) || p.content.news.length > 8)
        fail("INVALID_COMMAND");
      const messages = new Set(
        state.log.flatMap((event) => [
          event.message,
          event.message.slice(0, 400),
        ]),
      );
      const eventIds = new Set();
      const events = p.content.news.map((news) => {
        if (
          !news ||
          typeof news.eventId !== "string" ||
          !news.eventId ||
          news.eventId.length > 80 ||
          eventIds.has(news.eventId) ||
          !messages.has(news.text)
        )
          fail("INVALID_COMMAND");
        eventIds.add(news.eventId);
        return { id: news.eventId, text: news.text };
      });
      const brief = createMakerBrief({
        facilities: ["refinery", "station"]
          .filter((id) => state.industry?.[id])
          .map((id) => ({ id, kind: id, name: id })),
        buyers: DESTINATIONS,
        events,
      });
      if (!validateMakerContent(p.content, brief)) fail("INVALID_COMMAND");
      return {
        ...clone(state),
        maker: {
          content: clone(p.content),
          how: p.how,
          status: "Colony dispatch saved online.",
        },
      };
    }
    case "policy":
      return p.destinationId === undefined
        ? p.auto === undefined
          ? state
          : setAutoLaunch(state, p.auto)
        : selectDestination(
            p.auto === undefined ? state : setAutoLaunch(state, p.auto),
            p.destinationId,
          );
  }
}
const monthOf = (ms) => new Date(ms).toISOString().slice(0, 7);
const endOf = (month) => {
  const [year, m] = month.split("-").map(Number);
  return Date.UTC(year, m, 1);
};
function verify(record) {
  record.state = validateGameState(record.state);
  const rows = record.state.ledger;
  const archive = record.state.historyArchive?.ledger;
  const sum = rows.reduce((n, row) => {
    if (row.ownerDelta + row.externalDelta + (row.escrowDelta ?? 0) !== 0)
      fail("LEDGER_MISMATCH");
    return n + row.ownerDelta;
  }, archive?.ownerDelta ?? 0);
  const escrow = rows.reduce(
    (n, row) => n + (row.escrowDelta ?? 0),
    archive?.escrowDelta ?? 0,
  );
  if (
    sum !== record.state.coins ||
    escrow !== (record.state.industry?.refinery?.budget ?? 0)
  )
    fail("LEDGER_MISMATCH");
}
function capture(data, month, before, state) {
  for (const row of state.ledger)
    if (Number(row.id.slice(6)) >= before) {
      const id = `${month}:${row.id}`,
        entry = { ...clone(row), monthId: month };
      if (
        data.ledger[id] &&
        JSON.stringify(data.ledger[id]) !== JSON.stringify(entry)
      )
        fail("LEDGER_CONFLICT");
      data.ledger[id] = entry;
    }
}
export function createCanonicalService({
  repository,
  clock = Date.now,
  maxSteps = 300,
  seedSecret = "",
}) {
  if (
    !repository?.transact ||
    !Number.isSafeInteger(maxSteps) ||
    maxSteps < 1 ||
    maxSteps > 300
  )
    throw new TypeError("Invalid canonical service configuration");
  async function run(input, command = false) {
    keys(
      input,
      command
        ? [
            "worldId",
            "uid",
            "requestId",
            "expectedVersion",
            "kind",
            "payload",
            "nowMs",
          ]
        : ["worldId", "uid", "nowMs"],
    );
    const { worldId, uid } = input;
    if (typeof worldId !== "string" || !worldId || worldId.length > 256)
      fail("INVALID_SCOPE");
    if (typeof uid !== "string" || !uid || uid.length > 256)
      fail("UNAUTHENTICATED");
    const now = input.nowMs ?? clock(); // Only trusted HTTP context may supply nowMs; body timestamps are rejected by the route.
    if (!Number.isSafeInteger(now) || now < 0) fail("INVALID_CLOCK");
    const month = monthOf(now);
    const payload = input.payload ?? {};
    if (command) {
      if (
        typeof input.requestId !== "string" ||
        !input.requestId ||
        input.requestId.length > 160
      )
        fail("INVALID_COMMAND");
      if (
        input.expectedVersion !== undefined &&
        (!Number.isSafeInteger(input.expectedVersion) ||
          input.expectedVersion < 0)
      )
        fail("INVALID_VERSION");
      validateCommand(input.kind, payload);
    }
    const hash = digest(
      JSON.stringify([
        input.kind,
        Object.fromEntries(Object.entries(payload).sort()),
        input.expectedVersion,
      ]),
    );
    const output = await repository.transact(
      { worldId, uid, requestId: command ? input.requestId : undefined },
      async (data) => {
        const receipt =
          command && Object.hasOwn(data.receipts, input.requestId)
            ? data.receipts[input.requestId]
            : null;
        if (receipt) {
          if (receipt.hash !== hash) fail("IDEMPOTENCY_CONFLICT");
          return receipt.result;
        }
        const active = data.currentMonth ?? month;
        if (data.loadMonth) await data.loadMonth(active);
        let record = data.months[active];
        if (!record) {
          record = {
            state: createGameState({
              planetId: digest([seedSecret, worldId, active].join("|")),
            }),
            version: 0,
            lastServerMs: now,
          };
          data.months[active] = record;
          data.currentMonth = active;
        }
        verify(record);
        const closing = active < month;
        const target = closing ? endOf(active) - 1 : now;
        let budget = maxSteps;
        const oldVersion = record.version;
        while (record.lastServerMs + 1000 <= target && budget-- > 0) {
          const before = record.state.nextRecordId;
          record.state = stepGame(record.state);
          capture(data, active, before, record.state);
          record.lastServerMs += 1000;
        }
        if (record.lastServerMs > now) fail("CLOCK_REWIND");
        const catchingUp = record.lastServerMs + 1000 <= target;
        if (closing && !catchingUp) {
          if (!record.closed) {
            data.archives[active] = {
              monthId: active,
              ownedCoin:
                record.state.coins +
                (record.state.industry?.refinery?.budget ?? 0),
              closedAtMs: endOf(active),
            };
            const state = record.state;
            const before = state.nextRecordId;
            const escrow = state.industry?.refinery?.budget ?? 0;
            const spendable = state.coins;
            // Finalize paid commitments without advancing time or producing another payment.
            for (const shipment of state.shipments)
              state.shipmentStatusById[shipment.id] = "DELIVERED";
            state.ledger.push({
              id: `local-${String(state.nextRecordId++).padStart(8, "0")}`,
              atSecond: state.simSeconds,
              type: "MONTH_CLOSE_BURN",
              amount: spendable + escrow,
              ownerDelta: -spendable,
              externalDelta: spendable + escrow,
              ...(escrow ? { escrowDelta: -escrow } : {}),
              externalAccount: "sink:MONTH_CLOSE_BURN",
              description: "Month-end balances archived and burned",
            });
            state.coins = 0;
            if (state.industry?.refinery) state.industry.refinery.budget = 0;
            capture(data, active, before, state);
            verify(record);
            record.version += 1;
            record.closed = true;
          }
          data.currentMonth = month;
          if (data.loadMonth) await data.loadMonth(month);
          record = data.months[month] ??= {
            state: createGameState({
              planetId: digest([seedSecret, worldId, month].join("|")),
            }),
            version: 0,
            lastServerMs: now,
          };
        }
        record.version += 1;
        const view = () => ({
          state: clone(record.state),
          version: record.version,
          serverNowMs: now,
          catchingUp,
          monthId: closing && catchingUp ? active : month,
          cosmeticSeed: digest(
            `${worldId}|${closing && catchingUp ? active : month}|cosmetic`,
          ),
          regionIndex: parseInt(digest(uid).slice(0, 8), 16) % 100,
          ...(closing && catchingUp ? { closing: true } : {}),
        });
        if (command && catchingUp) return { ...view(), error: "CATCHING_UP" };
        if (
          command &&
          input.expectedVersion !== undefined &&
          input.expectedVersion !== oldVersion &&
          !closing
        )
          return { ...view(), error: "STALE_VERSION" };
        if (command) {
          const before = record.state.nextRecordId;
          try {
            record.state = apply(record.state, input.kind, payload);
          } catch (error) {
            return { ...view(), error: error.code ?? "INVALID_COMMAND" };
          }
          capture(data, month, before, record.state);
        }
        verify(record);
        const result = view();
        if (command)
          Object.defineProperty(data.receipts, input.requestId, {
            value: { hash, result: clone(result) },
            enumerable: true,
            configurable: true,
            writable: true,
          });
        return result;
      },
    );
    if (output.error) {
      const error = canonicalError(output.error);
      error.snapshot = output;
      throw error;
    }
    return output;
  }
  return { state: (input) => run(input), command: (input) => run(input, true) };
}
