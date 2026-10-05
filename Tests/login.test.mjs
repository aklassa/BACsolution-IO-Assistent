import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script = fs.readFileSync(new URL('../Resources/ControllerLogin.js', import.meta.url), 'utf8');
const credentials = {username: 'operator', password: '  Päss &+="\'\\$();\n  '};

function fixture({result = {loggedIn:'1', loginState:1}, responseText, httpStatus = 200, fetchError} = {}) {
  const form = {method:'post'};
  const fields = {
    loginForm: form,
    username: {form, value:'unchanged-account'},
    password: {form, type:'password', value:'unchanged-password'}
  };
  const requests = [];
  const context = vm.createContext({
    location: {origin:'http://controller.test', protocol:'http:', pathname:'/webui/liob/iotest'},
    LoginPage: function LoginPage() {},
    document: {readyState:'complete', getElementById: id => fields[id] ?? null},
    g_csrf_token: 'test-only-csrf',
    URLSearchParams, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      requests.push({url, options});
      if (fetchError) throw fetchError;
      return {ok: httpStatus >= 200 && httpStatus < 300, status:httpStatus,
        text:async () => responseText ?? JSON.stringify(result)};
    }
  });
  async function call(operation = 'authenticate', extra = {}) {
    context.request = {origin:'http://controller.test', operation, ...credentials, ...extra};
    const text = await vm.runInContext(`(async function(request){${script}})(request)`, context);
    return JSON.parse(text);
  }
  return {context, requests, fields, call};
}

test('native login uses the observed LOYTEC session endpoint and exact password encoding', async () => {
  const f = fixture();
  assert.equal((await f.call()).state, 'authenticated');
  assert.equal(f.requests.length, 1);
  const {url, options} = f.requests[0];
  assert.equal(url, '/webui/login');
  assert.equal(options.method, 'POST');
  assert.equal(options.credentials, 'same-origin');
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers['X-Create-Session'], '1');
  assert.equal(options.headers['X-Csrf-Token'], 'test-only-csrf');
  const body = new URLSearchParams(options.body);
  assert.deepEqual(Object.fromEntries(body), credentials);
  assert.equal(f.fields.username.value, 'unchanged-account');
  assert.equal(f.fields.password.value, 'unchanged-password');
});

test('page inspection never sends credentials or modifies browser inputs', async () => {
  const f = fixture();
  const reply = await f.call('inspect');
  assert.equal(reply.state, 'login');
  assert.equal(reply.code, 'login-form-ready');
  assert.equal(reply.diagnostics.flags.inputsLinked, true);
  assert.equal(f.requests.length, 0);
});

test('wrong origin, protocol and unrelated controller pages cannot receive credentials', async () => {
  for (const location of [
    {origin:'http://another.test'}, {origin:'https://controller.test'},
    {origin:'http://controller.test:8080'}, {protocol:'file:'}, {pathname:'/webui/config/passwords'}
  ]) {
    const f = fixture();
    Object.assign(f.context.location, location);
    assert.equal((await f.call()).state, 'error');
    assert.equal(f.requests.length, 0);
  }
});

test('unknown pages and cross-form password fields stop before authentication', async () => {
  for (const change of [
    f => { f.fields.password.form = {}; },
    f => { delete f.fields.username; },
    f => { f.fields.loginForm.method = 'get'; },
    f => { delete f.context.LoginPage; }
  ]) {
    const f = fixture(); change(f);
    assert.equal((await f.call()).state, 'error');
    assert.equal(f.requests.length, 0);
  }
});

test('missing credentials and missing CSRF token never trigger a login attempt', async () => {
  for (const extra of [{username:''}, {password:''}, {username:null}]) {
    const f = fixture();
    assert.equal((await f.call('authenticate', extra)).state, 'error');
    assert.equal(f.requests.length, 0);
  }
  const f = fixture(); delete f.context.g_csrf_token;
  assert.equal((await f.call()).state, 'error');
  assert.equal(f.requests.length, 0);
});

test('incorrect passwords and account throttling return actionable errors without retries', async () => {
  const wrong = fixture({result:{loggedIn:'0', authFail:[]}});
  assert.match((await wrong.call()).message, /Benutzername und Passwort prüfen/);
  assert.equal(wrong.requests.length, 1);
  const blocked = fixture({result:{loggedIn:'0', authFail:['operator']}});
  assert.match((await blocked.call()).message, /zu viele Anmeldeversuche/);
  assert.equal(blocked.requests.length, 1);
});

test('password-change/default-password confirmation is never silently acknowledged', async () => {
  const response = fixture({result:{loggedIn:'1', loginState:2}});
  assert.equal((await response.call()).state, 'actionRequired');
  assert.equal(response.requests.length, 1);
  for (const node of ['confirmWarnForm', 'passwdInitContainer']) {
    const page = fixture(); page.fields[node] = {};
    assert.equal((await page.call()).state, 'actionRequired');
    assert.equal(page.requests.length, 0);
  }
});

test('HTML, malformed, oversized and unconfirmed responses are not login success', async () => {
  for (const responseText of ['<html>Login again</html>', '{bad', 'null', '{}',
    JSON.stringify({loggedIn:'maybe'}), 'x'.repeat(65537)]) {
    const f = fixture({responseText});
    assert.equal((await f.call()).state, 'error');
    assert.equal(f.requests.length, 1);
  }
  const denied = fixture({httpStatus:403});
  assert.match((await denied.call()).message, /HTTP 403/);
});

test('only login operations are supported and an authenticated page is not logged in again', async () => {
  const f = fixture();
  assert.equal((await f.call('write')).state, 'error');
  assert.equal(f.requests.length, 0);
  delete f.fields.loginForm;
  f.context.optBase = {loggedIn:true, prodCode:'LIOB-589'};
  assert.equal((await f.call('inspect')).state, 'authenticated');
  assert.equal(f.requests.length, 0);
});

test('delayed form construction can be inspected again without sending credentials', async () => {
  const f = fixture();
  const savedFields = {...f.fields};
  Object.keys(f.fields).forEach(key => delete f.fields[key]);
  const pending = await f.call('inspect');
  assert.equal(pending.state, 'pending');
  assert.equal(pending.code, 'page-not-ready');
  assert.equal(pending.diagnostics.flags.form, false);
  assert.equal(f.requests.length, 0);
  Object.assign(f.fields, savedFields);
  assert.equal((await f.call('inspect')).state, 'login');
  assert.equal(f.requests.length, 0);
  assert.equal((await f.call()).state, 'authenticated');
  assert.equal(f.requests.length, 1);
});

test('a missing legacy constructor does not block a positively identified LOYTEC form', async () => {
  const f = fixture();
  delete f.context.LoginPage;
  f.fields.loginContainer = {};
  f.context.optBase = {loggedIn:false, prodCode:'LIOB-589'};
  const reply = await f.call('inspect');
  assert.equal(reply.state, 'login');
  assert.equal(reply.diagnostics.flags.loginClass, false);
  assert.equal(reply.diagnostics.flags.controllerBrand, true);
  assert.equal((await f.call()).state, 'authenticated');
  assert.equal(f.requests.length, 1);
});

test('metadata fallback still requires a complete known form, controller identity and CSRF', async () => {
  for (const change of [
    f => { delete f.fields.loginContainer; },
    f => { f.context.optBase.prodCode = 'unrelated-product'; },
    f => { delete f.context.g_csrf_token; },
    f => { f.fields.password.form = {}; },
    f => { f.fields.password.type = 'text'; },
    f => { delete f.fields.username; },
    f => { f.fields.loginForm.method = 'get'; },
    f => { f.context.optBase.loggedIn = true; }
  ]) {
    const f = fixture();
    delete f.context.LoginPage;
    f.fields.loginContainer = {};
    f.context.optBase = {loggedIn:false, prodCode:'LIOB-589'};
    change(f);
    const reply = await f.call();
    assert.equal(reply.state, 'error');
    assert.equal(reply.code, 'login-form-unrecognized');
    assert.equal(f.requests.length, 0);
  }
});

test('DOM form attributes are read even when a named control shadows the method property', async () => {
  const f = fixture();
  f.fields.loginForm.method = {value:'unrelated-control'};
  f.fields.loginForm.getAttribute = name => name === 'method' ? 'POST' : null;
  assert.equal((await f.call()).state, 'authenticated');
  assert.equal(f.requests.length, 1);
});

test('incomplete and unrelated pages cannot authenticate or claim an existing session', async () => {
  const f = fixture();
  Object.keys(f.fields).forEach(key => delete f.fields[key]);
  f.context.optBase = {loggedIn:true, prodCode:'unrelated-product'};
  assert.equal((await f.call('inspect')).state, 'pending');
  assert.equal((await f.call()).state, 'error');
  assert.equal(f.requests.length, 0);
});

test('diagnostics contain only fixed presence flags and bounded error counts', async () => {
  const f = fixture();
  f.context.__bacIOTransportDiagnostics = {scriptErrors:2, resourceErrors:1000, message:'private-page-data', firstScriptError:'private-page-data', firstScriptSource:'private-page-data', firstResourceSource:'private-page-data'};
  const {diagnostics} = await f.call('inspect');
  assert.equal(diagnostics.readyState, 'complete');
  assert.equal(diagnostics.scriptErrors, 2);
  assert.equal(diagnostics.resourceErrors, 999);
  assert.deepEqual(Object.keys(diagnostics).sort(), ['firstResourceSource','firstScriptError','firstScriptSource','flags','readyState','resourceErrors','scriptErrors']);
  assert.ok(Object.values(diagnostics.flags).every(value => typeof value === 'boolean'));
  assert.ok(!JSON.stringify(diagnostics).includes('private-page-data'));
});

test('unexpected page exceptions cannot leak secrets through login errors', async () => {
  const secret = 'private-account-password-token';
  const failures = [new Error(secret), Object.assign(new Error(secret), {loginCode:secret}), secret];
  for (const fetchError of failures) {
    const f = fixture({fetchError});
    const reply = await f.call();
    assert.equal(reply.state, 'error');
    assert.equal(reply.code, 'login-script-error');
    assert.ok(!JSON.stringify(reply).includes(secret));
    assert.equal(f.requests.length, 1);
  }
});

test('native reply never exposes account names, passwords, response bodies or session tokens', async () => {
  const f = fixture({result:{loggedIn:'1', loginState:1, password:credentials.password, token:'server-secret'}});
  const reply = JSON.stringify(await f.call());
  for (const secret of ['operator', 'Päss', 'test-only-csrf', 'server-secret']) assert.ok(!reply.includes(secret));
  const malformed = fixture({responseText: credentials.password});
  const error = JSON.stringify(await malformed.call());
  assert.ok(!error.includes('Päss'));
});

test('a login timeout aborts the request, clears its timer and does not retry', async () => {
  const f = fixture();
  let expire, cleared = false;
  f.context.setTimeout = (callback, duration) => { assert.equal(duration, 12000); expire = callback; return 1; };
  f.context.clearTimeout = id => { assert.equal(id, 1); cleared = true; };
  f.context.fetch = (url, options) => {
    f.requests.push({url, options});
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), {once:true});
    });
  };
  const pending = f.call();
  expire();
  const reply = await pending;
  assert.equal(reply.state, 'error');
  assert.match(reply.message, /Zeitüberschreitung/);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].options.signal.aborted, true);
  assert.equal(cleared, true);
});
