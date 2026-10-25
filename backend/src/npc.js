// Computer-run raw-ore buyers (section 06/09). C-02 PROVISIONAL: bids, budgets and refill rates are tuning data,
// not market-derived prices. The market engine (section 08) will replace fixed bids in Release B.
// Funds and receiving capacity are token buckets: they refill linearly with time, so lazy evaluation is exact.
const DAY = 86_400;
export const DEFAULT_NPC_BUYERS = Object.freeze([
  Object.freeze({
    id: 'frontier-refinery', name: 'Frontier Refinery', distance: 1, bidPerUnit: 40, unloadUnitsPerMinute: 1500,
    fundsCap: 5_000_000_000, fundsRefillPerSecond: 5_000_000_000 / DAY,
    capacityCap: 5_000_000, capacityRefillPerSecond: 5_000_000 / DAY,
  }),
  Object.freeze({
    id: 'cinder-bay-buyer', name: 'Cinder Bay Buyer', distance: 3, bidPerUnit: 64, unloadUnitsPerMinute: 900,
    fundsCap: 2_000_000_000, fundsRefillPerSecond: 2_000_000_000 / DAY,
    capacityCap: 2_000_000, capacityRefillPerSecond: 2_000_000 / DAY,
  }),
  Object.freeze({
    id: 'low-orbit-depot', name: 'Low Orbit Depot', distance: 8, bidPerUnit: 52, unloadUnitsPerMinute: 1200,
    fundsCap: 3_000_000_000, fundsRefillPerSecond: 3_000_000_000 / DAY,
    capacityCap: 3_000_000, capacityRefillPerSecond: 3_000_000 / DAY,
  }),
]);
