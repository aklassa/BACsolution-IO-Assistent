import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { WorkspaceStore } from '../SyncServer/store.mjs';
import { createServer } from '../SyncServer/server.mjs';

const project = {id:'project-one',name:'Büro',stations:[{id:'station-one',name:'Anlage 2.1',origin:'http://controller.test',identity:'TEST-SERIAL',configuration:'1'}]};
const mutation = (base = 0, data = project) => ({id:randomUUID(),documentID:`project:${data.id}`,kind:'project',baseRevision:base,payload:JSON.stringify(data)});
const result = () => ({id:randomUUID(),projectID:project.id,stationID:'station-one',stationIdentity:'TEST-SERIAL',configuration:'1',deviceID:'iphone-test',technician:'Prüfer A',recordedAt:'2026-10-05T10:00:00Z',controllerState:'verified',prop:'testState',
  point:{key:'["http://controller.test",0,0,1,0]',inst:0,busName:'Local I/O',dev:0,deviceName:'TEST',objType:1,objIdx:0,terminal:'UI1',name:'ZUL Temp. Anlage 2.1',description:'Zulufttemperatur',hwType:'in_ana',path:'Local IO/UI1',value:{text:'21.5',unit:'°C'},mode:'Auto',testState:2,testDate:'2026-10-05 12:00:00',testComment:'Messwert geprüft',online:true,receivedAt:'2026-10-05T10:00:00Z',source:'controller'}});
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'bac-io-sync-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  return {file:path.join(dir,'workspace.json'),store:await WorkspaceStore.open(path.join(dir,'workspace.json'))};
}
test('two devices editing same revision cause a conflict, never last-writer-wins', async t => {
  const {store} = await fixture(t);
  await store.writeDocument(mutation());
  const results = await Promise.allSettled([store.writeDocument(mutation(1,{...project,name:'iPhone'})), store.writeDocument(mutation(1,{...project,name:'PC'}))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const conflict = results.find(r=>r.status==='rejected').reason;
  assert.equal(conflict.status,409); assert.equal(conflict.extra.current.revision,2);
  assert.equal(store.snapshot().documents[0].revision,2);
});
test('lost response can be retried after restart with same mutation ID without duplicate revision', async t => {
  const {store,file} = await fixture(t), write = mutation();
  const first = await store.writeDocument(write);
  const restarted = await WorkspaceStore.open(file);
  assert.deepEqual(await restarted.writeDocument(write),first);
  assert.equal(restarted.snapshot().documents.length,1);
  await assert.rejects(restarted.writeDocument({...write,payload:JSON.stringify({...project,name:'Anderer Inhalt'})}),e=>e.status===422);
});
test('queued offline edits preserve their order and include earlier acknowledgements', async t => {
  const {store} = await fixture(t);
  const one = mutation(0), two = mutation(1,{...project,name:'Fortgesetzt auf dem iPhone'});
  await store.writeDocument(one); await store.writeDocument(two);
  assert.equal((await store.writeDocument(one)).revision,1);
  assert.equal(store.snapshot().documents[0].revision,2);
  assert.equal(JSON.parse(store.snapshot().documents[0].payload).name,'Fortgesetzt auf dem iPhone');
});
test('verified result history is durable, idempotent and rejects altered identifiers', async t => {
  const {store,file} = await fixture(t);
  await store.writeDocument(mutation());
  const event = result(), saved = await store.writeResult(event);
  assert.ok(saved.serverStoredAt);
  const restarted = await WorkspaceStore.open(file);
  assert.deepEqual(await restarted.writeResult(event),saved);
  await assert.rejects(restarted.writeResult({...event,point:{...event.point,testComment:'Überschreiben'}}),e=>e.status===409);
  await assert.rejects(restarted.writeResult({...result(),stationIdentity:'WRONG'}),e=>e.status===400);
  await assert.rejects(restarted.writeResult({...result(),configuration:'2'}),e=>e.status===400);
  assert.equal(restarted.snapshot().results.length,1);
});
test('unconfirmed writes and actuator changes cannot enter the confirmed history', async t => {
  const {store} = await fixture(t); await store.writeDocument(mutation());
  for (const change of [{prop:'value'},{controllerState:'pending'},{point:{...result().point,online:false}},{point:{...result().point,testDate:''}},{serverStoredAt:'forged'}]) {
    assert.throws(()=>store.writeResult({...result(),...change}),e=>e.status===400);
  }
  assert.equal(store.snapshot().results.length,0);
});
test('late offline results keep their original known configuration after a project update', async t => {
  const {store} = await fixture(t); await store.writeDocument(mutation());
  const changed = {...project,stations:project.stations.map(s=>({...s,configuration:'2'}))};
  await store.writeDocument(mutation(1,changed));
  const old = await store.writeResult(result());
  assert.equal(old.configuration,'1');
  assert.equal(JSON.parse(store.snapshot().documents[0].payload).stations[0].configuration,'2');
});
test('global vocabulary synchronizes aliases as an array and rejects meanings that collide', async t => {
  const {store} = await fixture(t);
  const vocab = {id:randomUUID(),documentID:'vocabulary:global',kind:'vocabulary',baseRevision:0,payload:JSON.stringify({format:'bacsolution-io-vocabulary',version:1,terms:[{short:'RT',meaning:'Raumtemperatur',aliases:['Raum Sensor']}]})};
  await store.writeDocument(vocab);
  assert.deepEqual(JSON.parse(store.snapshot().documents[0].payload).terms[0].aliases,['Raum Sensor']);
  assert.throws(()=>store.writeDocument({...vocab,id:randomUUID(),baseRevision:1,payload:JSON.stringify({format:'bacsolution-io-vocabulary',version:1,terms:[{short:'RF',meaning:'Raumfeuchte',aliases:['Raum Temp']}]})}),e=>e.status===400);
});
test('unreadable storage is preserved, not replaced with an empty workspace', async t => {
  const {file} = await fixture(t); await fs.writeFile(file,'broken');
  await assert.rejects(WorkspaceStore.open(file)); assert.equal(await fs.readFile(file,'utf8'),'broken');
});
test('HTTP service requires token and schema, and two clients see the same results', async t => {
  const {store} = await fixture(t), token='test-only-'.repeat(5);
  const server = createServer(store,token);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}`;
  const headers={Authorization:`Bearer ${token}`,'X-BACsolution-Schema':'1','Content-Type':'application/json'};
  assert.equal((await fetch(url+'/v1/state')).status,401);
  assert.equal((await fetch(url+'/v1/state',{headers:{Authorization:`Bearer ${token}`}})).status,400);
  assert.equal((await fetch(url+'/v1/documents',{method:'POST',headers,body:JSON.stringify(mutation())})).status,200);
  const event=result();
  assert.equal((await fetch(url+'/v1/results',{method:'POST',headers,body:JSON.stringify(event)})).status,200);
  const pc=await(await fetch(url+'/v1/state',{headers})).json();
  assert.equal(pc.results[0].id,event.id); assert.equal(pc.documents[0].revision,1);
  assert.ok(pc.workspaceID);
});
