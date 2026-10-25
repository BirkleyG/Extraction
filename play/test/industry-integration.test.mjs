import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, grantDevCoins, industryCommand, frontierCommand, stepGame, advanceGame, validateGameState, setAutoLaunch } from '../model.js';

const sum = rows => rows.reduce((n, row) => n + row.units, 0);
function factory() {
  let state = grantDevCoins(createGameState(), 1000000);
  state = setAutoLaunch(state, false);
  state = industryCommand(state, {type:'buildRefinery'});
  state = industryCommand(state, {type:'buildStation'});
  state = industryCommand(state, {type:'setAutoRoute',enabled:true});
  return frontierCommand(state,'recruit-infantry');
}
function owned(state) { return state.coins + (state.industry.refinery?.budget ?? 0); }
function assertMass(state) {
  const p=state.production, i=state.industry;
  const physical=sum(p.surface.unitsByOre)+p.shafts.reduce((n,s)=>n+s.bufferUnits,0)+state.ship.cargoUnits+
    sum(state.shipments)+sum(state.historyArchive?.shipments.unitsByOre ?? [])+
    Object.values(i.refinery.input).reduce((a,b)=>a+b,0)+Object.values(i.refinery.output).reduce((a,b)=>a+b,0)+
    Object.values(i.station.stock).reduce((a,b)=>a+b,0)+Object.values(i.accounting.soldRefinedByOre).reduce((a,b)=>a+b,0)+i.refinery.lostUnits;
  assert(Math.abs(sum(p.initialUnitsByOre)+sum(p.cumulativeMinedByOre)-physical)<1e-7,'ore and refining loss reconcile');
}

test('industry integrates actual yard, escrow and ledger without inventing money or raw inventory',()=>{
  let state=advanceGame(factory(),600,600).state;
  const ore=state.site.commonOreId;
  assert(state.industry.refinery.output[ore]>100);
  assertMass(state);
  let before=owned(state);
  state=industryCommand(state,{type:'fundBudget',amount:1000});
  assert.equal(owned(state),before);
  let row=state.ledger.at(-1);
  assert.equal(row.ownerDelta+row.escrowDelta+row.externalDelta,0);
  assert.equal(row.externalDelta,0);
  state=industryCommand(state,{type:'releaseBudget',amount:1000});
  assert.equal(owned(state),before);
  state=industryCommand(state,{type:'sellRefinedNpc',oreId:ore,units:10});
  const offer=state.industry.market.offers.find(o=>o.oreId===ore);
  state=industryCommand(state,{type:'transferToStation',oreId:ore,units:offer.units});
  state=industryCommand(state,{type:'acceptContract',contractId:offer.id});
  const snapshot=structuredClone(state);
  assert.throws(()=>industryCommand(state,{type:'acceptContract',contractId:offer.id}));
  assert.deepEqual(state,snapshot);
  assertMass(state);
  const net=state.ledger.reduce((n,r)=>n+r.ownerDelta+(r.escrowDelta??0),0)+(state.historyArchive?.ledger.ownerDelta??0)+(state.historyArchive?.ledger.escrowDelta??0);
  assert.equal(net,owned(state));
});

test('industry, defended hazards and escrow remain exactly equal across live ticks, catch-up and reload',()=>{
  let start=industryCommand(factory(),{type:'fundBudget',amount:1000});
  const original=structuredClone(start);
  let live=start; for(let i=0;i<1200;i++)live=stepGame(live);
  let batched=advanceGame(start,600,600).state;
  batched=validateGameState(JSON.parse(JSON.stringify(batched)));
  batched=advanceGame(batched,600,600).state;
  assert.deepEqual(start,original);
  assert.deepEqual(batched,live);
  assert.equal(live.frontier.infantry.troops,10);
  assertMass(live);
});

test('automatic raw routing does not round fractional inventory up to a whole crate',()=>{
  let state=factory();
  for(let i=0;i<1000;i++)state=stepGame(state);
  assertMass(state);
  assert(state.frontier.news.some(e=>e.type==='incident'));
});

test('new modules anchor legacy sandbox saves at present without replaying old events',()=>{
  let state=createGameState();
  delete state.industry; delete state.frontier;
  state.simSeconds=100000;
  const loaded=validateGameState(state);
  assert.equal(loaded.industry.elapsedSeconds,100000);
  assert.equal(loaded.frontier.simSeconds,100000);
  assert(loaded.frontier.nextIncidentAt>100000);
  assert(loaded.industry.market.offers.every(o=>o.expiresAt>100000));
  assert.equal(loaded.coins,0);
});
