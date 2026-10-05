import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as vocabulary from '../Shared/vocabulary.js';
import * as language from '../Shared/language.js';
import { searchPoints } from '../Shared/model.js';

function harness(initial = {}) {
  const data = structuredClone(initial), writes = [];
  const storage = { get: async key => key === null ? structuredClone(data) : { [key]: structuredClone(data[key]) },
    set: async value => { writes.push(structuredClone(value)); Object.assign(data, structuredClone(value)); } };
  const service = vocabulary.createVocabularyService(storage);
  return { data, writes, storage, request: service.request };
}
const entry = (short, meaning, aliases = []) => ({ short, meaning, aliases, source: 'manual' });
const io = name => ({ key: 'test', name, terminal: 'UI1', description: '', busName: 'Local I/O', deviceName: 'Modul' });

test('legacy terms from every controller migrate globally and conflicting meanings wait for a choice', async () => {
  const legacyA = { version: 1, terms: [{ short: 'RT', meaning: 'Raumtemperatur' }, { short: 'ST', meaning: 'Stellungsrückmeldung' }], points: [{ query: 'mein Punkt', identity: { key: 'x', name: 'UI1', terminal: 'UI1', deviceName: 'Modul', description: '' } }], commands: [] };
  const legacyB = { version: 1, terms: [{ short: 'RT', meaning: 'Raumtemperatur' }, { short: 'ST', meaning: 'Sicherheitstemperatur' }], points: [], commands: [] };
  const h = harness({ 'ioVocabulary.v1:https://a.test': legacyA, 'ioVocabulary.v1:https://b.test': legacyB });
  const state = await h.request('get');
  assert.equal(state.conflicts.length, 1); assert.equal(state.conflicts[0].variants.length, 2);
  assert.ok(language.effectiveTerms(state.terms).some(term => term.short === 'RT'));
  assert.equal(language.effectiveTerms(state.terms).some(term => term.short === 'ST'), false);
  assert.deepEqual(h.data['ioVocabulary.v1:https://a.test'], legacyA);
  assert.equal('points' in state, false);
  const resolved = await h.request('save', { term: entry('ST', 'Sicherheitstemperatur'), expectedRevision: state.revision });
  assert.equal(resolved.conflicts.length, 0); assert.equal(searchPoints([io('ST Anlage 2.1')], 'Sicherheitstemperatur Anlage 2.1', resolved).matches.length, 1);
  const afterRestart = await vocabulary.createVocabularyService(h.storage).request('get');
  assert.equal(afterRestart.conflicts.length, 0); assert.equal(h.data['ioVocabulary.v1:https://b.test'].terms.length, 2);
});
test('direct edits, aliases, rename, removal and defaults all affect the actual matcher', async () => {
  const h = harness(); let state = await h.request('get');
  state = await h.request('save', { mode: 'new', expectedRevision: state.revision, term: entry('RT', 'Raumtemperatur', ['Bürotemperatur']) });
  assert.equal(searchPoints([io('RT Büro')], 'Bürotemperatur Büro', state).matches.length, 1);
  state = await h.request('save', { oldKey: 'RT', expectedRevision: state.revision, term: entry('RF', 'Raumfeuchte', ['Bürofeuchte']) });
  assert.equal(language.effectiveTerms(state.terms).some(term => term.short === 'RT'), false);
  assert.equal(searchPoints([io('RF Büro')], 'Bürofeuchte Büro', state).matches.length, 1);
  state = await h.request('delete', { short: 'FG', expectedRevision: state.revision });
  assert.equal(searchPoints([io('FG Pumpe')], 'Freigabe Pumpe', state).matches.length, 0);
  state = await h.request('restoreDefaults', { expectedRevision: state.revision });
  assert.equal(searchPoints([io('FG Pumpe')], 'Freigabe Pumpe', state).matches.length, 1);
  assert.ok(language.effectiveTerms(state.terms).some(term => term.short === 'RF'));
  await assert.rejects(h.request('save', { mode: 'new', expectedRevision: state.revision, term: entry('FG', 'Freigabe') }), /bereits vorhanden/);
});
test('simultaneous editors cannot overwrite a newer revision or lose unrelated definitions', async () => {
  const h = harness(), original = await h.request('get');
  const results = await Promise.allSettled([
    h.request('save', { term: entry('RT', 'Raumtemperatur'), expectedRevision: original.revision }),
    h.request('save', { term: entry('RF', 'Raumfeuchte'), expectedRevision: original.revision })
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.match(results[1].reason.message, /inzwischen geändert/);
  const current = await h.request('get');
  const saved = await h.request('save', { term: entry('RF', 'Raumfeuchte'), expectedRevision: current.revision });
  assert.ok(saved.terms.some(term => term.short === 'RT')); assert.ok(saved.terms.some(term => term.short === 'RF'));
});
test('export/import transfers terms and aliases, previews conflicts, and does not carry controller identities', async () => {
  const h = harness(); let state = await h.request('get');
  state = await h.request('save', { term: entry('RT', 'Raumtemperatur', ['Raumsensor']), expectedRevision: state.revision });
  state = await h.request('delete', { short: 'Y', expectedRevision: state.revision });
  const json = JSON.stringify(vocabulary.exportVocabulary(state));
  assert.doesNotMatch(json, /origin|controller|identity/);
  const parsed = vocabulary.parseVocabularyFile(json); assert.ok(parsed.some(term => term.short === 'RT'));
  const other = harness(); let next = await other.request('get');
  next = await other.request('import', { text: json, expectedRevision: next.revision });
  assert.equal(searchPoints([io('RT Büro')], 'Raumsensor Büro', next).matches.length, 1);
  assert.equal(next.conflicts.length, 1); assert.equal(next.conflicts[0].short, 'Y');
  next = await other.request('delete', { short: 'Y', expectedRevision: next.revision }); assert.equal(next.conflicts.length, 0);
  const invalid = JSON.stringify({ format: 'bacsolution-io-vocabulary', version: 1, terms: [entry('RT', 'Raumtemperatur'), entry('rt', 'Raumfeuchte')] });
  await assert.rejects(other.request('import', { text: invalid, expectedRevision: next.revision }), /mehrfach/);
  assert.equal((await other.request('get')).revision, next.revision);
});
test('colliding synonyms, command words and corrupt stored data are not silently accepted', async () => {
  const h = harness(), state = await h.request('get');
  await assert.rejects(h.request('save', { expectedRevision: state.revision, term: entry('RF', 'Raumfeuchte', ['Raum Temp']) }), /anderen Bedeutung/);
  await assert.rejects(h.request('save', { expectedRevision: state.revision, term: entry('RF', 'Raumfeuchte', ['RaumTemp']) }), /anderen Bedeutung/);
  await assert.rejects(h.request('save', { expectedRevision: state.revision, term: entry('RT', 'Raumtemperatur', ['Speichern']) }), /Sprachbefehle/);
  const corrupt = harness({ [vocabulary.globalVocabularyKey]: { version: 999, terms: [] } });
  await assert.rejects(corrupt.request('get'), /nicht lesbar/); assert.equal(corrupt.writes.length, 0);
});
test('settings work without a controller and save edited definitions directly without a learning dialog', async () => {
  const h = harness(), elements = new Map();
  class Element {
    constructor() { this.children = []; this.value = ''; this.checked = false; this.hidden = false; this.disabled = false; this.textContent = ''; }
    replaceChildren(...items) { this.children = items; }
    append(...items) { this.children.push(...items); }
    insertCell() { const cell = new Element(); this.append(cell); return cell; }
    focus() {}
  }
  const html = fs.readFileSync(new URL('./DesktopReference/settings.html', import.meta.url), 'utf8');
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) elements.set(id, new Element());
  const context = vm.createContext({ ...language, ...vocabulary, vocabularyRequest: h.request, Blob, URL,
    document: { getElementById: id => { assert.ok(elements.has(id), `Missing settings element ${id}`); return elements.get(id); }, createElement: () => new Element() },
    chrome: { storage: { onChanged: { addListener() {} } } }, window: { addEventListener() {} }, setTimeout() {} });
  const source = fs.readFileSync(new URL('./DesktopReference/settings.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  const settings = await vm.runInContext(`(async()=>{${source}\nreturn settings;})()`, context);
  const el = id => elements.get(id);
  assert.equal(el('termRows').children.length, language.defaultTerms.length); assert.equal(el('termSave').disabled, false);
  assert.equal(settings.aliasRows.length, 1);
  el('termShort').value = 'RT'; el('termMeaning').value = 'Raumtemperatur'; el('termShort').oninput();
  settings.aliasRows[0].input.value = 'Bürotemperatur'; settings.aliasRows[0].input.oninput();
  el('addAlias').onclick(); settings.aliasRows[1].input.value = 'Raumsensor';
  el('addAlias').onclick(); // An empty row is not saved as an alias.
  await el('termForm').onsubmit({ preventDefault() {} });
  assert.equal(settings.vocabulary.terms.length, 1); assert.match(el('settingsMessage').textContent, /global gespeichert/);
  assert.deepEqual((await h.request('get')).terms[0].aliases, ['Bürotemperatur', 'Raumsensor']);
  el('termSearch').value = 'Bürotemperatur'; el('termSearch').oninput(); assert.equal(el('termRows').children.length, 1);
  const displayedAliases = el('termRows').children[0].children[2].children[0].children[0].children;
  assert.deepEqual(displayedAliases.map(row => row.children[0].textContent), ['Bürotemperatur', 'Raumsensor']);
  el('termRows').children[0].children[4].children[0].onclick(); assert.equal(el('termShort').value, 'RT');
  assert.equal(settings.aliasRows.length, 2);
  settings.aliasRows[1].remove.onclick(); assert.equal(settings.aliasRows.length, 1);
  el('addAlias').onclick(); settings.aliasRows[1].input.value = 'Raum Temperatur Büro';
  el('termMeaning').value = 'Raumlufttemperatur'; await el('termForm').onsubmit({ preventDefault() {} });
  assert.equal((await h.request('get')).terms.find(term => term.short === 'RT').meaning, 'Raumlufttemperatur');
  assert.deepEqual((await h.request('get')).terms.find(term => term.short === 'RT').aliases, ['Bürotemperatur', 'Raum Temperatur Büro']);
  assert.equal(settings.aliasRows.length, 1); assert.equal(settings.aliasRows[0].input.value, '');
  assert.equal('question' in settings, false);
});
test('background vocabulary messages allow only this extension and use the shared service', async () => {
  const h = harness(), listeners = [];
  const context = vm.createContext({ createVocabularyService: vocabulary.createVocabularyService, URL,
    chrome: { runtime: { id: 'extension-test', getURL: path => `chrome-extension://extension-test/${path}`, onMessage: { addListener: listener => listeners.push(listener) } },
      storage: { local: h.storage }, action: { onClicked: { addListener() {} } }, tabs: { create: async () => {} } } });
  vm.runInContext(fs.readFileSync(new URL('./DesktopReference/background.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, ''), context);
  let blocked;
  listeners[0]({ channel: 'bacsolution-vocabulary', operation: 'get' }, { id: 'other', url: 'https://controller.test' }, result => { blocked = result; });
  assert.equal(blocked.ok, false); assert.equal(h.writes.length, 0);
  const answer = await new Promise(resolve => assert.equal(listeners[0]({ channel: 'bacsolution-vocabulary', operation: 'get' }, { id: 'extension-test', url: 'chrome-extension://extension-test/settings.html' }, resolve), true));
  assert.equal(answer.ok, true); assert.equal(answer.vocabulary.version, 1);
});

test('expanded defaults upgrade existing profiles once and preserve explicit edits and removals', async () => {
  const custom = [entry('WP', 'Wasserpumpe'), { ...entry('FG', 'Freigabe'), disabled: true }];
  const h = harness({ [vocabulary.globalVocabularyKey]: { version: 1, revision: 7, terms: custom, conflicts: [] } });
  const state = await h.request('get');
  assert.equal(state.revision, 8); assert.equal(state.defaultsRevision, language.defaultTermsRevision);
  assert.deepEqual(state.terms, custom.map(vocabulary.validateDefinition));
  assert.equal(searchPoints([io('WP Anlage')], 'Wasserpumpe Anlage', state).matches.length, 1);
  assert.equal(searchPoints([io('WP Anlage')], 'Wärmepumpe Anlage', state).matches.length, 0);
  assert.equal(searchPoints([io('FG Pumpe')], 'Freigabe Pumpe', state).matches.length, 0);
  assert.equal(searchPoints([io('WRG Anlage')], 'Wärmerückgewinnung Anlage', state).matches.length, 1);
  await h.request('get'); assert.equal(h.writes.length, 1);
  await assert.rejects(h.request('save', { expectedRevision: 7, term: entry('RT', 'Raumtemperatur') }), /inzwischen geändert/);
});

test('the expanded catalog survives export, import and direct CO2 editing', async () => {
  const h = harness(); let state = await h.request('get');
  const exported = vocabulary.exportVocabulary(state), text = JSON.stringify(exported);
  assert.equal(vocabulary.parseVocabularyFile(text).length, language.defaultTerms.length);
  state = await h.request('import', { text, expectedRevision: state.revision });
  assert.equal(state.conflicts.length, 0);
  state = await h.request('save', { term: entry('CO2', 'Kohlendioxid', ['CO₂', 'CO zwei']), expectedRevision: state.revision });
  assert.equal(searchPoints([io('CO₂ Büro 2.1')], 'Kohlendioxid Büro 2.1', state).matches.length, 1);
  await assert.rejects(h.request('save', { term: entry('RT', 'Raumtemperatur', ['UI1']), expectedRevision: state.revision }), /nur Wörter/);
});
