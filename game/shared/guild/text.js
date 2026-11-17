// Dark, satirical flavor text. Picked deterministically from seeds so server and browser agree.
import { hash } from './util.js';

const pick = (list, seed) => list[hash(seed) % list.length];
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));

const T = {
  incident: [
    '{site}: a tunnel "relocated" itself onto {n} workers. Operations paused while the paperwork is filed.',
    '{site}: the drill found something that screamed. The drill won. Shift halted for counselling (optional, unpaid).',
    '{site}: gas pocket. The canary has filed a grievance. The miners could not be reached for comment.',
    '{site}: the night shift unionized, then the floor gave way. Management calls it a coincidence.',
    '{site}: a conveyor ate a foreman. Production paused out of respect. And because of the foreman.',
    '{site}: quota bonus triggered a stampede. Families received commemorative mugs.',
    '{site}: blasting schedule was in the wrong timezone. So was the crew.',
    '{site}: someone painted "SAFETY FIRST" over a crack. The crack disagreed.',
  ],
  brutal: [
    '{site} is running Brutal. Output is up. So is the sound.',
  ],
  full: ['{site}: the stockpile is full. The ore sits there, judging you. Send more ships.'],
  low: ['{site}: the {ore} vein is down to its last fifth. Geologists are pretending to be surprised.'],
  dry: ['{site}: the {ore} is gone. The hole remains, as a monument to ambition.'],
  built: {
    mine: ['{site} broke ground. Something in the soil sighed.', '{site} is open. The locals have been informed, eventually.'],
    refinery: ['{site} is lit. The sky is a new colour now. Accounting says it is billable.'],
    air: ['{site} is open: fuel, beds, and a vending machine that only sells regret.'],
    lab: ['{site} is staffed with scientists who signed a very long waiver.'],
    hub: ['Command hub expanded. The General\'s office now has a window. It faces the mine.'],
    exchange: ['Your Galactic Exchange is open in orbit. The galaxy can now see you. Act natural.'],
  },
  upgraded: ['{site} grew to {level}. The planet noticed.'],
  survey: ['Drone back from {region}: {top}.', 'Survey of {region} complete: {top}. The drone seems shaken.'],
  nothing: ['mostly dirt and a strong sense of being watched', 'nothing worth a ship, but lovely views', 'common rock and one very old footprint'],
  cavein: [
    '{site}: cave-in. {n} {w} trapped behind a wall of rock and a strongly worded sign. Rescue them, or seal it and keep digging?',
    '{site}: the ceiling has opinions. {n} {w} are under them. A rescue costs money. Sealing costs only conscience.',
    '{site}: a tunnel folded like a bad hand of cards. {n} {w} inside. Management awaits your call.',
    '{site}: rocks fell. {n} {w} did not get out of the way. They are alive, for now, and filing complaints.',
  ],
  rescued: [
    '{site}: all {n} dug out. They want hazard pay. They are offered a sticker.',
    '{site}: rescue complete. {n} survivors, one of them now deeply religious.',
    '{site}: {n} pulled out alive. The drill team is applauded, then sent back down.',
  ],
  sealed: [
    '{site}: tunnel sealed. {n} names added to the memorial plaque, which is now a memorial wall.',
    '{site}: sealed. Output resumes. The night shift sings a little quieter.',
    '{site}: the Guild thanks the {n} for their contribution to quarterly results.',
  ],
  strike: [
    '{site}: the {w} have unionized. They are holding signs. The signs are well made, which is somehow worse. Pay a bonus, or wait them out?',
    '{site}: strike! Demands include "air" and "fewer surprises". Pay up or let them sit?',
  ],
  strikeBonus: ['{site}: bonus paid. Morale restored. The union rep was promoted into management, where he will be harmless.'],
  strikeWait: ['{site}: you waited them out. Four hours of silence, then the shovels started again. Nobody is smiling.'],
  deaths: [
    '{site}: {n} {w} lost this shift. Causes include gravity, carts and "a very loud noise".',
    '{site}: {n} {w} retired permanently. The labor company sends condolences and an invoice.',
    '{site}: {n} fewer {w}. The survivors have started naming the tunnels after them.',
    '{site}: {n} {w} gone. HR has filed it under "attrition, festive".',
  ],
  shuttle: [
    'Shuttle down: {n} fresh {w} blinking at the sky. Nobody told them about the sky.',
    'Shuttle landed. {n} new {w}, still sticky from cryo, signed on with their thumbprints.',
    '{n} {w} arrived. One asked about the pension plan. Everyone laughed for a long time.',
  ],
  blast: [
    '{site}: BLAST. {t} t of ore in one go, and a new crater the shape of ambition.',
    '{site}: Fire in the hole! {t} t of ore and every window for a mile.',
    '{site}: controlled explosion, mostly. {t} t of ore up the lift.',
  ],
  blastFull: ['{site}: BLAST. The ore yard was already full, so the ore rolled politely back into the hole. Ships first, explosions second.'],
  landing: ['You landed in {region}. The Guild charter is stapled to a rock. The rock is now yours.'],
};

export function line(kind, vars = {}, seed = '') {
  const parts = kind.split('.');
  let bank = T;
  for (const p of parts) bank = bank ? bank[p] : null;
  if (!Array.isArray(bank)) return '';
  return fill(pick(bank, seed + kind), vars);
}

export const SITE_NAMES = {
  mine: ['Gnaw', 'Hollow', 'Scar', 'Bite', 'Pit', 'Furrow', 'Gash', 'Delve', 'Maw', 'Notch'],
  refinery: ['Crucible', 'Smelt', 'Kettle', 'Cookworks', 'Boilhouse', 'Furnace'],
  air: ['Perch', 'Roost', 'Waystation', 'Pylon', 'Tether'],
  lab: ['Annex', 'Think Tank', 'Lab', 'Institute', 'Den'],
};
export function siteName(kind, region, seed) {
  const words = SITE_NAMES[kind] || ['Site'];
  const last = String(region || 'Nowhere').split(' ').pop();
  return `${last} ${pick(words, seed)}`.slice(0, 28);
}
