import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {controllerPageContext} from '../Shared/controller-page.js';

const origin = 'http://controller.test';
const token = 'TEST-CSRF-FROM-HTML';
const metadata = (loggedIn = false, role = 'operator') => ({loggedIn, prodCode:'LIOB-589', role, date:'fixture', username:'PRIVATE-ACCOUNT', menu:['not-exported']});
const inline = (base, csrf = token) => [
  {textContent:`g_session_tag=1;\ng_csrf_token=${JSON.stringify(csrf)};`},
  {textContent:`var optBase = ${JSON.stringify(base)};\nwindow.unrelated = 'not-executed';`}
];
const loginSource = fs.readFileSync(new URL('../Resources/ControllerLogin.js', import.meta.url), 'utf8');
const ioSource = fs.readFileSync(new URL('../Resources/ControllerBridge.js', import.meta.url), 'utf8');

function fixture() {
  const form = {method:'post'};
  const fields = {loginForm:form, loginContainer:{}, username:{form,value:'untouched'}, password:{form,type:'password',value:'untouched'}};
  const document = {readyState:'complete', getElementById:id => fields[id] ?? null, scripts:inline(metadata()), querySelectorAll:() => []};
  let authenticated = false;
  const calls = [], row = {objIdx:0,type:1,value:['21.4','°C',0],opmode:['Auto','',0],ioName:'Zulufttemperatur Anlage 2.1',term:'UI1',dscr:'',testState:0,testDate:'',testComment:'',dpPath:'Local IO/UI1',hwType:'in_ana'};
  const context = vm.createContext({document, location:{origin,protocol:'http:',pathname:'/webui/liob/iotest'},
    URLSearchParams, AbortController, setTimeout, clearTimeout,
    fetch:async (path, options) => {
      const params = Object.fromEntries(new URLSearchParams(options.body)); calls.push({path,params,options});
      assert.equal(options.headers['X-Csrf-Token'], token);
      assert.equal(options.credentials, 'same-origin');
      assert.equal(options.redirect, 'error');
      if (path === '/webui/login') {
        assert.deepEqual(params,{username:'operator',password:' exact & password '});
        authenticated = true;
        return {ok:true,status:200,text:async () => '{"loggedIn":"1","loginState":1}'};
      }
      assert.equal(authenticated, true);
      if (path === '/webui/liob/liob_io_value_save') {
        assert.equal(params.prop,'testComment'); row.testComment = params.value;
        return {ok:true,text:async () => '{"saveErr":0}'};
      }
      assert.equal(path,'/webui/liob/overview/action');
      const keys = Object.keys(row);
      return {ok:true,text:async () => JSON.stringify({devs:[{idx:0,name:'Test',ios:[keys.length,...keys,...keys.map(k => row[k])]}]})};
    }});
  const page = () => JSON.parse(vm.runInContext(`JSON.stringify((${controllerPageContext.toString()})(${JSON.stringify(origin)}))`,context));
  const run = async (source, request) => {
    context.request = {origin,...request};
    return JSON.parse(await vm.runInContext(`(async function(request){${source}})(request)`,context));
  };
  return {context,document,fields,calls,page,run,
    login:(operation = 'inspect',extra = {}) => run(loginSource,{operation,username:'operator',password:' exact & password ',...extra}),
    io:request => run(ioSource,request),
    loadIO(role = 'operator') {
      Object.keys(fields).forEach(key => delete fields[key]);
      document.scripts = [...inline(metadata(true,role)),{textContent:'function l__onload(){var opt = {"tabs":[[0,"Local I/O"]]}; opt.ioTest = true;}'}];
    }};
}

test('reported 0.1.5 state: complete login form works without any LOYTEC globals', async () => {
  const f = fixture();
  assert.equal(vm.runInContext('typeof LoginPage + "," + typeof optBase + "," + typeof g_csrf_token',f.context),'undefined,undefined,undefined');
  const state = await f.login();
  assert.equal(state.state,'login');
  assert.equal(state.diagnostics.flags.loginClass,false);
  for (const key of ['form','username','password','inputsLinked','passwordInput','postForm','loginContainer','controllerBrand','csrf','baseFromHTML','csrfFromHTML']) {
    assert.equal(state.diagnostics.flags[key],true,key);
  }
  assert.equal(f.calls.length,0);
  assert.equal((await f.login('authenticate')).state,'authenticated');
  assert.equal(f.calls.length,1);
  assert.equal(f.fields.password.value,'untouched');
  for (const secret of [token,'PRIVATE-ACCOUNT','exact & password']) assert.ok(!JSON.stringify(state).includes(secret));
});

test('login, fresh I/O read and confirmed comment readback also work without globals', async () => {
  const f = fixture();
  await f.login('authenticate'); f.loadIO();
  assert.equal((await f.login()).state,'authenticated');
  const info = await f.io({operation:'info'});
  assert.equal(info.product,'LIOB-589'); assert.equal(info.canEdit,true);
  const data = await f.io({operation:'read',inst:0});
  assert.equal(data.points[0].value.text,'21.4');
  const point = data.points[0];
  const saved = await f.io({operation:'write',inst:0,
    target:{dev:0,objType:1,objIdx:0,terminal:'UI1'},
    expected:{name:point.name,testState:0,testDate:'',testComment:''},
    change:{prop:'testComment',value:'Referenzmessung 22 °C; Abweichung −0,6 °C'}});
  assert.equal(saved.verified,true);
  assert.equal(saved.point.testComment,'Referenzmessung 22 °C; Abweichung −0,6 °C');
  assert.equal(f.calls.filter(c => c.path === '/webui/login').length,1);
  assert.deepEqual(f.calls.slice(-3).map(c => c.path),['/webui/liob/overview/action','/webui/liob/liob_io_value_save','/webui/liob/overview/action']);
});

test('hidden CSRFToken field is accepted only from the recognized login form', async () => {
  const f = fixture(); f.document.scripts = inline(metadata()).slice(1);
  f.fields.loginForm.querySelectorAll = () => [{form:f.fields.loginForm,value:token}];
  assert.equal(f.page().csrfSource,'form');
  assert.equal((await f.login('authenticate')).state,'authenticated');
  const other = fixture(); other.document.scripts = inline(metadata()).slice(1);
  other.fields.loginForm.querySelectorAll = () => [{form:{},value:token}];
  assert.equal((await other.login('authenticate')).state,'error'); assert.equal(other.calls.length,0);
});

test('inline parser handles nested JSON and escaped text but never executes expressions', async () => {
  const f = fixture();
  f.document.scripts = inline({...metadata(),menu:[{text:'}; optBase = "escaped \\" text";',children:[1,2]}]});
  assert.equal(f.page().base.prodCode,'LIOB-589');
  assert.deepEqual(Object.keys(f.page().base).sort(),['date','loggedIn','prodCode','role']);
  for (const text of [
    `var optBase = (() => {globalThis.executed=true;return ${JSON.stringify(metadata())};})();`,
    `// var optBase = ${JSON.stringify(metadata())};`,
    `/*\nvar optBase = ${JSON.stringify(metadata())};\n*/`,
    `const example = ${JSON.stringify('var optBase = '+JSON.stringify(metadata())+';')};`,
    `function example(){\nvar optBase = ${JSON.stringify(metadata())};\n}`,
    `var optBase = ${JSON.stringify(metadata())} + (globalThis.executed=true);`
  ]) {
    const g = fixture(); g.document.scripts = [{textContent:text},inline(metadata())[0]];
    assert.equal((await g.login('authenticate')).state,'error');
    assert.equal(g.calls.length,0); assert.equal(g.context.executed,undefined);
  }
});

test('conflicting page metadata or CSRF tokens stop before a password request', async () => {
  for (const change of [
    f => f.document.scripts.push({textContent:`var optBase = ${JSON.stringify(metadata(true))};`}),
    f => f.document.scripts.push({textContent:'g_csrf_token="CONFLICTING-TOKEN";'}),
    f => { f.fields.loginForm.querySelectorAll = () => [{form:f.fields.loginForm,value:'CONFLICTING-TOKEN'}]; }
  ]) {
    const f = fixture(); change(f);
    assert.equal((await f.login('authenticate')).code,'controller-page-data-ambiguous');
    assert.equal(f.calls.length,0);
  }
});

test('live controller permissions and tokens take priority; unknown roles never gain writes', async () => {
  for (const role of ['viewer','user','unknown','operator-extra','']) {
    const f = fixture(); await f.login('authenticate'); f.loadIO(role);
    assert.equal((await f.io({operation:'info'})).canEdit,false);
    await assert.rejects(f.io({operation:'write',inst:0}),/keine Änderungen/);
  }
  const f = fixture(); f.loadIO(); f.context.g_LBase = {editAllowedByRole:() => false};
  assert.equal((await f.io({operation:'info'})).canEdit,false);
  f.context.g_csrf_token = 'CURRENT-GLOBAL-TOKEN';
  assert.equal(f.page().csrfToken,'CURRENT-GLOBAL-TOKEN'); assert.equal(f.page().csrfSource,'global');
});

test('HTML fallback never accepts another origin, missing token or output actuation', async () => {
  const wrong = fixture(); assert.equal((await wrong.login('authenticate',{origin:'http://another.test'})).state,'error'); assert.equal(wrong.calls.length,0);
  const missing = fixture(); missing.document.scripts = inline(metadata()).slice(1);
  assert.equal((await missing.login('authenticate')).state,'error'); assert.equal(missing.calls.length,0);
  const f = fixture(); await f.login('authenticate'); f.loadIO();
  await assert.rejects(f.io({operation:'write',inst:0,target:{},expected:{},change:{prop:'val',value:100}}),/Nur Testergebnis/);
  assert.equal(f.calls.length,1);
});

if (process.env.LOYTEC_SOURCE_HTML) test('literal extraction works on the supplied firmware HTML without executing it', () => {
  const html = fs.readFileSync(process.env.LOYTEC_SOURCE_HTML,'utf8');
  const f = fixture();
  f.document.scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => ({textContent:match[1]}));
  const page = f.page();
  assert.equal(page.base.prodCode,'LIOB-589'); assert.equal(page.base.loggedIn,true);
  assert.equal(page.baseSource,'inline'); assert.equal(page.csrfSource,'inline');
  assert.ok(page.csrfToken.length > 0); assert.equal(page.canEdit,true);
});
