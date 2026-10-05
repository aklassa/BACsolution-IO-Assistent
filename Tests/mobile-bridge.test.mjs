import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { searchPoints, commandFrom } from '../Shared/model.js';
import { effectiveTerms } from '../Shared/language.js';

const source = fs.readFileSync(new URL('../Resources/LanguageCore.js', import.meta.url), 'utf8');
function native(operation, args = {}) {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const response = JSON.parse(context.mobileCall(JSON.stringify({operation, ...args})));
  if (!response.ok) throw new Error(response.error);
  return response.value;
}
const points = [
  {key:'one', name:'ZUL Temp. Anlage 2.1', description:'Zulufttemperatur', terminal:'UI1', deviceName:'Station 1', busName:'Local I/O'},
  {key:'two', name:'ZUL Temp. Anlage 2.10', description:'Zulufttemperatur', terminal:'UI2', deviceName:'Station 1', busName:'Local I/O'}
];
test('native bundled search preserves numeric identity and existing abbreviation rules', () => {
  const text = 'Zulufttemperatur Anlage zwei Punkt eins';
  assert.deepEqual(native('search', {points,text}), searchPoints(points,text));
  assert.equal(native('search', {points,text}).matches[0].key, 'one');
  assert.equal(native('terms').length, 58);
  assert.deepEqual(native('terms'), effectiveTerms([]));
});
test('bridge accepts structured free text without evaluating controller text or comments', () => {
  for (const text of ['Wert von Zulufttemperatur Anlage 2.1', 'Nicht OK', 'Speichern', 'Kommentar: "); throw new Error("INJECTED"); //', 'Nicht speichern', 'Ventil einschalten']) {
    assert.deepEqual(native('command', {text}), commandFrom(text));
  }
  assert.equal(native('command', {text:'Kommentar: Ausgang einschalten und speichern'}).action, 'comment');
});
test('native term validation rejects collisions, command aliases and station numbers', () => {
  const terms = [{short:'RT',meaning:'Raumtemperatur',aliases:['Raum Sensor']}];
  assert.equal(native('validateTerms',{terms})[0].aliases[0], 'Raum Sensor');
  assert.throws(() => native('validateTerms',{terms:[{short:'UI1',meaning:'Raumtemperatur'}]}), /Klemmen/);
  assert.throws(() => native('validateTerms',{terms:[{short:'RT',meaning:'Raumtemperatur',aliases:['Speichern']}]}), /Sprachbefehle/);
  assert.throws(() => native('validateTerms',{terms:[{short:'RF',meaning:'Raumfeuchte',aliases:['Raum Temp']}]}), /anderen Bedeutung/);
});
test('controller resource executes an awaited task with the argument supplied by WKWebView', async () => {
  const script = fs.readFileSync(new URL('../Resources/ControllerBridge.js', import.meta.url), 'utf8');
  const context = vm.createContext({location:{origin:'http://controller.test',protocol:'http:',pathname:'/webui/liob/iotest'},
    optBase:{loggedIn:true,prodCode:'LIOB-589',date:'fixture'},g_csrf_token:'TEST-ONLY',g_LBase:{editAllowedByRole:()=>false},
    document:{scripts:[{textContent:'var opt = {"tabs":[[0,"Local I/O"]]}; opt.ioTest=true;'}]},
    request:{operation:'info',origin:'http://controller.test'}});
  const value = JSON.parse(await vm.runInContext(`(async function(request){${script}})(request)`,context));
  assert.equal(value.product, 'LIOB-589'); assert.equal(value.canEdit,false);
  context.request.origin = 'https://another.test';
  await assert.rejects(vm.runInContext(`(async function(request){${script}})(request)`,context), /zugeordnete/);
});
