import { effectiveTerms, languageKey } from './language.js';
import { vocabularyRequest, globalVocabularyKey, validateDefinition, exportVocabulary, parseVocabularyFile } from './vocabulary.js';

const $ = id => document.getElementById(id);
const settings = { vocabulary: null, editingKey: null, editingRevision: null, formDirty: false, busy: false, pendingImport: null, aliasRows: [] };
function notice(text, error = false) { $('settingsMessage').textContent = text; $('settingsMessage').className = `message ${error ? 'error' : ''}`; }
function busy(value) {
  settings.busy = value;
  for (const id of ['termSave', 'reloadTerms', 'restoreTerms', 'applyImport', 'importFile', 'termShort', 'termMeaning', 'cancelEdit']) $(id).disabled = value || !settings.vocabulary;
  $('exportTerms').disabled = value || !settings.vocabulary || settings.vocabulary.conflicts.length > 0;
  updateAliasControls();
}
function markFormDirty() {
  if (!settings.formDirty) settings.editingRevision = settings.vocabulary?.revision;
  settings.formDirty = true;
}
function updateAliasControls() {
  const disabled = settings.busy || !settings.vocabulary;
  $('addAlias').disabled = disabled || settings.aliasRows.length >= 30;
  for (const row of settings.aliasRows) { row.input.disabled = disabled; row.remove.disabled = disabled; }
}
function addAliasRow(value = '', markDirty = true) {
  if (settings.aliasRows.length >= 30) return;
  const element = document.createElement('tr'), input = document.createElement('input');
  input.type = 'text'; input.maxLength = 80; input.value = value; input.placeholder = 'Weitere Bezeichnung';
  input.ariaLabel = 'Weitere Bezeichnung'; input.oninput = markFormDirty;
  const row = { element, input, remove: makeButton('Entfernen', () => {
    settings.aliasRows = settings.aliasRows.filter(item => item !== row);
    $('termAliasRows').replaceChildren(...settings.aliasRows.map(item => item.element));
    if (!settings.aliasRows.length) addAliasRow('', false);
    markFormDirty(); updateAliasControls();
  }) };
  row.remove.ariaLabel = 'Diese Bezeichnung entfernen';
  element.insertCell().append(input); element.insertCell().append(row.remove);
  settings.aliasRows.push(row); $('termAliasRows').append(element); updateAliasControls();
  if (markDirty) { markFormDirty(); input.focus(); }
}
function renderAliasEditor(aliases = []) {
  settings.aliasRows = []; $('termAliasRows').replaceChildren();
  for (const alias of aliases.length ? aliases : ['']) addAliasRow(alias, false);
}
function resetEditor() {
  settings.editingKey = null; settings.editingRevision = settings.vocabulary?.revision; settings.formDirty = false;
  $('termShort').value = ''; $('termMeaning').value = ''; renderAliasEditor(); $('editorTitle').textContent = 'Begriff hinzufügen';
}
function editTerm(term) {
  if (settings.busy) return;
  settings.editingKey = languageKey(term.short); settings.editingRevision = settings.vocabulary.revision; settings.formDirty = true;
  $('termShort').value = term.short; $('termMeaning').value = term.meaning; renderAliasEditor(term.aliases);
  $('editorTitle').textContent = `„${term.short}“ bearbeiten`; $('termShort').focus();
}
function makeButton(label, action) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
  button.onclick = () => { if (!settings.busy) return action(); }; return button;
}
function renderTerms() {
  if (!settings.vocabulary) return;
  const vocabulary = settings.vocabulary, active = effectiveTerms(vocabulary.terms), query = languageKey($('termSearch').value);
  let terms = [...active];
  if ($('showRemoved').checked) terms.push(...vocabulary.terms.filter(term => term.disabled && term.source !== 'conflict'));
  terms = terms.filter(term => languageKey(`${term.short} ${term.meaning} ${(term.aliases || []).join(' ')}`).includes(query)).sort((a, b) => a.short.localeCompare(b.short, 'de'));
  $('termCount').textContent = `(${active.length})`; $('termsEmpty').hidden = terms.length > 0; $('termRows').replaceChildren();
  const sources = { default: 'Vorgabe', manual: 'Eingetragen', learned: 'Gelernt', import: 'Import' };
  for (const term of terms) {
    const row = document.createElement('tr'); if (term.disabled) row.className = 'removed';
    row.insertCell().textContent = term.short; row.insertCell().textContent = term.meaning;
    const aliasesCell = row.insertCell();
    if (term.aliases?.length) {
      const table = document.createElement('table'), body = document.createElement('tbody');
      table.className = 'alias-values'; table.ariaLabel = `Weitere Bezeichnungen für ${term.short}`;
      for (const alias of term.aliases) { const aliasRow = document.createElement('tr'); aliasRow.insertCell().textContent = alias; body.append(aliasRow); }
      table.append(body); aliasesCell.append(table);
    } else aliasesCell.textContent = '—';
    row.insertCell().textContent = term.disabled ? 'Entfernt' : sources[term.source] || 'Eingetragen';
    const actions = row.insertCell();
    actions.append(makeButton(term.disabled ? 'Wieder aufnehmen' : 'Bearbeiten', () => editTerm(term)));
    if (!term.disabled) actions.append(makeButton('Entfernen', () => mutate('delete', { short: term.short, expectedRevision: vocabulary.revision }, 'Begriff global entfernt.')));
    $('termRows').append(row);
  }
  $('conflictsPanel').hidden = vocabulary.conflicts.length === 0; $('termConflicts').replaceChildren();
  for (const conflict of vocabulary.conflicts) {
    const section = document.createElement('div'), heading = document.createElement('h3'); heading.textContent = conflict.short; section.append(heading);
    conflict.variants.forEach(term => {
      const row = document.createElement('p'), title = document.createElement('span');
      title.textContent = `${term.disabled ? 'Entfernen' : term.meaning} · ${term.from}. `;
      row.append(title, makeButton('Diese Bedeutung übernehmen', () => term.disabled
        ? mutate('delete', { short: conflict.short, expectedRevision: vocabulary.revision }, 'Konflikt durch Entfernen geklärt.')
        : mutate('save', { term: { ...term, source: 'manual' }, expectedRevision: vocabulary.revision }, 'Bedeutung global übernommen.')));
      section.append(row);
    });
    $('termConflicts').append(section);
  }
  busy(settings.busy);
}
async function loadTerms(external = false) {
  try {
    const next = await vocabularyRequest('get'), changed = settings.vocabulary && next.revision !== settings.vocabulary.revision;
    settings.vocabulary = next;
    if (!settings.formDirty) settings.editingRevision = next.revision;
    renderTerms();
    if (external && changed && settings.formDirty) notice('Die Liste wurde in einem anderen Tab geändert. Dein Entwurf bleibt erhalten; bitte die neue Liste prüfen und den Eintrag erneut öffnen.', true);
    else if (!external) notice(next.conflicts.length ? 'Vorhandene Begriffe wurden übernommen. Bitte die unterschiedlichen Bedeutungen unten klären.' : 'Globale Begriffsliste bereit. Änderungen gelten für alle Projekte und Controller.');
  } catch (error) { notice(error.message, true); }
}
async function mutate(operation, data, success) {
  if (settings.busy) return false;
  busy(true);
  try {
    settings.vocabulary = await vocabularyRequest(operation, data); renderTerms(); notice(success); return true;
  } catch (error) { notice(error.message, true); return false; }
  finally { busy(false); }
}
$('termForm').onsubmit = async event => {
  event.preventDefault();
  try {
    const term = validateDefinition({ short: $('termShort').value, meaning: $('termMeaning').value,
      aliases: settings.aliasRows.map(row => row.input.value.trim()).filter(Boolean), source: 'manual' });
    const data = { term, expectedRevision: settings.editingRevision, mode: settings.editingKey === null ? 'new' : 'edit' };
    if (settings.editingKey !== null) data.oldKey = settings.editingKey;
    if (await mutate('save', data, 'Begriff global gespeichert und sofort verfügbar.')) resetEditor();
  } catch (error) { notice(error.message, true); }
};
for (const id of ['termShort', 'termMeaning']) $(id).oninput = markFormDirty;
$('addAlias').onclick = () => { if (!settings.busy) addAliasRow(); };
$('cancelEdit').onclick = resetEditor;
$('termSearch').oninput = renderTerms; $('showRemoved').onchange = renderTerms;
$('reloadTerms').onclick = () => loadTerms();
$('restoreTerms').onclick = () => mutate('restoreDefaults', { expectedRevision: settings.vocabulary.revision }, 'Standardbegriffe wiederhergestellt. Eigene zusätzliche Begriffe bleiben erhalten.');
$('exportTerms').onclick = () => {
  if (!settings.vocabulary || settings.vocabulary.conflicts.length) return;
  const blob = new Blob([JSON.stringify(exportVocabulary(settings.vocabulary), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'BACsolution_Begriffe.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};
$('importFile').onchange = async event => {
  const file = event.target.files[0]; if (!file || settings.busy) return;
  try {
    if (file.size > 1000000) throw new Error('Die Importdatei ist größer als 1 MB.');
    const text = await file.text(), terms = parseVocabularyFile(text);
    settings.pendingImport = { text, expectedRevision: settings.vocabulary.revision };
    $('importSummary').textContent = `${terms.length} Einträge aus „${file.name}“. Neue Begriffe ergänzen; abweichende Bedeutungen werden zur Auswahl gestellt.`;
    $('importPreview').hidden = false;
  } catch (error) { notice(error.message, true); }
  event.target.value = '';
};
$('cancelImport').onclick = () => { settings.pendingImport = null; $('importPreview').hidden = true; };
$('applyImport').onclick = async () => {
  if (!settings.pendingImport) return;
  if (await mutate('import', settings.pendingImport, 'Import übernommen. Eventuelle Bedeutungskonflikte bitte unten klären.')) { settings.pendingImport = null; $('importPreview').hidden = true; }
};
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[globalVocabularyKey] && !settings.busy) void loadTerms(true); });
window.addEventListener('beforeunload', event => { if (settings.formDirty) { event.preventDefault(); event.returnValue = ''; } });
renderAliasEditor(); busy(true); await loadTerms(); busy(false);
