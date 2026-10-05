import { controllerTask } from './protocol.js';
import { clean, normalized, labels, commandFrom, searchPoints, parseCsv } from './model.js';
import { effectiveTerms, languageKey, spokenName, validateTerm, sanitizeKnowledge, knowledgeKey, pointIdentity, identityMatches, suggestTerm, readOnlyCommands } from './language.js';
import { vocabularyRequest, globalVocabularyKey, emptyVocabulary } from './vocabulary.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const tab = Number(params.get('tab'));
const origin = params.get('origin');
const state = { points: [], selected: null, draft: null, info: null, bus: 0, csv: false, busy: false, saving: false,
  lastRead: 0, lastAttempt: 0, staleWarned: false, watchBaseline: null, watchAvailable: null, lastSpoken: 0, history: [], micWanted: false, speaking: false,
  lookup: null, lookupBusy: false, question: null, learningBusy: false, knowledge: sanitizeKnowledge(null), dismissedTerms: new Set(),
  globalVocabulary: emptyVocabulary(), globalReady: false, writingGlobal: false };
let recognition = null, restarting = null, speechGeneration = 0, refreshTask = null, lookupGeneration = 0;
function message(text, type = '') { $('message').textContent = text; $('message').className = `message ${type}`; }
function selected() { return state.points.find(p => p.key === state.selected); }
function activeKnowledge() {
  const local = state.csv ? sanitizeKnowledge(null) : state.knowledge;
  return { ...local, terms: state.globalVocabulary.terms, points: local.points.filter(item => item.vocabularyRevision === state.globalVocabulary.revision) };
}
function pointTitle(point) { return spokenName(clean(point.name), activeKnowledge().terms); }
function fresh() { return !state.csv && state.lastRead && Date.now() - state.lastRead < 12000; }
function dirty() { return !!state.draft && (state.draft.result !== null || state.draft.comment !== state.draft.base.testComment); }
function allowedNavigation() { if (state.saving || state.lookupBusy || state.learningBusy) return false; return !dirty() || confirm('Ungespeicherten Entwurf verwerfen?'); }
function activity(text) { $('activity').textContent = text; }
async function execute(operation, extra = {}) {
  if (!origin || !Number.isInteger(tab) || tab < 0 || !globalThis.chrome?.scripting) throw new Error('Assistent über das Erweiterungssymbol im LOYTEC-I/O-Testtab starten.');
  const result = await chrome.scripting.executeScript({ target: { tabId: tab }, world: 'MAIN', func: controllerTask,
    args: [{ operation, origin, inst: state.bus, ...extra }] });
  if (!result?.[0]?.result) throw new Error('Keine Antwort vom LOYTEC-Tab. Seite neu laden und Erweiterung erneut öffnen.');
  return result[0].result;
}
function option(value, text) { const el = document.createElement('option'); el.value = String(value); el.textContent = text; return el; }
function fillDevices() {
  const current = $('device').value;
  $('device').replaceChildren(option('', 'Alle Geräte'));
  const devices = new Map();
  for (const p of state.points) devices.set(JSON.stringify([p.inst, p.dev]), `${p.deviceName} · ${p.busName}`);
  for (const [id, title] of devices) $('device').append(option(id, clean(title)));
  if (devices.has(current)) $('device').value = current;
}
function visiblePoints() {
  const query = normalized($('search').value), device = $('device').value, filter = $('filter').value;
  return state.points.filter(p => (!device || JSON.stringify([p.inst, p.dev]) === device) &&
    (!query || normalized(`${p.terminal} ${p.name} ${p.deviceName}`).includes(query)) &&
    (!$('hideReserve').checked || normalized(p.name) !== 'reserve') &&
    (filter !== 'open' || p.testState < 2) && (filter !== 'bad' || p.testState === 3) &&
    (filter !== 'inputs' || p.hwType.startsWith('in_')));
}
function badge(p) { const el = document.createElement('span'); el.className = `badge ${p.testState === 2 ? 'ok' : p.testState === 3 ? 'bad' : ''}`; el.textContent = labels[p.testState]; return el; }
function displayValue(p) { return p.source === 'csv' ? '—' : !p.online ? 'Offline / unbekannt' : `${clean(p.value.text)} ${clean(p.value.unit)}`.trim(); }
function renderRows() {
  const visible = visiblePoints();
  $('rows').replaceChildren();
  for (const p of visible) {
    const tr = document.createElement('tr'); tr.className = p.key === state.selected ? 'selected' : ''; tr.tabIndex = 0;
    const term = tr.insertCell(); term.textContent = p.terminal;
    const name = tr.insertCell(); name.textContent = clean(p.name);
    const device = document.createElement('small'); device.textContent = clean(p.deviceName); name.append(device);
    tr.insertCell().textContent = displayValue(p); tr.insertCell().append(badge(p));
    tr.onclick = () => { if (!state.saving && !state.lookupBusy && (p.key !== state.selected || !dirty()) && allowedNavigation()) select(p.key); };
    tr.onkeydown = event => { if (event.key === 'Enter') tr.click(); };
    $('rows').append(tr);
  }
  $('empty').hidden = visible.length > 0;
  $('empty').textContent = state.points.length ? 'Keine Prüfpunkte für diese Auswahl. Der CSV-Export enthält keine verlässlichen Signaltypen für den Eingangsfilter.' : 'Die Prüfliste erscheint nach dem Lesen des Controllers oder dem Öffnen eines CSV-Exports.';
  $('count').textContent = state.points.length;
  $('okCount').textContent = state.points.filter(p => p.testState === 2).length;
  $('badCount').textContent = state.points.filter(p => p.testState === 3).length;
}
function resetDraft() {
  const p = selected();
  state.draft = p ? { key: p.key, base: { ...p }, result: null, comment: p.testComment } : null;
  $('result').value = ''; $('comment').value = p?.testComment || '';
  $('draftState').textContent = 'Testergebnis und Kommentar werden nach dem Speichern zurückgelesen.';
  updateControls();
}
function select(key) { clearLookup(); clearQuestion(); state.selected = key; state.watchBaseline = null; state.watchAvailable = null; resetDraft(); renderRows(); renderDetail(); }
function renderDetail() {
  const p = selected();
  $('pointIdentity').textContent = p ? `${clean(p.deviceName)} · ${p.terminal}` : 'PRÜFPUNKT AUSWÄHLEN';
  $('pointName').textContent = p ? clean(p.name) : 'Bereit für die erste Prüfung';
  $('pointDescription').textContent = clean(p?.description);
  $('value').textContent = !p || p.source === 'csv' ? '—' : !fresh() ? 'Veraltet' : !p.online ? 'Offline' : clean(p.value.text);
  $('unit').textContent = p && fresh() && p.online ? clean(p.value.unit) : '';
  $('mode').textContent = !p || p.source === 'csv' ? 'Kein aktueller Messwert' : `Modus: ${clean(p.mode) || 'unbekannt'}`;
  const types = { in_ana: 'Analogeingang', in_digi: 'Digitaleingang', out_ana: 'Analogausgang · nur lesen', out_relay: 'Relaisausgang · nur lesen' };
  $('type').textContent = p ? types[p.hwType] || p.hwType || 'Signaltyp fehlt' : '';
  $('savedState').textContent = p ? `Gespeichert: ${labels[p.testState]}` : 'Kein Prüfergebnis ausgewählt';
  $('savedDate').textContent = p?.testDate || 'Kein Testdatum';
  updateControls();
}
function updateControls() {
  const p = selected(), editable = !!p && fresh() && p.online && state.info?.canEdit && !state.saving && !state.lookupBusy && !state.lookup && !state.question && !state.learningBusy;
  $('save').disabled = !editable || !dirty();
  $('result').disabled = !editable; $('comment').disabled = !editable; $('discard').disabled = state.saving || !dirty();
  $('read').disabled = !p || state.lookupBusy; $('previous').disabled = !p || state.saving || state.lookupBusy || !!state.lookup || !!state.question || state.learningBusy; $('next').disabled = $('previous').disabled;
  $('connect').disabled = state.busy || state.saving || state.lookupBusy || state.learningBusy;
  $('bus').disabled = state.csv || !state.info || state.saving || state.busy || state.lookupBusy || state.learningBusy;
  $('lookupSubmit').disabled = state.saving || state.lookupBusy || state.learningBusy;
  for (const button of $('lookupChoices').children) button.disabled = state.saving || state.lookupBusy;
  for (const button of $('dialogChoices').children) button.disabled = state.saving || state.lookupBusy || state.learningBusy;
  $('dialogNo').disabled = state.learningBusy;
  for (const row of $('knowledgeItems').children) for (const button of row.children) if (button.tagName === 'BUTTON') button.disabled = state.learningBusy || state.lookupBusy || state.saving;
}
function spokenValue(p) {
  const units = { '°C': 'Grad Celsius', '%': 'Prozent', V: 'Volt', A: 'Ampere', mA: 'Milliampere', Pa: 'Pascal' };
  const values = { OPEN: 'offen', CLOSED: 'geschlossen' };
  let value = clean(p.value.text);
  if (/^-?\d+\.\d+$/.test(value)) value = value.replace('.', ',');
  return `${values[value] || value} ${units[p.value.unit] || clean(p.value.unit)}`.trim();
}
function speak(text) {
  if (!globalThis.chrome?.tts) { message('Die Sprachausgabe ist in der installierten Browser-Erweiterung verfügbar.'); return; }
  const generation = ++speechGeneration;
  state.speaking = true; state.lastSpoken = Date.now();
  try { recognition?.abort(); } catch {}
  chrome.tts.stop();
  chrome.tts.speak(text, { lang: 'de-DE', rate: 1.0, enqueue: false, onEvent: event => {
    if (generation !== speechGeneration) return;
    if (['end', 'interrupted', 'cancelled', 'error'].includes(event.type)) {
      state.speaking = false;
      if (event.type === 'error') message(`Sprachausgabe nicht verfügbar: ${event.errorMessage || 'Deutsche Systemstimme prüfen.'}`, 'error');
      scheduleRecognition();
    }
  } });
}
function readCurrent() {
  if (state.lookupBusy) { speak('Die Suche läuft. Bitte kurz warten.'); return; }
  if (state.question) { speak(questionText(state.question)); return; }
  if (state.lookup) { speak(lookupPrompt()); return; }
  readPoint(selected());
}
function readPoint(p, suffix = '') {
  if (!p) return;
  if (p.source === 'csv') { speak(`${pointTitle(p)}. CSV-Import ohne aktuellen Messwert. Prüfergebnis ${labels[p.testState]}.`); return; }
  if (!fresh() || !p.online || !clean(p.value.text)) { speak(`${pointTitle(p)}. Klemme ${p.terminal}. Kein bestätigter aktueller Wert. Verbindung zum Controller oder I/O-Gerät prüfen.`); return; }
  speak(`${pointTitle(p)}. Klemme ${p.terminal}. ${spokenValue(p)}.${suffix ? ` ${suffix}` : ''}`);
}
function watchValue() {
  const p = selected();
  if (!$('watch').checked || !p || state.lookupBusy || state.lookup || state.question) return;
  if (!fresh() || !p.online) {
    if (state.watchAvailable === true) speak('Der ausgewählte Prüfpunkt liefert keinen bestätigten aktuellen Wert mehr. I/O-Verbindung prüfen.');
    state.watchAvailable = false; state.watchBaseline = null; return;
  }
  state.watchAvailable = true;
  const current = { key: p.key, text: p.value.text, unit: p.value.unit };
  const baseline = state.watchBaseline;
  if (!baseline || baseline.key !== p.key || baseline.unit !== current.unit) { state.watchBaseline = current; return; }
  const numeric = v => /^[-+]?\d+(?:[.,]\d+)?$/.test(v) ? Number(v.replace(',', '.')) : NaN;
  const a = numeric(baseline.text), b = numeric(current.text);
  const threshold = Math.max(0, Number($('delta').value) || 0);
  const changed = Number.isFinite(a) && Number.isFinite(b) ? a !== b && Math.abs(a - b) >= threshold : baseline.text !== current.text;
  if (changed && Date.now() - state.lastSpoken >= 5000 && !state.saving && !state.speaking) {
    state.watchBaseline = current; speak(`${p.terminal}: ${spokenValue(p)}.`);
  }
}
function acceptRead(response) {
  state.points = response.points; state.info = response; state.lastRead = Date.now(); state.staleWarned = false;
  $('connection').textContent = 'Controller verbunden'; $('connection').className = 'connection live';
  fillDevices();
  if (!selected()) select(visiblePoints()[0]?.key || null);
  else if (!dirty()) resetDraft();
  renderRows(); renderDetail();
}
async function refresh() {
  if (state.csv || !state.info || state.busy || state.saving || state.lookupBusy) return;
  let finished;
  refreshTask = new Promise(resolve => { finished = resolve; });
  state.busy = true; state.lastAttempt = Date.now(); updateControls();
  try {
    const response = await execute('read');
    acceptRead(response); watchValue();
  } catch (error) {
    state.lastRead = 0; $('connection').textContent = 'Verbindung unterbrochen'; $('connection').className = 'connection warn';
    message(error.message, 'error'); renderDetail();
    if ($('watch').checked && !state.staleWarned) { state.staleWarned = true; speak('Verbindung unterbrochen. Keine aktuellen Messwerte.'); }
  } finally { state.busy = false; refreshTask = null; finished(); updateControls(); }
}
async function connect() {
  if (state.busy || state.saving || state.lookupBusy || state.learningBusy) return;
  if (!allowedNavigation()) return;
  clearLookup(); clearQuestion();
  state.busy = true; updateControls();
  try {
    const info = await execute('info');
    state.info = info; state.csv = false; state.selected = null; state.draft = null; state.points = []; state.lastRead = 0;
    if (!info.buses.some(b => b.id === state.bus)) state.bus = info.buses[0].id;
    $('bus').replaceChildren(...info.buses.map(b => option(b.id, b.name))); $('bus').value = String(state.bus);
    $('station').textContent = `${info.product} · ${new URL(origin).hostname}`; renderKnowledge();
    message('Anmeldung erkannt. Prüfpunkte werden gelesen.');
  } catch (error) { message(error.message, 'error'); }
  finally { state.busy = false; updateControls(); }
  if (state.info && !state.csv) { await refresh(); if (fresh()) message('Prüfpunkt auswählen. Werte werden alle 4 Sekunden abgefragt. Ergebnisse und Kommentare werden erst mit „Speichern“ übertragen.', 'success'); }
}
function navigate(direction, voice = false) {
  if (state.saving || state.lookupBusy || state.lookup || state.question || state.learningBusy) return;
  if (dirty()) { if (voice) { speak('Es gibt einen ungespeicherten Entwurf. Bitte speichern oder Entwurf verwerfen.'); return; } if (!allowedNavigation()) return; }
  const points = visiblePoints(); if (!points.length) return;
  const index = points.findIndex(p => p.key === state.selected);
  const next = Math.min(points.length - 1, Math.max(0, index + direction));
  select(points[next].key); if (voice) readCurrent();
}
async function journal(entry) {
  state.history.push(entry); state.history = state.history.slice(-1000);
  try { await chrome.storage.local.set({ ioSessionHistory: state.history }); }
  catch { message('Controllerdaten gespeichert. Das lokale Sitzungsprotokoll konnte nicht gesichert werden; bitte jetzt exportieren.', 'error'); }
}
async function save() {
  if (state.lookupBusy || state.lookup || state.question || state.learningBusy) { speak('Bitte die Rückfrage zuerst beantworten oder abbrechen.'); return; }
  const p = selected();
  if (!p || !dirty()) { speak('Kein neuer Entwurf vorhanden.'); return; }
  if (state.busy || state.saving) { message('Bitte die laufende Abfrage abwarten.'); return; }
  if (!fresh() || !p.online || !state.info?.canEdit || state.csv) { message('Speichern benötigt einen aktuellen, bearbeitbaren Prüfpunkt am Controller.', 'error'); return; }
  state.saving = true; updateControls();
  let base = state.draft.base;
  const changes = [];
  if (state.draft.comment !== base.testComment) changes.push({ prop: 'testComment', value: state.draft.comment });
  if (state.draft.result !== null) changes.push({ prop: 'testState', value: state.draft.result });
  const completed = [];
  try {
    for (const change of changes) {
      const result = await execute('write', { target: { dev: base.dev, objType: base.objType, objIdx: base.objIdx, terminal: base.terminal },
        expected: { name: base.name, testState: base.testState, testDate: base.testDate, testComment: base.testComment }, change });
      if (!result.verified) throw new Error('Speicherung nicht bestätigt.');
      await journal({ timestamp: new Date().toISOString(), station: origin, bus: base.busName, device: base.deviceName,
        terminal: base.terminal, key: base.key, name: base.name, field: change.prop, before: base[change.prop],
        after: result.point[change.prop], controllerTestDate: result.point.testDate, verified: true });
      base = result.point; completed.push(change.prop === 'testComment' ? 'Kommentar' : 'Testergebnis');
      state.points = state.points.map(item => item.key === base.key ? base : item);
      state.draft.base = { ...base };
      if (change.prop === 'testState') { state.draft.result = null; $('result').value = ''; }
      if (change.prop === 'testComment') { state.draft.comment = base.testComment; $('comment').value = base.testComment; }
    }
    state.lastRead = Date.now();
    message(`${completed.join(' und ')} auf dem Controller gespeichert und zurückgelesen. Testdatum: ${base.testDate || 'unverändert / leer'}.`, 'success');
    activity(`Zuletzt gespeichert: ${base.terminal} · ${new Date().toLocaleTimeString('de-DE')}`);
    speak(`${base.terminal}. ${completed.join(' und ')} gespeichert.`);
    resetDraft();
  } catch (error) {
    state.lastRead = 0;
    const prefix = completed.length ? `${completed.join(' und ')} bereits gespeichert. Weiterer Auftrag unbestätigt.\n` : '';
    message(`${prefix}${error.message}\nDer offene Entwurf bleibt erhalten. Zuerst neu lesen und abgleichen; nicht ungeprüft erneut speichern.`, 'error');
    speak('Speicherung nicht vollständig bestätigt. Bitte Meldung prüfen.');
  } finally { state.saving = false; renderRows(); renderDetail(); }
}
function editDraft() {
  if (!state.draft) return;
  state.draft.result = $('result').value === '' ? null : Number($('result').value);
  state.draft.comment = $('comment').value;
  $('draftState').textContent = dirty() ? 'Entwurf geändert · noch nicht auf dem Controller gespeichert.' : 'Keine ungespeicherten Änderungen.';
  updateControls();
}
function renderKnowledge() {
  const knowledge = activeKnowledge();
  $('knowledgeScope').textContent = state.globalReady ? `${effectiveTerms(knowledge.terms).length} globale Begriffe für alle Projekte, Controller und CSV-Listen in diesem Browserprofil.${state.globalVocabulary.conflicts.length ? ` ${state.globalVocabulary.conflicts.length} Bedeutungskonflikte bitte in den Einstellungen klären.` : ''}` : 'Globale Begriffe konnten noch nicht geladen werden.';
  $('knowledgeItems').replaceChildren();
  for (const category of ['points', 'commands']) knowledge[category].forEach(item => {
    const row = document.createElement('div'), label = document.createElement('span'), button = document.createElement('button');
    label.textContent = category === 'points' ? `„${item.query}“ → ${clean(item.identity.name)} · ${item.identity.terminal}` : `„${item.phrase}“ → ${item.command}`;
    button.type = 'button'; button.textContent = 'Vergessen';
    button.onclick = async () => {
      if (state.learningBusy || state.lookupBusy || state.saving) return;
      const removed = await changeKnowledge(current => {
        const key = category === 'points' ? 'query' : 'phrase';
        current[category] = current[category].filter(entry => languageKey(entry[key]) !== languageKey(item[key]));
        return current;
      });
      if (removed) { clearQuestion(); updateControls(); $('knowledgeStatus').textContent = 'Zuordnung vergessen.'; }
    };
    row.append(label, button); $('knowledgeItems').append(row);
  });
  if (!knowledge.points.length && !knowledge.commands.length) {
    const empty = document.createElement('p'); empty.textContent = 'Keine zusätzlichen Zuordnungen für den aktuellen Controller.'; $('knowledgeItems').append(empty);
  }
}
function acceptVocabulary(vocabulary, external = false) {
  const changed = state.globalReady && state.globalVocabulary.revision !== vocabulary.revision;
  state.globalVocabulary = vocabulary; state.globalReady = true;
  if (changed && external && !state.writingGlobal) {
    lookupGeneration++; clearLookup(); clearQuestion(); state.dismissedTerms.clear();
    message('Die globalen Begriffe wurden aktualisiert. Offene Rückfragen bitte erneut stellen.');
  }
  renderKnowledge(); updateControls();
}
async function refreshVocabulary(external = false) {
  try { acceptVocabulary(await vocabularyRequest('get'), external); }
  catch (error) { $('knowledgeStatus').textContent = error.message; }
}
async function changeKnowledge(change) {
  if (state.csv || !origin || !state.info || state.learningBusy) return false;
  state.learningBusy = true; updateControls();
  try {
    const key = knowledgeKey(origin), stored = await chrome.storage.local.get(key);
    const next = sanitizeKnowledge(change(sanitizeKnowledge(stored?.[key])));
    await chrome.storage.local.set({ [key]: next });
    state.knowledge = next; renderKnowledge();
    $('knowledgeStatus').textContent = 'Bestätigte Zuordnung für diesen Controller gespeichert.';
    return true;
  } catch {
    $('knowledgeStatus').textContent = 'Die Zuordnung konnte nicht gespeichert werden. Sie wurde nicht als gelernt übernommen.';
    return false;
  } finally { state.learningBusy = false; updateControls(); }
}
async function rememberPoint(query, point) {
  if (state.csv || !query || query.length > 250) return;
  const vocabularyRevision = state.globalVocabulary.revision;
  await changeKnowledge(current => {
    current.points = current.points.filter(item => languageKey(item.query) !== languageKey(query));
    current.points.push({ query, identity: pointIdentity(point), vocabularyRevision }); return current;
  });
}
function clearQuestion() { state.question = null; $('dialog').hidden = true; $('dialogChoices').replaceChildren(); }
function questionText(question) {
  if (question.type === 'term') return `${question.evidence ? 'Aus Name und Beschreibung vermute ich: ' : ''}${question.short} bedeutet ${question.meaning}${question.previous ? `. Bisher: ${question.previous}` : ''}. Soll ich das global für alle Projekte und Controller merken? Sage ja merken oder nein.`;
  if (question.commands.length === 1) return `Meinst du „${question.commands[0]}“? ${question.commands[0] === 'Speichern' ? 'Sage ausdrücklich Speichern, um den aktuellen Entwurf zu übertragen.' : 'Sage ja oder nein.'}`;
  return `Welchen Befehl meinst du? ${question.commands.map((command, index) => `Treffer ${index + 1}: ${command}`).join('. ')}.`;
}
function askQuestion(question, announce = true) {
  clearLookup();
  state.question = { ...question, createdAt: Date.now(), scope: origin, bus: state.bus, vocabularyRevision: state.globalVocabulary.revision };
  const current = state.question;
  $('dialog').hidden = false; $('dialogText').textContent = questionText(current); $('dialogChoices').replaceChildren();
  const labels = current.type === 'term' ? ['Ja, merken'] : current.commands;
  labels.forEach((label, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.onclick = () => { if (state.question === current) return confirmQuestion(index, true); };
    $('dialogChoices').append(button);
  });
  updateControls(); if (announce) speak(questionText(current));
}
function proposeTerm(short, meaning, evidence = null, announce = true) {
  if (!state.globalReady) { speak('Die globalen Begriffseinstellungen sind noch nicht verfügbar. Bitte die Erweiterung neu laden.'); return; }
  try {
    const term = validateTerm(short, meaning);
    const previous = effectiveTerms(state.globalVocabulary.terms).find(item => languageKey(item.short) === languageKey(term.short));
    askQuestion({ type: 'term', ...term, evidence, previous: previous?.meaning }, announce);
  } catch (error) { message(error.message, 'error'); speak(error.message); }
}
async function confirmQuestion(index = 0, explicitButton = false) {
  const question = state.question;
  if (!question) { speak('Es gibt gerade keinen offenen Vorschlag.'); return; }
  if (state.learningBusy || state.saving || state.lookupBusy) return;
  if (Date.now() - question.createdAt > 120000 || question.scope !== origin || question.bus !== state.bus || question.vocabularyRevision !== state.globalVocabulary.revision) {
    clearQuestion(); updateControls(); speak('Die Rückfrage ist abgelaufen. Bitte erneut anfragen.'); return;
  }
  if (question.type === 'term') {
    if (question.evidence && (!fresh() || !state.points.some(point => identityMatches(point, question.evidence)))) {
      clearQuestion(); updateControls(); speak('Die zugrunde liegende Beschreibung ist nicht mehr aktuell bestätigt. Bitte den Wert erneut anfragen.'); return;
    }
    state.learningBusy = true; state.writingGlobal = true; updateControls();
    try {
      const previous = effectiveTerms(state.globalVocabulary.terms).find(term => languageKey(term.short) === languageKey(question.short));
      acceptVocabulary(await vocabularyRequest('save', { expectedRevision: question.vocabularyRevision,
        term: { short: question.short, meaning: question.meaning, aliases: previous?.aliases || [], source: 'learned' } }));
      $('knowledgeStatus').textContent = 'Begriff global gespeichert; in allen Projekten und Controllern verfügbar.';
      if (state.question === question) { clearQuestion(); speak(`Global gemerkt: ${question.short} bedeutet ${question.meaning}.`); }
    } catch (error) { $('knowledgeStatus').textContent = error.message; speak('Der Begriff konnte nicht gespeichert werden. Bitte die Meldung prüfen.'); }
    finally { state.learningBusy = false; state.writingGlobal = false; updateControls(); }
    return;
  }
  const command = question.commands[index];
  if (!command) { speak('Bitte eine der vorgeschlagenen Nummern nennen.'); return; }
  if (command === 'Speichern' && !explicitButton) { speak('Zum Übertragen bitte ausdrücklich Speichern sagen.'); return; }
  const generation = lookupGeneration;
  clearQuestion(); updateControls();
  if (readOnlyCommands.has(command)) await changeKnowledge(current => {
    current.commands = current.commands.filter(item => languageKey(item.phrase) !== languageKey(question.phrase));
    current.commands.push({ phrase: question.phrase, command }); return current;
  });
  if (generation !== lookupGeneration) return;
  return handleCommand(command);
}
function rejectQuestion() {
  if (state.question?.type === 'term') state.dismissedTerms.add(`${languageKey(state.question.short)}:${languageKey(state.question.meaning)}`);
  clearQuestion(); updateControls(); speak('Vorschlag verworfen. Bitte genauer formulieren oder die Bedeutung nennen.');
}
function clearLookup() {
  state.lookup = null;
  $('lookupResults').hidden = true; $('lookupChoices').replaceChildren();
}
function lookupPrompt() {
  const lookup = state.lookup;
  if (!lookup) return 'Keine offene Suche. Sage Wert von und den Namen des Prüfpunkts.';
  const count = lookup.total;
  const intro = lookup.reason || (lookup.uncertain ? 'Ich vermute eine Wertabfrage. Meinst du diese Prüfpunkte?' : lookup.approximate ? `${count} ähnliche ${count === 1 ? 'Bezeichnung gefunden' : 'Bezeichnungen gefunden'}. Bitte bestätigen.` : `${count} passende Prüfpunkte gefunden.`);
  const choices = lookup.matches.slice(0, 5).map((p, i) => `Treffer ${i + 1}: ${pointTitle(p)}. ${clean(p.deviceName)}, Klemme ${p.terminal}.`).join(' ');
  return `${intro} ${count > 5 ? 'Ich nenne die ersten fünf. ' : ''}${choices} Sage Treffer eins${lookup.matches.length > 1 ? ', eine andere Treffernummer oder eine genauere Bezeichnung' : ' oder Suche abbrechen'}.`;
}
function presentLookup(query, result) {
  const lookup = { query, matches: result.matches, total: result.matches.length, approximate: result.approximate, uncertain: result.uncertain, reason: result.reason, createdAt: Date.now() };
  state.lookup = lookup;
  $('lookupTitle').textContent = `${lookup.total} ${lookup.approximate ? 'ähnliche' : 'passende'} Treffer für „${clean(query)}“`;
  $('lookupResults').hidden = false; $('lookupChoices').replaceChildren();
  lookup.matches.slice(0, 8).forEach((p, i) => {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = `${i + 1}. ${clean(p.name)} · ${clean(p.deviceName)} · ${p.terminal}`;
    button.onclick = () => { if (state.lookup === lookup) void chooseLookup(i + 1); };
    $('lookupChoices').append(button);
  });
  message(lookup.reason || (lookup.total > 8 ? 'Die ersten acht Treffer stehen zur Auswahl. Bitte den Namen genauer angeben oder „Treffer …“ sagen.' : 'Bitte „Treffer eins“, eine andere Treffernummer oder eine genauere Bezeichnung sagen.'));
  updateControls(); speak(lookupPrompt());
}
function lookupIsCurrent() {
  if (!state.lookup) { speak('Keine offene Suche. Sage Wert von und den Namen des Prüfpunkts.'); return false; }
  if (Date.now() - state.lookup.createdAt > 120000) {
    clearLookup(); updateControls(); speak('Die Trefferauswahl ist abgelaufen. Bitte den Namen erneut anfragen.'); return false;
  }
  return true;
}
function samePoint(a, b) { return a.key === b.key && a.name === b.name && a.terminal === b.terminal && a.deviceName === b.deviceName; }
async function withLookupData(ready) {
  if (state.lookupBusy || state.saving || state.learningBusy || (state.busy && !refreshTask)) { speak('Bitte den laufenden Auftrag abwarten.'); return; }
  if (dirty()) { speak('Es gibt einen ungespeicherten Entwurf. Bitte zuerst speichern oder Entwurf verwerfen.'); return; }
  const generation = ++lookupGeneration;
  state.lookupBusy = true; updateControls();
  message(state.csv ? 'Suche in der importierten Prüfliste …' : 'Suche in der gesamten Prüfliste des gewählten Busses. Werte werden neu gelesen …');
  try {
    if (refreshTask) await refreshTask;
    if (generation !== lookupGeneration) return;
    if (!state.csv) {
      if (!state.info) throw new Error('Bitte zuerst den Controller verbinden.');
      state.lastAttempt = Date.now();
      const response = await execute('read');
      if (generation !== lookupGeneration) return;
      acceptRead(response);
    }
    await ready();
  } catch (error) {
    if (generation !== lookupGeneration) return;
    clearLookup(); state.lastRead = 0;
    if (!state.csv) { $('connection').textContent = 'Verbindung unterbrochen'; $('connection').className = 'connection warn'; }
    message(`Wertabfrage fehlgeschlagen: ${error.message}`, 'error');
    speak('Der angefragte Wert konnte nicht aktuell gelesen werden. Bitte die Verbindung prüfen.');
  } finally { state.lookupBusy = false; renderDetail(); }
}
function selectLookupPoint(point, query = '') {
  // A spoken lookup is independent of list filters. Reveal its confirmed point.
  $('search').value = ''; $('device').value = ''; $('filter').value = 'all'; $('hideReserve').checked = false;
  select(point.key);
  message(`Gefunden: ${clean(point.name)} · ${clean(point.deviceName)} · ${point.terminal}.`, 'success');
  const suggestion = !state.csv && point.online && suggestTerm(point, query, state.globalVocabulary.terms);
  if (suggestion && !state.dismissedTerms.has(`${languageKey(suggestion.short)}:${languageKey(suggestion.meaning)}`)) proposeTerm(suggestion.short, suggestion.meaning, pointIdentity(point), false);
  readPoint(point, state.question ? questionText(state.question) : '');
}
async function lookupValue(query, candidates = null, uncertain = false) {
  if (!clean(query)) { speak('Bitte den Namen des Prüfpunkts angeben.'); return; }
  $('lookupQuery').value = query;
  await withLookupData(() => {
    const points = candidates ? state.points.filter(p => candidates.some(candidate => samePoint(p, candidate))) : state.points;
    const result = searchPoints(points, query, activeKnowledge());
    result.uncertain = uncertain && !result.learned;
    if (!result.matches.length) {
      clearLookup();
      const text = `Kein passender Prüfpunkt für „${clean(query)}“ ${state.csv ? 'in der importierten Liste' : 'im gewählten Bus'}. Bitte Namen oder Klemme genauer angeben${state.csv ? '.' : ' oder den Bus wechseln. Eine unbekannte Abkürzung kannst du mit „RT bedeutet Raumtemperatur“ erklären.'}`;
      message(text); speak(text); return;
    }
    if (result.matches.length === 1 && !result.approximate && !result.uncertain) selectLookupPoint(result.matches[0], query);
    else presentLookup(query, result);
  });
}
async function chooseLookup(index) {
  if (!lookupIsCurrent()) return;
  const candidate = state.lookup.matches[index - 1];
  const query = state.lookup.query;
  if (!candidate || index > 8) { speak('Diese Treffernummer steht nicht zur Auswahl. Bitte eine angezeigte Nummer nennen.'); return; }
  await withLookupData(async () => {
    const point = state.points.find(p => samePoint(p, candidate));
    if (!point) { clearLookup(); message('Die Bezeichnung oder Zuordnung hat sich geändert. Bitte erneut suchen.', 'error'); speak('Der Prüfpunkt wurde geändert. Bitte den Namen erneut anfragen.'); return; }
    selectLookupPoint(point, query);
    await rememberPoint(query, point);
  });
}
function cancelLookup() {
  lookupGeneration++; clearLookup(); clearQuestion(); updateControls();
  message('Suche abgebrochen.');
}
function stopMicrophone() { state.micWanted = false; clearTimeout(restarting); try { recognition?.abort(); } catch {} $('microphone').textContent = 'Sprachbefehle starten'; $('microphone').classList.remove('listening'); }
function scheduleRecognition() {
  clearTimeout(restarting);
  if (!state.micWanted || state.speaking) return;
  restarting = setTimeout(() => { if (!state.micWanted || state.speaking || state.saving) { scheduleRecognition(); return; } try { recognition.start(); } catch {} }, 550);
}
async function handleCommand(text) {
  $('transcript').textContent = `Erkannt: ${text}`;
  const cmd = commandFrom(text, activeKnowledge()), p = selected();
  if (cmd.action === 'stop') { cancelLookup(); stopMicrophone(); chrome.tts.stop(); $('watch').checked = false; return; }
  if (cmd.action === 'cancelSearch') { cancelLookup(); speak('Suche abgebrochen.'); return; }
  if (state.learningBusy) { speak('Die bestätigte Zuordnung wird gespeichert. Bitte kurz warten.'); return; }
  if (cmd.action === 'confirm') {
    if (state.question) return state.question.type === 'command' && state.question.commands.length > 1 ? speak(questionText(state.question)) : confirmQuestion();
    if (state.lookup?.matches.length === 1) return chooseLookup(1);
    speak(state.lookup ? lookupPrompt() : 'Es gibt gerade keinen offenen Vorschlag.'); return;
  }
  if (cmd.action === 'reject') { if (state.question) return rejectQuestion(); clearLookup(); updateControls(); speak('Bitte den gewünschten Prüfpunkt genauer nennen.'); return; }
  if (state.question && cmd.action === 'choose' && state.question.type === 'command') return confirmQuestion(cmd.value - 1);
  if (state.lookupBusy) { speak('Die Suche läuft. Bitte kurz warten.'); return; }
  if (state.question) {
    const explicitSave = cmd.action === 'save' && state.question.type === 'command' && state.question.commands.includes('Speichern');
    if (!explicitSave && !['lookup', 'select', 'define', 'meaning', 'read', 'next', 'previous', 'status'].includes(cmd.action)) { speak(questionText(state.question)); return; }
    clearQuestion(); updateControls();
  }
  if (cmd.action === 'define') return proposeTerm(cmd.short, cmd.meaning);
  if (cmd.action === 'meaning') {
    const term = effectiveTerms(activeKnowledge().terms).find(item => languageKey(item.short) === languageKey(cmd.value));
    speak(term ? `${term.short} bedeutet ${term.meaning}.` : `Für ${clean(cmd.value)} kenne ich noch keine bestätigte Bedeutung. Du kannst sie mit ${clean(cmd.value)} bedeutet und der Erklärung nennen.`); return;
  }
  if (cmd.action === 'negated') { speak('Verstanden. Kein Auftrag übernommen.'); return; }
  if (cmd.action === 'unsupported') { speak('Aktive Ausgangsbefehle sind in dieser Version nicht verfügbar. Zum Abfragen bitte Wert von und die Bezeichnung sagen.'); return; }
  if (cmd.action === 'rememberedCommand') return handleCommand(cmd.command);
  if (cmd.action === 'suggest') return askQuestion({ type: 'command', commands: cmd.commands, phrase: cmd.phrase });
  if (cmd.action === 'lookup' || cmd.action === 'select') return lookupValue(cmd.value);
  if (cmd.action === 'choose') return chooseLookup(cmd.value);
  if (state.lookup) {
    if (!lookupIsCurrent()) return;
    if (cmd.action === 'unknown') return lookupValue(text, state.lookup.matches);
    speak(lookupPrompt()); return;
  }
  if (cmd.action === 'read') return readCurrent();
  if (cmd.action === 'status') return speak(p ? `${p.terminal}. Gespeichertes Prüfergebnis: ${labels[p.testState]}.` : 'Kein Prüfpunkt ausgewählt.');
  if (cmd.action === 'next') return navigate(1, true);
  if (cmd.action === 'previous') return navigate(-1, true);
  if (cmd.action === 'discard') { resetDraft(); speak('Entwurf verworfen.'); return; }
  if (cmd.action === 'save') return save();
  if (['comment', 'result'].includes(cmd.action)) {
    if (!p || !fresh() || !p.online || !state.info?.canEdit || state.saving) { speak('Kein bearbeitbarer aktueller Prüfpunkt ausgewählt.'); return; }
    if (cmd.action === 'comment') { $('comment').value = cmd.value; editDraft(); speak(`Kommentar als Entwurf: ${cmd.value}. Zum Übertragen speichern sagen.`); }
    else { $('result').value = String(cmd.value); editDraft(); speak(`Ergebnis ${labels[cmd.value]} vorgemerkt. Zum Übertragen speichern sagen.`); }
    return;
  }
  return lookupValue(text, null, true);
}
function startMicrophone() {
  if (state.micWanted) { stopMicrophone(); return; }
  const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  if (!Recognition) { message('Dieser Browser bietet keine nutzbare Spracherkennung. Sprachausgabe und Bedienung per Maus bleiben verfügbar.', 'error'); return; }
  if (!recognition) {
    recognition = new Recognition(); recognition.lang = 'de-DE'; recognition.interimResults = false; recognition.continuous = false; recognition.maxAlternatives = 1;
    recognition.onresult = event => {
      if (!state.micWanted || state.speaking || state.saving) return;
      const result = event.results[event.resultIndex];
      if (result?.isFinal) void handleCommand(result[0].transcript);
    };
    recognition.onend = scheduleRecognition;
    recognition.onerror = event => {
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      stopMicrophone(); message(`Spracherkennung gestoppt (${event.error}). Mikrofonberechtigung, Browserunterstützung und Internet prüfen.`, 'error');
    };
  }
  state.micWanted = true; $('microphone').textContent = 'Sprachbefehle stoppen'; $('microphone').classList.add('listening'); scheduleRecognition();
}
$('connect').onclick = connect;
$('bus').onchange = async () => {
  if (!allowedNavigation()) { $('bus').value = String(state.bus); return; }
  clearLookup(); clearQuestion();
  state.bus = Number($('bus').value); state.selected = null; state.draft = null; state.lastRead = 0; state.points = [];
  renderRows(); renderDetail(); await refresh();
};
for (const id of ['search', 'filter', 'device', 'hideReserve']) $(id).addEventListener(id === 'search' ? 'input' : 'change', renderRows);
$('previous').onclick = () => navigate(-1); $('next').onclick = () => navigate(1); $('read').onclick = readCurrent;
$('result').onchange = editDraft; $('comment').oninput = editDraft; $('save').onclick = save;
$('discard').onclick = () => { resetDraft(); renderDetail(); };
$('watch').onchange = () => { state.watchBaseline = null; state.watchAvailable = null; if ($('watch').checked) { readCurrent(); watchValue(); } };
$('quiet').onclick = () => { globalThis.chrome?.tts?.stop(); $('watch').checked = false; };
$('microphone').onclick = startMicrophone;
$('lookupForm').onsubmit = event => { event.preventDefault(); return handleCommand($('lookupQuery').value); };
$('lookupCancel').onclick = () => { cancelLookup(); speak('Suche abgebrochen.'); };
$('dialogNo').onclick = rejectQuestion;
$('csvFile').onchange = async event => {
  const file = event.target.files[0]; if (!file || !allowedNavigation()) return;
  if (state.busy || state.saving) { message('Bitte die laufende Controllerabfrage abwarten und die CSV-Datei erneut auswählen.'); event.target.value = ''; return; }
  state.busy = true; updateControls();
  try {
    if (file.size > 5000000) throw new Error('CSV-Datei größer als 5 MB.');
    const points = parseCsv(await file.text(), file.name);
    state.points = points; state.csv = true; state.lastRead = 0; state.selected = null; state.draft = null; $('watch').checked = false;
    $('station').textContent = 'CSV-Ansicht · gespeicherte Prüfliste'; $('connection').textContent = 'CSV · keine Livewerte'; $('connection').className = 'connection';
    fillDevices(); select(points[0]?.key || null); renderRows(); renderDetail(); renderKnowledge();
    message(`${points.length} Prüfpunkte aus CSV gelesen. Diese Ansicht enthält keine aktuellen Werte und kann keine Controllerdaten speichern.`);
  } catch (error) { message(error.message, 'error'); }
  finally { state.busy = false; updateControls(); }
  event.target.value = '';
};
$('exportHistory').onclick = () => {
  const blob = new Blob([JSON.stringify({ format: 'bacsolution-io-session', version: 1, exportedAt: new Date().toISOString(), entries: state.history }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `BACsolution-IO-Protokoll-${new Date().toISOString().replace(/[:.]/g, '-')}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
};
window.addEventListener('beforeunload', event => { if (dirty() || state.saving) { event.preventDefault(); event.returnValue = ''; } });
setInterval(() => {
  if (!state.csv && state.info && Date.now() - state.lastAttempt >= 4000) void refresh();
  $('received').textContent = state.csv ? 'Export ohne Livewerte' : state.lastRead ? `Letzte Controllerantwort vor ${Math.floor((Date.now() - state.lastRead) / 1000)} s` : 'Keine bestätigte aktuelle Antwort';
  renderDetail();
}, 1000);
try { const stored = await globalThis.chrome?.storage?.local.get('ioSessionHistory'); state.history = Array.isArray(stored?.ioSessionHistory) ? stored.ioSessionHistory.slice(-1000) : []; } catch {}
try { if (origin) { const key = knowledgeKey(origin), stored = await globalThis.chrome?.storage?.local.get(key); state.knowledge = sanitizeKnowledge(stored?.[key]); } } catch { $('knowledgeStatus').textContent = 'Gelernte Zuordnungen konnten nicht geladen werden.'; }
await refreshVocabulary();
globalThis.chrome?.storage?.onChanged?.addListener((changes, area) => { if (area === 'local' && changes[globalVocabularyKey]) void refreshVocabulary(true); });
if (params.get('notice')) message(params.get('notice'));
renderRows(); renderDetail(); renderKnowledge();
if (origin && params.has('tab')) await connect();
