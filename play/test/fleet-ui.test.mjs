import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFleet,fleetCommand} from '../fleet-ui.js';
import {createGameState,validateGameState,stepGame} from '../model.js';
const state={coins:10000,online:{yard:{units:10},mine:{pads:{count:1,max:12,nextPrice:4000},weather:{kind:'clear',grounded:false},workers:{wasted:0}},fleet:{count:1,max:24,prices:{hauler:3000,cruiser:3000,freighter:5400},ships:[{id:'ship-1',class:'hauler',capacity:150,speedPerMinute:.5,readyInSeconds:0,policy:{auto:true,mode:'best'},destinations:[{id:'refinery-1',name:'Safe <buyer>',payment:200,unitPrice:40,coinPerMinute:45,tripSeconds:240,best:true}]}]}}};
test('server fleet renders actual quotes escaped and creates validated per-ship intents',()=>{
 const html=renderFleet(state);assert(html.includes('Safe &lt;buyer&gt;'));assert(html.includes('240s trip'));assert(html.includes('45 ◉/min'));
 const command=dataset=>fleetCommand({dataset},state);
 assert.deepEqual(command({fleet:'buyShip',class:'freighter'}),['buyShip',{class:'freighter'}]);
 assert.deepEqual(command({fleet:'fixed',ship:'ship-1',destination:'refinery-1'}),['setPolicy',{shipId:'ship-1',mode:'fixed',destinationId:'refinery-1'}]);
 assert.equal(command({fleet:'fixed',ship:'ship-1',destination:'injected'}),null);
 assert.equal(command({fleet:'dispatch',ship:'someone-else'}),null);
 assert.equal(fleetCommand({disabled:true,dataset:{fleet:'buyPad'}},state),null);
 assert.equal(renderFleet({}), '');
});
test('remote prediction handles server-embedded veins and wasted workers without creating payments',()=>{
 let s=createGameState(undefined,{legacy:true});s.remote=true;
 s.workersHired=6;
 const shaft=s.production.shafts[0];shaft.oreId='lithium';shaft.commonOreId='ferrite';shaft.vein={oreId:'lithium',size:100,remaining:100};
 s=validateGameState(s);
 const before=structuredClone(s);
 s=stepGame(s);
 assert(s.production.cumulativeMinedByOre.some(r=>r.oreId==='lithium'&&r.units>0));
 assert.equal(s.coins,0);assert.equal(s.shipments.length,0);assert.equal(before.production.shafts[0].vein.remaining,100);
 s.online={offers:[{id:'refinery-1'}]};
 s.shipments=[{id:'paid',oreId:'lithium',units:1,payment:40,destinationId:'refinery-1',state:'PAID_AT_DEPARTURE',departureAtSecond:0,arrivalAtSecond:10,shipReadyAtSecond:20,tripSeconds:20}];s.shipmentStatusById={paid:'IN_TRANSIT'};
 assert.doesNotThrow(()=>validateGameState(s));
});
