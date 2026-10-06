import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {googleVoiceSetup,validatedVoiceCall,guidedNarration,appleVoicePrompt} from '../Shared/voice-providers.js';
import {guidedTools,guidedConfirmation} from '../Shared/guided.js';
import {createGoogleVoiceBroker,googleVoiceModel} from '../SyncServer/google-voice.mjs';
import {createServer} from '../SyncServer/server.mjs';

test('Google raw WebSocket setup preserves tools, nullable references and explicit native confirmation',()=>{
  const {setup}=googleVoiceSetup({model:googleVoiceModel,context:{station:'Anlage 2.1'}});
  assert.equal(setup.model,'models/gemini-3.8-live');
  assert.deepEqual(setup.generationConfig.responseModalities,['AUDIO']);
  assert.deepEqual(setup.inputAudioTranscription,{});
  assert.deepEqual(setup.outputAudioTranscription,{});
  const functions=setup.tools[0].functionDeclarations;
  assert.deepEqual(functions.map(t=>t.name),[...guidedTools.map(t=>t.name),'end_conversation']);
  assert.deepEqual(functions.find(t=>t.name==='prepare_comment').parameters.properties.reference,{type:'NUMBER',nullable:true});
  assert.equal(functions.find(t=>t.name==='choose_point').parameters.properties.number.type,'INTEGER');
  assert.ok(!JSON.stringify(functions).includes('additionalProperties'));
  assert.match(setup.systemInstruction.parts[0].text,/kein Werkzeug zum Schalten/);
  assert.throws(()=>googleVoiceSetup({model:'https://another-model.test'}));
});

test('Apple and Google tool calls reject extra arguments, malformed types, nonfinite numbers and unsupported actions',()=>{
  for (const call of [
    {name:'save',args:{}},{name:'set_output',args:{value:100}},{name:'read_point',args:{url:'https://test'}},
    {name:'choose_point',args:{number:1.1}},{name:'choose_point',args:{number:true}},{name:'choose_point',args:{number:0}},
    {name:'observe_point',args:{enabled:1}},{name:'observe_point',args:{enabled:true,threshold:Infinity}},
    {name:'prepare_comment',args:{comment:'',reference:'26',unit:'°C'}},
    {name:'prepare_comment',args:{comment:'',unit:'°C'}},{name:'find_points',args:{query:'x'.repeat(301)}},
    {name:'read_point',args:[]},{name:'read_point',args:null}
  ]) assert.throws(()=>validatedVoiceCall(call),JSON.stringify(call));
  assert.deepEqual(validatedVoiceCall({name:'prepare_comment',args:{comment:'invertieren',reference:null,unit:''}}),{name:'prepare_comment',args:{comment:'invertieren',reference:null,unit:''}});
  assert.deepEqual(validatedVoiceCall({name:'observe_point',args:{enabled:false}}).args,{enabled:false});
});

test('Apple prompt keeps exact plant identifiers and relevant global terms within bounded history',()=>{
  const result=JSON.parse(appleVoicePrompt({text:'Wert von Zulufttemperatur Anlage 2.10',context:{
    project:'Projekt',station:'Station',selected:{name:'Zulufttemp. 2.1',value:'old value',unit:'°C'},
    vocabulary:[{short:'ZU',meaning:'Zulufttemperatur',aliases:['Zulufttemp.']},...Array.from({length:100},(_,i)=>({short:'X'+i,meaning:'Andere'+i,aliases:[]}))]
  },history:Array.from({length:30},()=>({user:'lang'.repeat(900),app:'x'.repeat(5000)})),lastResult:{candidates:[{number:2,point:{name:'Zulufttemp. 2.10',terminal:'AI3',unit:'°C'}}]}}));
  assert.equal(result.user,'Wert von Zulufttemperatur Anlage 2.10');
  assert.equal(result.selected.name,'Zulufttemp. 2.1');
  assert.equal(result.selected.value,undefined);
  assert.equal(result.candidates[0].point.name,'Zulufttemp. 2.10');
  assert.equal(result.vocabulary.length,1);
  assert.equal(result.vocabulary[0].short,'ZU');
  assert.equal(result.recent.length,2);
  assert.ok(result.recent.every(h=>h.user.length<=260 && h.app.length<=500));
  assert.throws(()=>appleVoicePrompt({text:'x'.repeat(1201)}));
});

test('local narration speaks fresh tool facts and only verified saving results',()=>{
  const point={name:'Zulufttemperatur Anlage 2.1',terminal:'AI3',online:true,value:'24,8',unit:'°C'};
  assert.match(guidedNarration({selected:point}),/Aktuell 24,8 °C/);
  assert.doesNotMatch(guidedNarration({selected:{...point,online:false}}),/24,8/);
  assert.match(guidedNarration({observing:true,selected:point}),/beobachte/);
  assert.match(guidedNarration({candidates:[{number:2,point}]}),/Treffer 2:.*Welchen Treffer/);
  assert.equal(guidedNarration({confirmationPrompt:'Vollständiger Entwurf. Speichern?'}),'Vollständiger Entwurf. Speichern?');
  assert.doesNotMatch(guidedNarration({saved:true,point:'AI3'}),/gespeichert/);
  assert.match(guidedNarration({saved:true,controllerVerified:true,point:'AI3'}),/gespeichert und am Controller bestätigt/);
  assert.match(guidedNarration({observation:'steigt',point}),/Jetzt 24,8 °C/);
  for (const text of ['Ja aber nicht speichern','Ja wenn es passt','Nein','Vielleicht ja']) assert.notEqual(guidedConfirmation(text).action,'confirm');
});

test('bundled JavaScript used by native clients matches provider schemas, narration and validation',()=>{
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync(new URL('../Resources/LanguageCore.js',import.meta.url),'utf8'),context);
  const call=r=>JSON.parse(context.mobileCall(JSON.stringify(r)));
  const input={model:googleVoiceModel,context:{station:'2.1'}};
  assert.deepEqual(call({operation:'googleVoiceSetup',...input}).value,googleVoiceSetup(input));
  assert.equal(call({operation:'validatedVoiceCall',name:'write',args:{}}).ok,false);
  assert.deepEqual(call({operation:'validatedVoiceCall',name:'read_point',args:{}}).value,{name:'read_point',args:{}});
  assert.equal(call({operation:'appleVoicePrompt',text:'Zuluft Anlage 2.1'}).value,appleVoicePrompt({text:'Zuluft Anlage 2.1'}));
  assert.equal(call({operation:'guidedNarration',result:{saved:true,controllerVerified:true,point:'AI3'}}).value,guidedNarration({saved:true,controllerVerified:true,point:'AI3'}));
});

test('Google broker creates one-use short-lived raw REST tokens locked to the server model',async()=>{
  let request;
  const broker=createGoogleVoiceBroker({apiKey:'test-private-key',clock:()=>1_000,fetchImpl:async(url,options)=>{
    request={url,...options};return new Response(JSON.stringify({name:'auth_tokens/test-only',ignored:'must-not-leak'}));
  }});
  const ticket=await broker({});
  assert.deepEqual(ticket,{secret:'auth_tokens/test-only',model:googleVoiceModel,expiresAt:61,maxSeconds:600,provider:'google',apiVersion:'v1beta'});
  assert.equal(request.url,'https://generativelanguage.googleapis.com/v1beta/auth_tokens');
  assert.equal(request.headers['x-goog-api-key'],'test-private-key');
  assert.equal(request.redirect,'error');
  assert.deepEqual(JSON.parse(request.body),{uses:1,newSessionExpireTime:new Date(61_000).toISOString(),expireTime:new Date(601_000).toISOString(),fieldMask:'model',bidiGenerateContentSetup:{model:'models/'+googleVoiceModel}});
  assert.ok(!JSON.stringify(ticket).includes('test-private-key'));
  assert.equal(ticket.ignored,undefined);
  for (const bad of [null,[],3,{password:'test'},{model:'gemini-other'},{context:{}}]) await assert.rejects(broker(bad),e=>e.status===400);
});

test('Google readiness never contacts upstream, consumes quota, or implies key validity',async()=>{
  let count=0;
  const broker=createGoogleVoiceBroker({apiKey:'test-only',clock:()=>1000,fetchImpl:async()=>{count++;return new Response('{"name":"auth_tokens/test-only"}');}});
  for(let i=0;i<40;i++)assert.deepEqual(broker.status(),{service:'bacsolution-google-voice',schema:1,configured:true,model:googleVoiceModel,maxSeconds:600});
  assert.equal(count,0);
  for(let i=0;i<12;i++)await broker({});
  assert.equal(count,12);
  await assert.rejects(broker({}),e=>e.status===429);
  const absent=createGoogleVoiceBroker({apiKey:'  '});
  assert.equal(absent.status().configured,false);
  await assert.rejects(absent({}),e=>e.status===503);
});

test('Google token requests refuse concurrency and allow later starts only after a completed request',async()=>{
  let release;
  const broker=createGoogleVoiceBroker({apiKey:'test-only',clock:()=>1000,fetchImpl:()=>new Promise(resolve=>{release=resolve;})});
  const first=broker({});
  await assert.rejects(broker({}),e=>e.status===429);
  release(new Response('{"name":"auth_tokens/test-only"}'));
  assert.equal((await first).provider,'google');
});

test('Google errors and malformed or expired tokens never forward upstream secrets',async()=>{
  for (const payload of ['not-json','{}','{"name":"private-key"}','{"name":"auth_tokens/with space"}','x'.repeat(20_001)]) {
    const broker=createGoogleVoiceBroker({apiKey:'private-test-key',fetchImpl:async()=>new Response(payload)});
    await assert.rejects(broker({}),e=>e.status===502 && !e.message.includes('private-test-key'));
  }
  let now=1000;
  await assert.rejects(createGoogleVoiceBroker({apiKey:'test',clock:()=>now,fetchImpl:async()=>{now+=61000;return new Response('{"name":"auth_tokens/expired"}');}})({}),e=>e.status===502);
  await assert.rejects(createGoogleVoiceBroker({apiKey:'test',fetchImpl:async()=>new Response('private-error',{status:429})})({}),e=>e.status===429 && !e.message.includes('private-error'));
  await assert.rejects(createGoogleVoiceBroker({apiKey:'test',fetchImpl:async()=>{throw new Error('private-error');}})({}),e=>e.status===502 && !e.message.includes('private-error'));
  assert.throws(()=>createGoogleVoiceBroker({model:'models/untrusted'}));
});

test('Google and OpenAI routes remain isolated behind workspace auth and schema',async t=>{
  let googleCalls=0,openAICalls=0;
  const googleVoice=createGoogleVoiceBroker({apiKey:'google-only',clock:()=>1000,fetchImpl:async()=>{googleCalls++;return new Response('{"name":"auth_tokens/test-only"}');}});
  const voice=async()=>{openAICalls++;return {provider:'openai-test'};};
  voice.status=()=>({service:'bacsolution-io-voice',schema:1,configured:false,model:'',maxSeconds:600});
  const token='local-test-token-at-least-32-characters';
  const server=createServer({},token,{voice,googleVoice});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base+'/v1/voice/google/status')).status,401);
  assert.equal((await fetch(base+'/v1/voice/google/status',{headers:{Authorization:`Bearer ${token}`}})).status,400);
  const headers={Authorization:`Bearer ${token}`,'X-BACsolution-Schema':'1','Content-Type':'application/json'};
  const response=await fetch(base+'/v1/voice/google/status',{headers});
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),googleVoice.status());
  assert.equal(googleCalls,0);assert.equal(openAICalls,0);
  const session=await fetch(base+'/v1/voice/google/session',{headers,method:'POST',body:'{}'});
  assert.equal(session.status,200);assert.equal((await session.json()).provider,'google');
  assert.equal(googleCalls,1);assert.equal(openAICalls,0);
  const old=await fetch(base+'/v1/voice/session',{headers,method:'POST',body:'{}'});
  assert.equal((await old.json()).provider,'openai-test');assert.equal(openAICalls,1);
  assert.equal((await fetch(base+'/v1/voice/google/session',{headers,method:'POST',body:'{"password":"private"}'})).status,400);
  assert.equal(googleCalls,1);
});

test('server without Google configuration reports it independently of existing OpenAI configuration',async t=>{
  const token='local-test-token-at-least-32-characters';
  const server=createServer({},token,{voice:async()=>({})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base=`http://127.0.0.1:${server.address().port}/v1/voice/google`;
  const headers={Authorization:`Bearer ${token}`,'X-BACsolution-Schema':'1','Content-Type':'application/json'};
  assert.equal((await (await fetch(base+'/status',{headers})).json()).configured,false);
  assert.equal((await fetch(base+'/session',{headers,method:'POST',body:'{}'})).status,503);
});
