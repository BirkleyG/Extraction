// Exact one-second sandbox engine with the same two-step greedy policy as the fluid study.
import { createGameState, stepGame, purchaseUpgrade, buyNextShaft, selectDestination, destinationsFor } from '../model.js';
import { TUNE, LINE_IDS, LEVEL_CAP, MAX_SHAFTS, lineCost, shaftCost } from '../economy.js';
import { flows } from './pacing.mjs';
const options = (s) => [...LINE_IDS.filter(id=>s[id]<LEVEL_CAP).map(id=>({id,cost:lineCost(id,s[id]),next:{...s,[id]:s[id]+1}})), ...(s.shafts<MAX_SHAFTS?[{id:'shaft',cost:shaftCost(s.shafts+1),next:{...s,shafts:s.shafts+1}}]:[])].filter(o=>Number.isSafeInteger(o.cost));
const score = (o, income) => {let gain=flows(o.next).coinPerSec-income; if(gain<=1e-12)for(const p of options(o.next))gain=Math.max(gain,(flows(p.next).coinPerSec-income)/2);return gain>1e-12?o.cost/gain:Infinity;};
let state=createGameState();
const snapshots=[];
for(let second=1;second<=3600;second++) {
  state=stepGame(state);
  for(let guard=0;guard<30;guard++) {
    const s={pick:state.upgrades.pick,lift:state.production.lift.level,hauler:state.upgrades.hauler,shafts:state.production.shafts.length};
    const income=flows(s).coinPerSec;
    const ranked=options(s).map(o=>({...o,score:score(o,income)})).sort((a,b)=>a.score-b.score);
    const best=ranked[0]; const affordable=ranked.find(o=>o.cost<=state.coins);
    const choice=affordable&&affordable.score<=best.score*2?affordable:best;
    if(!choice||choice.cost>state.coins)break;
    state=choice.id==='shaft'?buyNextShaft(state):purchaseUpgrade(state,choice.id);
  }
  const s={pick:state.upgrades.pick,lift:state.production.lift.level,hauler:state.upgrades.hauler,shafts:state.production.shafts.length};
  const best=flows(s).destination;
  const destination=destinationsFor(state).find(d=>d.distance===best.distance);
  if(destination.id!==state.selectedDestinationId)state=selectDestination(state,destination.id);
  if([1,10,60,300,900,3600].includes(second))snapshots.push({second,earned:state.totalExternalEarnings,coins:state.coins,departures:state.shipments.length+(state.historyArchive?.shipments.count??0),...s});
}
console.log(JSON.stringify({scope:'Exact one-second sandbox, seeded default site, greedy lookahead; no grants. Fluid study is an approximation, not certification.',tune:TUNE,snapshots},null,2));
