// Computer-run raw-ore buyers (sections 06/09). C-02 PROVISIONAL: bids are tuning data, not market-derived prices; the
// market engine (section 08) replaces fixed bids in Release B. Per the CEO (Q-10) these buyers have NO coin or room
// limit: they pay units x bid for whatever a hauler brings. The coin is an explicit external source (NPC_RAW_PURCHASE).
export const DEFAULT_NPC_BUYERS = Object.freeze([
  Object.freeze({ id: 'frontier-refinery', name: 'Frontier Refinery', distance: 1, bidPerUnit: 40, unloadUnitsPerMinute: 1500 }),
  Object.freeze({ id: 'cinder-bay-buyer', name: 'Cinder Bay Buyer', distance: 3, bidPerUnit: 64, unloadUnitsPerMinute: 900 }),
  Object.freeze({ id: 'low-orbit-depot', name: 'Low Orbit Depot', distance: 8, bidPerUnit: 52, unloadUnitsPerMinute: 1200 }),
]);
