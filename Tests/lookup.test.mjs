import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as model from '../Shared/model.js';
import * as language from '../Shared/language.js';
import * as vocabulary from '../Shared/vocabulary.js';

const point = (name, terminal, extra = {}) => ({ key: terminal, inst: 0, busName: 'Local I/O', dev: 0, deviceName: 'LIOB-589',
  objType: 1, objIdx: Number(terminal.slice(2)) - 1, terminal, name, description: '', hwType: 'in_ana', value: { text: '22.50', unit: '°C' },
  mode: 'Auto', testState: 0, testDate: '', testComment: '', online: true, source: 'controller', ...extra });
const fixture = () => [point('Außentemperatur Nord', 'UI1', { value: { text: '10.79', unit: '°C' } }),
  point('Anlage 2.1 – Zulufttemperatur', 'UI2'), point('Zulufttemperatur Anlage 2.10', 'UI3', { value: { text: '99.10', unit: '°C' } })];

test('named value grammar preserves point names, recognises numbered choices and leaves comments inert', () => {
  for (const input of ['Wert von Zulufttemperatur Anlage 2.1', 'Bitte lies den Wert von Zulufttemperatur Anlage 2.1 vor.', 'Wie lautet der Wert von Zulufttemperatur Anlage 2.1?']) {
    assert.deepEqual(model.commandFrom(input), { action: 'lookup', value: 'Zulufttemperatur Anlage 2.1' });
  }
  assert.deepEqual(model.commandFrom('Treffer zwei'), { action: 'choose', value: 2 });
  assert.deepEqual(model.commandFrom('Nummer 1'), { action: 'choose', value: 1 });
  assert.deepEqual(model.commandFrom('Kommentar Wert von Zulufttemperatur speichern'), { action: 'comment', value: 'Wert von Zulufttemperatur speichern' });
});
test('search handles word order, spoken decimals, compounds and exact plant identifiers', () => {
  const points = [...fixture(), point('Zulufttemperatur Anlage 12.1', 'UI4'), point('Zulufttemperatur Anlage 2.1.1', 'UI5')];
  for (const query of ['Zulufttemperatur Anlage 2.1', 'Zuluft Temperatur der Anlage zwei Punkt eins', 'Anlage zwei Komma eins Zulufttemperatur', 'Zulufttemperatur Anlage 2,1']) {
    const result = model.searchPoints(points, query);
    assert.deepEqual(result.matches.map(p => p.key), ['UI2'], query); assert.equal(result.approximate, false);
  }
  assert.equal(model.searchPoints(points, 'Zulufttemperatur Anlage 2.11').matches.length, 0);
  assert.equal(model.searchPoints(points, '').matches.length, 0);
});
test('small spelling errors suggest candidates, while duplicate names and terminals stay ambiguous', () => {
  const result = model.searchPoints(fixture(), 'Zulufttempratur Anlage 2.1');
  assert.deepEqual(result.matches.map(p => p.key), ['UI2']); assert.equal(result.approximate, true);
  const points = [point('Büro', 'UI1', { deviceName: 'Modul Nord' }), point('Büro', 'UI1', { key: 'south', deviceName: 'Modul Süd' })];
  assert.equal(model.searchPoints(points, 'U I eins').matches.length, 2);
  assert.deepEqual(model.searchPoints(points, 'Büro Modul Süd').matches.map(p => p.key), ['south']);
});

// Exercise the shipped app and its event handlers with a minimal DOM/Chrome
// adapter. These are interaction-logic tests, not a browser/audio simulation.
const storageHubs = new WeakMap();
async function appHarness(rows = fixture(), options = {}) {
  const storage = options.storage || {}, origin = options.origin || 'https://controller.test';
  if (!storageHubs.has(storage)) {
    const listeners = new Set();
    const local = { get: async key => key === null ? structuredClone(storage) : ({ [key]: structuredClone(storage[key]) }), set: async values => {
      if (options.storageFails) throw new Error('Speicher voll'); if (options.storageHook) await options.storageHook();
      const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { oldValue: structuredClone(storage[key]), newValue: structuredClone(value) }]));
      Object.assign(storage, structuredClone(values)); for (const listener of listeners) listener(changes, 'local');
    } };
    storageHubs.set(storage, { local, listeners, service: vocabulary.createVocabularyService(local) });
  }
  const hub = storageHubs.get(storage);
  class Element {
    constructor(tag = '') { this.tag = tag; this.tagName = tag.toUpperCase(); this.value = ''; this.children = []; this.textContent = ''; this.hidden = false; this.checked = false; this.disabled = false; this.className = ''; this.classList = { add() {}, remove() {} }; }
    replaceChildren(...children) { this.children = children; if (this.tag === 'select') this.value = children[0]?.value || ''; }
    append(...children) { this.children.push(...children); }
    insertCell() { const cell = new Element('td'); this.append(cell); return cell; }
    addEventListener() {}
    click() { return this.onclick?.(); }
  }
  const html = fs.readFileSync(new URL('./DesktopReference/assistant.html', import.meta.url), 'utf8');
  const elements = new Map([...html.matchAll(/<(\w+)\b[^>]*\bid="([^"]+)"/g)].map(([, tag, id]) => [id, new Element(tag)]));
  elements.get('filter').value = 'all'; elements.get('delta').value = '0.1';
  const requests = [], speech = [], info = { origin, product: 'LIOB-589', buses: [{ id: 0, name: 'Local I/O' }], canEdit: true };
  let readHook = null;
  const context = vm.createContext({ ...model, ...language, ...vocabulary, vocabularyRequest: (operation, data) => hub.service.request(operation, data), controllerTask: () => {}, URLSearchParams, URL, Date, console,
    document: { getElementById: id => { assert.ok(elements.has(id), `Missing HTML element ${id}`); return elements.get(id); }, createElement: tag => new Element(tag) },
    window: { addEventListener() {} }, location: { search: `?tab=1&origin=${encodeURIComponent(origin)}` }, confirm: () => false,
    setTimeout: () => 1, clearTimeout() {}, setInterval() {},
    chrome: { scripting: { executeScript: async ({ args: [request] }) => {
      requests.push(request);
      if (request.operation === 'info') return [{ result: info }];
      if (request.operation === 'write' && options.allowWrites) {
        assert.ok(['testState', 'testComment'].includes(request.change.prop));
        const item = rows.find(point => point.objIdx === request.target.objIdx && point.objType === request.target.objType);
        assert.ok(item); assert.equal(item.name, request.expected.name);
        item[request.change.prop] = request.change.value;
        if (request.change.prop === 'testState') item.testDate = '2026-10-05 10:00:00';
        return [{ result: { verified: true, point: structuredClone(item) } }];
      }
      assert.equal(request.operation, 'read', 'A value lookup must never write to the controller');
      if (readHook) await readHook();
      return [{ result: { ...info, points: structuredClone(rows).map(p => ({ ...p, receivedAt: new Date().toISOString() })) } }];
    } }, tts: { stop() {}, speak(text, options) { speech.push(text); options.onEvent({ type: 'end' }); } },
    storage: { local: hub.local, onChanged: { addListener: listener => hub.listeners.add(listener) } } }
  });
  const source = fs.readFileSync(new URL('./DesktopReference/app.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  const app = await vm.runInContext(`(async () => { ${source}\nreturn { state, handleCommand, refresh, readCurrent, refreshVocabulary }; })()`, context);
  requests.length = 0; speech.length = 0;
  return { ...app, rows, requests, speech, storage, vocabulary: hub.service, el: id => elements.get(id), setReadHook: fn => { readHook = fn; } };
}
test('voice query reads the requested fresh value regardless of marked row and hidden filters', async () => {
  const app = await appHarness();
  app.el('search').value = 'Außentemperatur'; app.el('device').value = 'hidden'; app.el('filter').value = 'bad'; app.el('hideReserve').checked = true;
  app.rows[1].value.text = '23.80';
  await app.handleCommand('Wert von Zulufttemperatur Anlage zwei Punkt eins');
  assert.equal(app.state.selected, 'UI2'); assert.match(app.speech.at(-1), /23,80 Grad Celsius/);
  assert.doesNotMatch(app.speech.at(-1), /10,79|99,10/); assert.equal(app.requests.length, 1);
  assert.equal(app.el('search').value, ''); assert.equal(app.el('device').value, ''); assert.equal(app.el('filter').value, 'all');
});
test('multiple matches require a spoken choice and reread its value; result commands cannot affect the old selection', async () => {
  const app = await appHarness(); await app.handleCommand('Wert von Zulufttemperatur');
  assert.equal(app.state.selected, 'UI1'); assert.equal(app.state.lookup.total, 2); assert.match(app.speech.at(-1), /Treffer 1.*Treffer 2/);
  assert.doesNotMatch(app.speech.at(-1), /Grad Celsius/);
  await app.handleCommand('OK'); assert.equal(app.state.draft.result, null);
  app.rows[2].value.text = '24.60'; await app.handleCommand('Treffer zwei');
  assert.equal(app.state.selected, 'UI3'); assert.match(app.speech.at(-1), /24,60 Grad Celsius/); assert.equal(app.state.lookup, null);
});
test('an imprecise query can be refined hands-free, including a result outside the displayed first eight', async () => {
  const rows = Array.from({ length: 12 }, (_, i) => point(`Zulufttemperatur Anlage ${i + 1}`, `UI${i + 1}`));
  const app = await appHarness(rows); await app.handleCommand('Wert von Zulufttemperatur');
  assert.equal(app.el('lookupChoices').children.length, 8);
  await app.handleCommand('Anlage zwölf'); assert.equal(app.state.selected, 'UI12'); assert.match(app.speech.at(-1), /Anlage 12/);
});
test('a spelling suggestion needs confirmation even when there is only one candidate', async () => {
  const app = await appHarness(); await app.handleCommand('Wert von Zulufttempratur Anlage 2.1');
  assert.equal(app.state.selected, 'UI1'); assert.equal(app.state.lookup.approximate, true); assert.doesNotMatch(app.speech.at(-1), /Grad Celsius/);
  await app.handleCommand('Treffer eins'); assert.equal(app.state.selected, 'UI2');
});
test('missing names, offline points and connection failures never announce the previously selected value', async () => {
  const app = await appHarness();
  await app.handleCommand('Wert von Heizkreisdruck Anlage 9'); assert.match(app.speech.at(-1), /Kein passender Prüfpunkt/); assert.doesNotMatch(app.speech.at(-1), /10,79/);
  app.rows[1].online = false; await app.handleCommand('Wert von Zulufttemperatur Anlage 2.1'); assert.match(app.speech.at(-1), /Kein bestätigter aktueller Wert/);
  app.setReadHook(() => { throw new Error('Verbindung verloren'); });
  await app.handleCommand('Wert von Außentemperatur'); assert.match(app.speech.at(-1), /nicht aktuell gelesen/); assert.equal(app.state.lastRead, 0);
});
test('a candidate renamed or removed after clarification is not read as the old point', async () => {
  const app = await appHarness(); await app.handleCommand('Wert von Zulufttemperatur');
  app.rows[1].name = 'Neue Zuordnung'; await app.handleCommand('Treffer eins');
  assert.match(app.speech.at(-1), /Prüfpunkt wurde geändert/); assert.equal(app.state.selected, 'UI1');
});
test('an outstanding poll is awaited; Stop cancels a lookup without a late announcement', async () => {
  const app = await appHarness(); let release;
  app.setReadHook(() => new Promise(resolve => { release = resolve; }));
  const poll = app.refresh(), lookup = app.handleCommand('Wert von Zulufttemperatur Anlage 2.1');
  assert.equal(app.requests.length, 1);
  app.setReadHook(null); release(); await Promise.all([poll, lookup]);
  assert.equal(app.requests.length, 2); assert.equal(app.state.selected, 'UI2');
  app.setReadHook(() => new Promise(resolve => { release = resolve; }));
  const next = app.handleCommand('Wert von Außentemperatur');
  await app.handleCommand('Stopp'); const count = app.speech.length; release(); await next;
  assert.equal(app.speech.length, count); assert.equal(app.state.selected, 'UI2'); assert.equal(app.state.lookupBusy, false);
});
test('drafts survive a name query and CSV mode never requests or fabricates live values', async () => {
  const app = await appHarness(); app.el('comment').value = 'Entwurf behalten'; app.el('comment').oninput();
  await app.handleCommand('Wert von Zulufttemperatur'); assert.equal(app.requests.length, 0); assert.equal(app.state.draft.comment, 'Entwurf behalten');
  await app.handleCommand('Entwurf verwerfen');
  app.state.csv = true; app.state.points.forEach(p => { p.source = 'csv'; p.value = { text: '', unit: '' }; });
  await app.handleCommand('Wert von Zulufttemperatur Anlage 2.1');
  assert.equal(app.requests.length, 0); assert.match(app.speech.at(-1), /CSV-Import ohne aktuellen Messwert/);
});
test('text form, clickable choices, explicit cancel and expiry use the same search flow', async () => {
  const app = await appHarness(); app.el('lookupQuery').value = 'Wert von Zulufttemperatur';
  await app.el('lookupForm').onsubmit({ preventDefault() {} });
  await app.handleCommand('Suche abbrechen'); assert.equal(app.state.lookup, null);
  await app.handleCommand('Wert von Zulufttemperatur'); app.state.lookup.createdAt -= 120001;
  await app.handleCommand('Treffer eins'); assert.match(app.speech.at(-1), /abgelaufen/); assert.equal(app.state.selected, 'UI1');
  await app.handleCommand('Wert von Zulufttemperatur');
  app.el('lookupChoices').children[0].click();
  // The UI click intentionally starts its async handler without returning it.
  for (let i = 0; i < 10 && app.state.lookupBusy; i++) await Promise.resolve();
  assert.equal(app.state.selected, 'UI2');
});

test('a natural question resolves an abbreviation but does not infer fault polarity from the label', async () => {
  const app = await appHarness([point('SM_Pumpe Anlage 2.1', 'UI1', { value: { text: 'CLOSED', unit: '' } }), point('BM_Pumpe Anlage 2.1', 'UI2')]);
  await app.handleCommand('Kannst du mir bitte die Störung Pumpe Anlage 2.1 sagen?');
  assert.equal(app.state.selected, 'UI1'); assert.match(app.speech.at(-1), /Störmeldung.*geschlossen/);
  assert.doesNotMatch(app.speech.at(-1), /Störung aktiv|Störung liegt an|Normalbetrieb/);
});
test('a confirmed definition is global, survives restart and is removed across controllers', async () => {
  const storage = {}, rows = [point('RT Büro 2.1', 'UI1')];
  const app = await appHarness(rows, { storage });
  await app.handleCommand('RT bedeutet Raumtemperatur'); assert.equal(app.state.globalVocabulary.terms.length, 0);
  assert.match(app.speech.at(-1), /Soll ich das.*merken/);
  await app.handleCommand('Ja merken'); assert.equal(app.state.globalVocabulary.terms.length, 1);
  const restarted = await appHarness(rows, { storage }); await restarted.handleCommand('Wie hoch ist die Raumtemperatur Büro 2.1?');
  assert.match(restarted.speech.at(-1), /Raumtemperatur Büro 2.1.*22,50/);
  const other = await appHarness(rows, { storage, origin: 'https://other-controller.test' });
  await other.handleCommand('Wert von Raumtemperatur Büro 2.1'); assert.match(other.speech.at(-1), /Raumtemperatur.*22,50/);
  await app.vocabulary.request('delete', { short: 'RT', expectedRevision: app.state.globalVocabulary.revision });
  await other.refreshVocabulary(true); await other.handleCommand('Wert von Raumtemperatur Büro 2.1'); assert.match(other.speech.at(-1), /Kein passender/);
  const again = await appHarness(rows, { storage }); assert.equal(language.effectiveTerms(again.state.globalVocabulary.terms).some(term => term.short === 'RT'), false);
});
test('a meaning inferred from a description is asked, and rejection prevents repeated guesses in this session', async () => {
  const app = await appHarness([point('RT Büro', 'UI1', { description: 'Raumtemperatur im Büro' })]);
  await app.handleCommand('Wert von Raumtemperatur Büro');
  assert.match(app.speech.at(-1), /22,50.*Aus Name und Beschreibung vermute ich: RT bedeutet Raumtemperatur/);
  assert.equal(app.state.globalVocabulary.terms.length, 0);
  await app.handleCommand('Nein'); await app.handleCommand('Wert von Raumtemperatur Büro');
  assert.equal(app.state.question, null); assert.doesNotMatch(app.speech.at(-1), /vermute/);
  await app.handleCommand('RT ist Raumtemperatur'); await app.handleCommand('Ja'); assert.equal(app.state.globalVocabulary.terms.length, 1);
});
test('a description changed during a learning question is not committed as a confirmed meaning', async () => {
  const app = await appHarness([point('RT Büro', 'UI1', { description: 'Raumtemperatur im Büro' })]);
  await app.handleCommand('Wert von Raumtemperatur Büro');
  app.rows[0].description = 'Andere Zuordnung'; await app.refresh(); await app.handleCommand('Ja');
  assert.equal(app.state.globalVocabulary.terms.length, 0); assert.match(app.speech.at(-1), /nicht mehr aktuell bestätigt/);
});
test('a confirmed misheard read command is learned, but guessed save needs an explicit save command', async () => {
  const storage = {}, app = await appHarness(undefined, { storage });
  await app.handleCommand('Wert forlesen'); assert.match(app.speech.at(-1), /Meinst du.*Wert vorlesen/); assert.equal(app.state.knowledge.commands.length, 0);
  await app.handleCommand('Ja'); assert.match(app.speech.at(-1), /10,79/); assert.equal(app.state.knowledge.commands.length, 1);
  const restarted = await appHarness(undefined, { storage, allowWrites: true }); await restarted.handleCommand('Wert forlesen');
  assert.equal(restarted.state.question, null); assert.match(restarted.speech.at(-1), /10,79/);
  await restarted.handleCommand('OK'); await restarted.handleCommand('Speichan');
  await restarted.handleCommand('Ja'); assert.match(restarted.speech.at(-1), /ausdrücklich Speichern/);
  assert.equal(restarted.state.draft.result, 2); assert.equal(restarted.state.knowledge.commands.length, 1);
  assert.equal(restarted.requests.filter(request => request.operation === 'write').length, 0);
  await restarted.handleCommand('Nein'); await restarted.handleCommand('Bitte nicht speichern');
  assert.equal(restarted.requests.filter(request => request.operation === 'write').length, 0);
  await restarted.handleCommand('Speichan'); await restarted.handleCommand('Speichern');
  assert.equal(restarted.requests.filter(request => request.operation === 'write').length, 1);
  assert.equal(restarted.requests.find(request => request.operation === 'write').change.prop, 'testState');
});
test('confirming a bare or misspoken point query teaches it, without suppressing future ambiguous matches', async () => {
  const storage = {}, app = await appHarness(undefined, { storage });
  await app.handleCommand('Zulufttempratur Anlage 2.1'); assert.ok(app.state.lookup); assert.equal(app.state.knowledge.points.length, 0);
  await app.handleCommand('Ja'); assert.equal(app.state.knowledge.points.length, 1);
  const restarted = await appHarness(undefined, { storage }); await restarted.handleCommand('Zulufttempratur Anlage 2.1');
  assert.equal(restarted.state.lookup, null); assert.match(restarted.speech.at(-1), /22,50/);
  restarted.rows.push(point('Zulufttemperatur Anlage 2.1', 'UI4', { deviceName: 'Modul Süd' }));
  await restarted.handleCommand('Zulufttempratur Anlage 2.1'); assert.equal(restarted.state.lookup.total, 2);
  const bare = await appHarness(); await bare.handleCommand('Außentemperatur Nord'); await bare.handleCommand('Ja');
  await bare.handleCommand('Außentemperatur Nord'); assert.equal(bare.state.lookup, null); assert.match(bare.speech.at(-1), /10,79/);
});
test('failed persistence is not claimed as learning; global terms can be added in CSV mode', async () => {
  const options = {}, app = await appHarness(undefined, options); options.storageFails = true;
  await app.handleCommand('RT bedeutet Raumtemperatur'); await app.handleCommand('Ja');
  assert.equal(app.state.globalVocabulary.terms.length, 0); assert.match(app.speech.at(-1), /nicht gespeichert/);
  await app.handleCommand('Nein'); app.state.csv = true; options.storageFails = false;
  await app.handleCommand('RT bedeutet Raumtemperatur'); await app.handleCommand('Ja');
  assert.equal(app.state.globalVocabulary.terms.length, 1); assert.equal(app.requests.length, 0);
});
test('Stop during learning cannot trigger a late read command', async () => {
  let release; const options = {};
  const app = await appHarness(undefined, options); options.storageHook = () => new Promise(resolve => { release = resolve; }); await app.handleCommand('Wert forlesen');
  const confirmation = app.handleCommand('Ja');
  for (let i = 0; i < 5 && !release; i++) await Promise.resolve();
  assert.ok(release); await app.handleCommand('Stopp'); const count = app.speech.length;
  release(); await confirmation; assert.equal(app.speech.length, count); assert.equal(app.state.question, null);
});
