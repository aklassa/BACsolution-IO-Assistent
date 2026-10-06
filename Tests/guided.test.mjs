import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {guidedConfirmation, guidedComment, guidedChange, guidedTools} from '../Shared/guided.js';
import {createVoiceBroker} from '../SyncServer/voice.mjs';
import {createServer} from '../SyncServer/server.mjs';

const point = {online:true, source:'controller', value:{text:'24.8',unit:'°C'},testComment:''};
test('spoken example prepares exact signed deviation, preserves existing notes and needs explicit confirmation', () => {
  const note = guidedComment({point:{...point,testComment:'Fühler AI3'}, reference:26, unit:'Grad', comment:''});
  assert.equal(note, 'Fühler AI3\nReferenzmessung 26 °C, Controller 24,8 °C, Abweichung -1,2 °C (Controller minus Referenz).');
  assert.deepEqual(guidedConfirmation('Ja, danach zum nächsten Temperaturfühler.'), {action:'confirm',followup:'Weiter zum nächsten temperaturfuhler'});
  assert.deepEqual(guidedConfirmation('Ja.'), {action:'confirm',followup:''});
  assert.equal(guidedConfirmation('Mein Messgerät zeigt 26 Grad.').action,'other');
});
test('negation, conditional language, quotes and corrections never approve a write', () => {
  for(const text of ['Nicht speichern','Ja, aber nicht speichern','Ja, danach bitte nicht weiter','Vielleicht ja','Wenn ich ja sage, speichern','Er sagte ja','Ja, nein','Ja, aber 27 Grad','Ja wenn es stimmt','Nein, der andere Fühler','Ja, doch lieber nicht']) {
    assert.notEqual(guidedConfirmation(text).action,'confirm',text);
  }
  assert.notEqual(guidedConfirmation('Ja, Ausgang auf 100 Prozent').action,'confirm');
});
test('reference calculation refuses incompatible units, offline, nonnumeric and ambiguous readings', () => {
  for(const changed of [{...point,online:false},{...point,source:'csv'},{...point,value:{text:'OPEN',unit:'°C'}},
    {...point,value:{text:'1,234.5',unit:'°C'}},{...point,value:{text:'24.8',unit:'°F'}}]) {
    assert.throws(()=>guidedComment({point:changed,reference:26,unit:'°C'}));
  }
  assert.throws(()=>guidedComment({point,reference:Infinity,unit:'°C'}));
  assert.throws(()=>guidedComment({point,reference:true,unit:'°C'}));
  assert.throws(()=>guidedComment({point,reference:26,unit:''}));
  assert.throws(()=>guidedComment({point,comment:'x'.repeat(2001)}));
});
test('observation reports threshold crossings in both directions and binary changes', () => {
  const sample = text => ({...point,value:{text,unit:'°C'}});
  assert.equal(guidedChange({before:sample('21.4'),after:sample('21.8')}).changed,false);
  assert.deepEqual(guidedChange({before:sample('21.4'),after:sample('21.9')}),{changed:true,direction:'steigt'});
  assert.deepEqual(guidedChange({before:sample('24.8'),after:sample('23.8')}),{changed:true,direction:'fällt'});
  assert.deepEqual(guidedChange({before:sample('OPEN'),after:sample('CLOSED')}),{changed:true,direction:'Zustandswechsel'});
  assert.throws(()=>guidedChange({before:point,after:{...point,online:false}}));
  assert.throws(()=>guidedChange({before:point,after:{...point,value:{text:'26',unit:'V'}}}));
});
test('native JS bundle uses the same calculations and no save or actuator tools', () => {
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync(new URL('../Resources/LanguageCore.js',import.meta.url),'utf8'),context);
  const call = data => JSON.parse(context.mobileCall(JSON.stringify(data)));
  assert.equal(call({operation:'guidedComment',point,reference:26,unit:'°C'}).value, guidedComment({point,reference:26,unit:'°C'}));
  assert.deepEqual(call({operation:'guidedConfirmation',text:'Ja, danach zum nächsten Temperaturfühler.'}).value,guidedConfirmation('Ja, danach zum nächsten Temperaturfühler.'));
  const tools=call({operation:'guidedConfiguration'}).value.tools;
  assert.deepEqual(tools,guidedTools);
  assert.deepEqual(tools.map(t=>t.name),['find_points','choose_point','read_point','observe_point','prepare_comment','next_point','stop_observation']);
});
test('session broker sends fixed scoped configuration and returns only short-lived credentials', async () => {
  let request;
  const create=createVoiceBroker({apiKey:'private-test-key',clock:()=>1000,fetchImpl:async(url,init)=>{
    request={url,...init}; return new Response(JSON.stringify({value:'ek_test-only',expires_at:61,session:{secret:'not-for-client'}}));
  }});
  assert.deepEqual(await create({}),{secret:'ek_test-only',expiresAt:61,model:'gpt-realtime',maxSeconds:600});
  const body=JSON.parse(request.body);
  assert.equal(request.url,'https://api.openai.com/v1/realtime/client_secrets');
  assert.equal(request.redirect,'error');
  assert.equal(body.expires_after.seconds,60);
  assert.equal(body.session.audio.input.turn_detection.create_response,false);
  assert.equal(body.session.audio.input.format.rate,24000);
  assert.deepEqual(body.session.tools,guidedTools);
  await assert.rejects(create({password:'must-not-leave-phone'}),e=>e.status===400);
});
test('broker refuses missing API access, expired/malformed keys and hides upstream secrets', async () => {
  await assert.rejects(createVoiceBroker()({}),e=>e.status===503);
  for(const payload of [{value:'sk_private',expires_at:61},{value:'ek_old',expires_at:0}]) {
    await assert.rejects(createVoiceBroker({apiKey:'test',clock:()=>1000,fetchImpl:async()=>new Response(JSON.stringify(payload))})({}),e=>e.status===502);
  }
  const broken=createVoiceBroker({apiKey:'private-test-key',fetchImpl:async()=>{throw new Error('private-test-key password=secret');}});
  await assert.rejects(broken({}),e=>e.status===502&&!e.message.includes('private-test-key'));
});
test('broker bounds paid session starts and rejects concurrent starts', async () => {
  const config={apiKey:'test',clock:()=>1000,fetchImpl:async()=>new Response(JSON.stringify({value:'ek_test',expires_at:61}))};
  const create=createVoiceBroker(config);
  for(let i=0;i<12;i++) await create({});
  await assert.rejects(create({}),e=>e.status===429);
  let release;
  const concurrent=createVoiceBroker({...config,fetchImpl:()=>new Promise(resolve=>{release=()=>resolve(new Response(JSON.stringify({value:'ek_test',expires_at:61})));})});
  const first=concurrent({}); await assert.rejects(concurrent({}),e=>e.status===429); release(); await first;
});
test('voice HTTP endpoint requires existing workspace authentication and schema', async t => {
  let calls=0;
  const token='test-only-token-with-at-least-32-characters';
  const server=createServer({},token,{voice:async body=>{calls++;return {secret:'ek_mock'};}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve); server.closeAllConnections();}));
  const url=`http://127.0.0.1:${server.address().port}/v1/voice/session`;
  const options={method:'POST',headers:{'Content-Type':'application/json'},body:'{}'};
  assert.equal((await fetch(url,options)).status,401);
  options.headers.Authorization=`Bearer ${token}`;
  assert.equal((await fetch(url,options)).status,400);
  options.headers['X-BACsolution-Schema']='1';
  const response=await fetch(url,options);
  assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(calls,1); assert.equal((await response.json()).secret,'ek_mock');
});

test('voice setup check is read-only, reports configuration and does not consume session limits', async () => {
  let calls=0;
  const broker=createVoiceBroker({apiKey:'private-test-key',clock:()=>1000,fetchImpl:async()=>{
    calls++; return new Response(JSON.stringify({value:'ek_test',expires_at:61}));
  }});
  for (let i=0;i<20;i++) assert.deepEqual(broker.status(),{service:'bacsolution-io-voice',schema:1,configured:true,model:'gpt-realtime',maxSeconds:600});
  assert.equal(calls,0);
  assert.ok(!JSON.stringify(broker.status()).includes('private-test-key'));
  for (let i=0;i<12;i++) await broker({});
  assert.equal(calls,12);
  await assert.rejects(broker({}),e=>e.status===429);
  assert.equal(createVoiceBroker().status().configured,false);
  assert.equal(createVoiceBroker({apiKey:'  '}).status().configured,false);
});

test('voice setup HTTP endpoint requires authentication and schema without forwarding secrets or project data', async t => {
  let upstreamCalls=0;
  const token='test-only-token-with-at-least-32-characters';
  const voice=createVoiceBroker({apiKey:'private-test-key',fetchImpl:async()=>{upstreamCalls++;throw new Error('must not be called');}});
  const server=createServer({snapshot:()=>{throw new Error('must not read project data');}},token,{voice});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const url=`http://127.0.0.1:${server.address().port}/v1/voice/status`;
  assert.equal((await fetch(url)).status,401);
  const headers={Authorization:`Bearer ${token}`};
  assert.equal((await fetch(url,{headers})).status,400);
  headers['X-BACsolution-Schema']='1';
  const response=await fetch(url,{headers});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),voice.status());
  assert.equal(upstreamCalls,0);
  assert.equal((await fetch(url,{headers,method:'POST',body:'{}'})).status,404);
});

test('server without a voice broker reports incomplete setup instead of claiming readiness', async t => {
  const token='test-only-token-with-at-least-32-characters';
  const server=createServer({},token);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/v1/voice/status`,{headers:{Authorization:`Bearer ${token}`,'X-BACsolution-Schema':'1'}});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{service:'bacsolution-io-voice',schema:1,configured:false,model:'',maxSeconds:600});
});
