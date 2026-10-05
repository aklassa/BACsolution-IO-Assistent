import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

test('controller transport suppresses legacy focus/select before login without changing input values', () => {
  let focused = 0, selected = 0;
  class HTMLElement { focus() { focused++; } }
  class HTMLInputElement extends HTMLElement { select() { selected++; } }
  class HTMLTextAreaElement extends HTMLElement { select() { selected++; } }
  const listeners = {};
  const window = {addEventListener: (name, handler) => { listeners[name] = handler; }};
  const context = vm.createContext({HTMLElement, HTMLInputElement, HTMLTextAreaElement, window, URL,
    location:{href:'http://controller.test/webui/liob/iotest'}});
  vm.runInContext(fs.readFileSync(new URL('../Resources/ControllerTransport.js', import.meta.url), 'utf8'), context);
  const password = new HTMLInputElement();
  password.value = 'only-native-input-is-edited';
  password.focus(); password.select(); new HTMLElement().focus(); new HTMLTextAreaElement().select();
  assert.equal(focused, 0); assert.equal(selected, 0);
  assert.equal(password.value, 'only-native-input-is-edited');
  listeners.error({target:window, error:{name:'TypeError'}, filename:'http://controller.test/webui/base.jsz?private-token', message:'private-page-text'});
  listeners.error({target:{src:'http://controller.test/prototype.jsz?private-token'}});
  listeners.unhandledrejection({reason:'private-token'});
  assert.equal(window.__bacIOTransportDiagnostics.scriptErrors, 2);
  assert.equal(window.__bacIOTransportDiagnostics.resourceErrors, 1);
  assert.equal(window.__bacIOTransportDiagnostics.firstScriptError, 'TypeError');
  assert.equal(window.__bacIOTransportDiagnostics.firstScriptSource, 'base');
  assert.equal(window.__bacIOTransportDiagnostics.firstResourceSource, 'prototype');
  assert.ok(!JSON.stringify(window.__bacIOTransportDiagnostics).includes('private-'));
});

// Both Codemagic workflows already run npm test on macOS. This checks actual
// Swift policy code there; Linux/Windows report an explicit skip, never a pass.
test('native TLS policy rejects host/port changes and requires approval for certificate replacement',
  {skip: process.platform !== 'darwin' ? 'Requires Swift/macOS; runs in Codemagic' : false}, () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bac-io-tls-'));
    try {
      const binary = path.join(temp, 'connection-policy');
      const compile = spawnSync('xcrun', ['swiftc', path.join(root, 'App/ControllerConnectionPolicy.swift'),
        path.join(root, 'Tests/ControllerConnectionPolicyTests.swift'), '-o', binary], {encoding:'utf8', timeout:60000});
      assert.equal(compile.status, 0, compile.stderr || compile.error?.message);
      const result = spawnSync(binary, [], {encoding:'utf8', timeout:10000});
      assert.equal(result.status, 0, result.stderr || result.error?.message);
      assert.match(result.stdout, /16 native certificate-policy checks passed/);
    } finally { fs.rmSync(temp, {recursive:true, force:true}); }
  });
