import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { controllerTask } from '../Shared/protocol.js';
import { parseCsv, commandFrom, matchingPoints, clean } from '../Shared/model.js';

const origin = 'https://controller.test';
const columns = ['objIdx', 'type', 'value', 'opmode', 'ioName', 'term', 'dscr', 'testState', 'testDate', 'testComment', 'dpPath', 'hwType'];
const pack = rows => [columns.length, ...columns, ...rows.flatMap(row => columns.map(k => row[k]))];
function fixture() {
  return [
    { objIdx: 0, type: 1, value: ['20.50', '°C', 0, 105, []], opmode: ['Auto', '', 1, 204, []], ioName: 'Temperatur Büro', term: 'UI1', dscr: '', testState: 0, testDate: '', testComment: '', dpPath: 'Local IO/UI1', hwType: 'in_ana' },
    { objIdx: 1, type: 1, value: ['OPEN', '', 0, 105, [['0', 'OPEN'], ['1', 'CLOSED']]], opmode: ['Auto', '', 1, 204, []], ioName: 'Testkontakt', term: 'DI1', dscr: '', testState: 2, testDate: '2026-07-06 16:00:30', testComment: 'Alter Eintrag', dpPath: 'Local IO/DI1', hwType: 'in_digi' },
    { objIdx: 0, type: 2, value: ['OPEN', '', 0, 105, []], opmode: ['Auto', '', 1, 204, []], ioName: 'Testausgang', term: 'DO1', dscr: '', testState: 0, testDate: '', testComment: '', dpPath: 'Local IO/DO1', hwType: 'out_relay' }
  ];
}
function harness({ rows = fixture(), wrongResult = false, errorCode = 0, loggedIn = true, canEdit = true, devFlags, failReadAfterWrite = false } = {}) {
  const calls = []; let wrote = false;
  const opt = { tabs: [[0, 'Local I/O'], [2, 'LIOB-Connect'], [1, 'LIOB-IP']], err: 0, errInst: 0 };
  const context = vm.createContext({ location: { origin, protocol: 'https:', pathname: '/webui/liob/iotest' },
    optBase: { loggedIn, prodCode: 'LIOB-589', date: '2026-10-05 08:28:25' }, g_csrf_token: 'TEST-CSRF-ONLY',
    g_LBase: { editAllowedByRole: () => canEdit }, document: { scripts: [{ textContent: `function l__onload(){var opt = ${JSON.stringify(opt)};\r\nopt.ioTest = true;}` }] },
    URLSearchParams, AbortController, setTimeout, clearTimeout,
    fetch: async (path, options) => {
      const parameters = Object.fromEntries(new URLSearchParams(options.body)); calls.push({ path, parameters, options });
      assert.equal(options.headers['X-Csrf-Token'], 'TEST-CSRF-ONLY');
      assert.equal(options.credentials, 'same-origin');
      if (path === '/webui/liob/liob_io_value_save') {
        const row = rows.find(r => r.type === Number(parameters.obj_type) && r.objIdx === Number(parameters.obj_idx));
        assert.ok(row); assert.equal(parameters.sem_id, '0');
        assert.ok(['testState', 'testComment'].includes(parameters.prop));
        if (!errorCode && !wrongResult) row[parameters.prop] = parameters.prop === 'testState' ? Number(parameters.value) : parameters.value;
        if (!errorCode && parameters.prop === 'testState') row.testDate = '2026-10-05 08:30:00';
        wrote = true;
        return { ok: true, text: async () => JSON.stringify({ saveErr: errorCode }) };
      }
      assert.equal(path, '/webui/liob/overview/action');
      if (wrote && failReadAfterWrite) throw new Error('simulierter Verbindungsabbruch');
      return { ok: true, text: async () => JSON.stringify({ devs: [{ idx: 0, name: 'Testgerät', flagsErr: devFlags, ios: pack(rows) }] }) };
    }
  });
  return { calls, rows, run: request => vm.runInContext(`(${controllerTask.toString()})(${JSON.stringify({ origin, inst: 0, ...request })})`, context) };
}
const target = { dev: 0, objType: 1, objIdx: 0, terminal: 'UI1' };
const expected = { name: 'Temperatur Büro', testState: 0, testDate: '', testComment: '' };
test('read distinguishes input and output with same objIdx and preserves local identifiers', async () => {
  const h = harness(); const data = await h.run({ operation: 'read' });
  assert.equal(data.points.length, 3); assert.equal(new Set(data.points.map(p => p.key)).size, 3);
  assert.equal(data.points[0].value.unit, '°C'); assert.equal(data.points[2].hwType, 'out_relay');
  assert.deepEqual(h.calls.map(c => c.parameters.inst), ['0']);
});
test('status save uses sem_id zero, server timestamp and a separate readback', async () => {
  const h = harness(); const data = await h.run({ operation: 'write', target, expected, change: { prop: 'testState', value: 2 } });
  assert.equal(data.verified, true); assert.equal(data.point.testDate, '2026-10-05 08:30:00');
  assert.equal(h.calls.length, 3); assert.equal(h.calls[1].parameters.obj_type, '1');
  assert.deepEqual(Object.keys(h.calls[1].parameters).sort(), ['value', 'colFlags', 'inst', 'dev', 'obj_type', 'obj_idx', 'sem_id', 'prop'].sort());
});
test('free text including semicolons and umlauts survives form encoding', async () => {
  const h = harness(); const value = 'Büro: +2 °C; Anschluss prüfen & invertieren?';
  const data = await h.run({ operation: 'write', target, expected, change: { prop: 'testComment', value } });
  assert.equal(data.point.testComment, value); assert.equal(data.point.testDate, '');
});
test('actuator and mode writes rejected before a network call', async () => {
  for (const prop of ['val', 'op', 'testDate', 'reset', 'clearAll', '__proto__']) {
    const h = harness(); await assert.rejects(h.run({ operation: 'write', target, expected, change: { prop, value: 1 } }), /Nur Testergebnis/);
    assert.equal(h.calls.length, 0);
  }
});
test('invalid statuses, bus, target and extra semantic fields cannot be sent', async () => {
  for (const value of [0, 4, -1, '2', null]) {
    const h = harness(); await assert.rejects(h.run({ operation: 'write', target, expected, change: { prop: 'testState', value } })); assert.equal(h.calls.length, 0);
  }
  const h = harness(); await assert.rejects(h.run({ operation: 'read', inst: -1 }), /Unbekannter Bus/);
  await assert.rejects(h.run({ operation: 'write', target, expected, change: { prop: 'testState', value: 2, sem_id: 204 } }));
  assert.equal(h.calls.length, 0);
});
test('concurrent edits and renamed/reassigned terminals stop before writing', async () => {
  for (const key of ['name', 'testState', 'testDate', 'testComment']) {
    const h = harness(); await assert.rejects(h.run({ operation: 'write', target, expected: { ...expected, [key]: 'different' }, change: { prop: 'testState', value: 2 } }));
    assert.equal(h.calls.length, 1);
  }
  const h = harness(); await assert.rejects(h.run({ operation: 'write', target: { ...target, terminal: 'UI2' }, expected, change: { prop: 'testState', value: 2 } }));
  assert.equal(h.calls.length, 1);
});
test('login, role and origin checks fail closed', async () => {
  for (const config of [{ loggedIn: false }, { canEdit: false }]) {
    const h = harness(config); await assert.rejects(h.run({ operation: 'write', target, expected, change: { prop: 'testState', value: 2 } })); assert.equal(h.calls.length, 0);
  }
  const h = harness(); await assert.rejects(h.run({ operation: 'read', origin: 'https://another.test' })); assert.equal(h.calls.length, 0);
});
test('save errors and mismatched readback never report success; writes never retry', async () => {
  for (const config of [{ errorCode: 7 }, { wrongResult: true }, { failReadAfterWrite: true }]) {
    const h = harness(config); await assert.rejects(h.run({ operation: 'write', target, expected, change: { prop: 'testState', value: 2 } }));
    assert.equal(h.calls.filter(c => c.path.endsWith('liob_io_value_save')).length, 1);
  }
});
test('unknown/offline expansion status cannot be announced as a current field value or written', async () => {
  const h = harness(); const data = await h.run({ operation: 'read', inst: 2 }); assert.equal(data.points[0].online, false);
  await assert.rejects(h.run({ operation: 'write', inst: 2, target, expected, change: { prop: 'testState', value: 2 } }), /offline/);
  assert.ok(h.calls.every(c => c.path.endsWith('/action')));
  const active = harness({ devFlags: 2147483648 + 65536 + 131072 });
  assert.equal((await active.run({ operation: 'read', inst: 2 })).points[0].online, true);
});
test('CSV preserves distinct statuses and quoted comments, rejects duplicate terminals', () => {
  const header = 'Bus Name;Device Index;Device Name;I/O Name;Terminal;Test Result;Test Date;Test Comment;Description\n';
  const text = header + 'Local I/O;1;Test;Büro;UI1;Not Selected;;"Hinweis; Text";\n' + 'LIOB-Connect;1;Test;Kontakt;IO1;Not Tested;;;\n';
  const points = parseCsv(text); assert.equal(points[0].testState, 0); assert.equal(points[1].testState, 1); assert.equal(points[0].testComment, 'Hinweis; Text');
  assert.throws(() => parseCsv(text + 'Local I/O;1;Test;Büro;UI1;OK;;;\n'), /doppelte/);
  assert.throws(() => parseCsv(header + 'Local I/O;1;Test;Büro;UI1;Unbekannt;;;\n'), /unbekanntes/);
});
test('speech grammar keeps free comments inert and resolves only unambiguous selections', () => {
  assert.deepEqual(commandFrom('Kommentar: Ausgang invertieren und speichern'), { action: 'comment', value: 'Ausgang invertieren und speichern' });
  assert.deepEqual(commandFrom('Nicht OK'), { action: 'result', value: 3 });
  assert.deepEqual(commandFrom('Ventil auf 100 Prozent'), { action: 'unknown' });
  assert.equal(clean('B\u0081üro'), 'Büro');
  assert.equal(matchingPoints([{ terminal: 'UI1', name: 'Temperatur' }, { terminal: 'UI1', name: 'Andere Temperatur' }], 'U I eins').length, 2);
});
if (process.env.LOYTEC_SOURCE_HTML) test('actual uploaded page yields all 26 local channels with input/output index separation', async () => {
  const html = fs.readFileSync(process.env.LOYTEC_SOURCE_HTML, 'utf8');
  const match = html.match(/var opt = (\{[\s\S]*?\});\s*opt\.ioTest/); assert.ok(match);
  const data = JSON.parse(match[1]); const packed = data.devs[0].ios; const count = packed[0], keys = packed.slice(1, count + 1), rows = [];
  for (let i = count + 1; i < packed.length; i += count) rows.push(Object.fromEntries(keys.map((k, j) => [k, packed[i + j]])));
  const h = harness({ rows }); const result = await h.run({ operation: 'read' });
  assert.equal(result.points.length, 26); assert.equal(new Set(result.points.map(p => p.key)).size, 26);
  assert.equal(result.points[0].terminal, 'UI1'); assert.equal(result.points[0].value.text, '10.79');
  assert.equal(result.points[16].terminal, 'DO1'); assert.equal(result.points[16].objIdx, 0);
});
if (process.env.LOYTEC_SOURCE_CSV) test('actual uploaded export imports 66 rows and preserves original names/dates', () => {
  const points = parseCsv(fs.readFileSync(process.env.LOYTEC_SOURCE_CSV, 'utf8'));
  assert.equal(points.length, 66); assert.equal(points.filter(p => p.testState === 2).length, 26);
  assert.equal(points.filter(p => p.name.includes('\u0081')).length, 9);
});
