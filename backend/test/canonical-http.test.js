import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanonicalService} from '../src/canonical-game.js';
import {MemoryCanonicalRepository} from '../src/canonical-repository.js';
import {createGameHttpServer} from '../src/game-http.js';
test('root-game HTTP verifies identity, rejects client outcomes and applies the shared engine once',async()=>{
 const repo=new MemoryCanonicalRepository(); await repo.updateWorldMembership('world','member'); let now=Date.UTC(2026,9,27);
 const canonical=createCanonicalService({repository:repo,clock:()=>now});
 const server=createGameHttpServer({game:{},canonical,clock:()=>now,auth:{verifyIdToken:async t=>{if(t!=='valid-token-123456789')throw Error();return{uid:'member'};}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${server.address().port}/v1/worlds/world/game`;
 const call=async(body,token='valid-token-123456789')=>{const r=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,body:await r.json()};};
 try{
  assert.equal((await call(undefined,'bad-token-000000000')).status,401);
  const start=await call();assert.equal(start.status,200);assert.equal(start.body.state.coins,0);
  assert.equal((await call({requestId:'hack',kind:'upgrade',payload:{type:'pick'},coins:100000})).status,400);
  now+=1000;const cmd={requestId:'buy-once',expectedVersion:start.body.version,kind:'upgrade',payload:{type:'pick'}};
  const one=await call(cmd);assert.equal(one.status,200);assert.equal(one.body.state.upgrades.pick,1);
  assert.deepEqual(await call(cmd),one);
  assert.equal((await call({requestId:'time',kind:'shaft',payload:{},nowMs:now+1e9})).status,400);
  assert.equal((await call({requestId:'grant',kind:'grant',payload:{amount:1000}})).status,400);
 }finally{await new Promise(r=>server.close(r));}
});
