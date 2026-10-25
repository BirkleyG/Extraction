/* Named tiers for the three upgrade lines. The levels live in economy.js; this layer turns a level into the machine the
 * scene draws (headframe, pick, ship) and the name the panel shows. */
import { LINES, tierIndex } from './economy.js';

export const TIERS = Object.fromEntries(Object.entries(LINES).map(([id, line]) => [id, { label: line.label, icon: line.icon, tiers: line.tiers }]));

export function tierOf(type, level) {
  const def = LINES[type]; const i = tierIndex(type, level);
  const here = def.tiers[i]; const next = def.tiers[i + 1] || null;
  const span = next ? next[0] - here[0] : 1;
  return { i, name: here[1], blurb: here[2], at: here[0], next: next ? { at: next[0], name: next[1] } : null, progress: next ? Math.min(1, (level - here[0]) / span) : 1, label: def.label, icon: def.icon };
}
