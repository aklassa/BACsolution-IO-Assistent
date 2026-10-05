import { defaultTerms, defaultTermsRevision, effectiveTerms, languageKey, termToken, isChemicalTerm, validateTerm, sanitizeKnowledge } from './language.js';

export const globalVocabularyKey = 'ioVocabulary.global.v1';
export function emptyVocabulary() { return { version: 1, revision: 0, defaultsRevision: defaultTermsRevision, terms: [], conflicts: [] }; }
export function validateDefinition(value) {
  if (!value || typeof value !== 'object') throw new Error('Begriffseintrag fehlt.');
  const term = validateTerm(value.short, value.meaning);
  if (value.aliases !== undefined && !Array.isArray(value.aliases)) throw new Error('Weitere Bezeichnungen müssen eine Liste sein.');
  const aliases = [...new Set((value.aliases || []).map(alias => {
    if (typeof alias !== 'string' || (!/^[a-zäöüß][a-zäöüß ._()-]{0,79}$/i.test(alias.trim()) && !isChemicalTerm(alias))) throw new Error('Weitere Bezeichnungen dürfen nur Wörter oder CO2 enthalten.');
    const cleaned = alias.trim();
    if (languageKey(cleaned) !== languageKey(term.meaning)) validateTerm(cleaned, term.meaning);
    return cleaned;
  }))];
  if (aliases.length > 30) throw new Error('Höchstens 30 weitere Bezeichnungen pro Eintrag.');
  return { ...term, aliases, disabled: value.disabled === true, source: ['manual', 'learned', 'import', 'conflict', 'default'].includes(value.source) ? value.source : 'manual' };
}
function checkedVocabulary(raw) {
  if (!raw || raw.version !== 1 || !Number.isSafeInteger(raw.revision) || raw.revision < 0 || !Array.isArray(raw.terms) || !Array.isArray(raw.conflicts)) throw new Error('Das globale Begriffsverzeichnis ist nicht lesbar. Vorhandene Daten wurden nicht überschrieben.');
  if (raw.defaultsRevision !== undefined && (!Number.isSafeInteger(raw.defaultsRevision) || raw.defaultsRevision < 1 || raw.defaultsRevision > defaultTermsRevision)) throw new Error('Der Stand der Standardbegriffe ist nicht kompatibel. Vorhandene Daten wurden nicht überschrieben.');
  const conflicts = raw.conflicts.map(conflict => {
    if (!conflict || typeof conflict.key !== 'string' || typeof conflict.short !== 'string' || !Array.isArray(conflict.variants) || !conflict.variants.length) throw new Error('Ein Bedeutungskonflikt ist nicht lesbar. Vorhandene Daten wurden nicht überschrieben.');
    return { key: conflict.key, short: conflict.short, variants: conflict.variants.map(variant => ({ ...validateDefinition(variant), from: String(variant.from || 'Vorhandener Eintrag') })) };
  });
  return { ...raw, terms: raw.terms.map(validateDefinition), conflicts };
}
function key(term) { return languageKey(term.short); }
function meaningKey(term) { return term.meaning.split('/').map(languageKey).sort().join('|'); }
function put(list, term) { return [...list.filter(item => key(item) !== key(term)), term]; }
function definitionWords(term) { return [term.short, ...term.meaning.split('/'), ...(term.aliases || [])].map(termToken); }
function checkAliases(terms) {
  const seen = new Map();
  for (const term of effectiveTerms(terms)) for (const word of definitionWords(term)) {
    const other = seen.get(word);
    if (other && meaningKey(other) !== meaningKey(term)) throw new Error(`„${word}“ ist bereits bei „${other.short}“ mit einer anderen Bedeutung hinterlegt.`);
    seen.set(word, term);
  }
}
function mergeEntries(state, entries, source, preferIncoming = false) {
  for (const entry of entries) {
    const incoming = validateDefinition(entry), old = effectiveTerms(state.terms).find(term => key(term) === key(incoming));
    const conflict = state.conflicts.find(item => item.key === key(incoming));
    if (conflict) {
      if (!conflict.variants.some(variant => meaningKey(variant) === meaningKey(incoming) && variant.disabled === incoming.disabled)) conflict.variants.push({ ...incoming, from: source });
    } else if (!old || (old.source === 'default' && preferIncoming)) {
      state.terms = put(state.terms, incoming);
    } else if (meaningKey(old) === meaningKey(incoming) && !incoming.disabled) {
      state.terms = put(state.terms, { ...old, aliases: [...new Set([...(old.aliases || []), ...incoming.aliases])] });
    } else {
      state.conflicts.push({ key: key(incoming), short: incoming.short, variants: [{ ...old, from: 'Bisheriger Eintrag' }, { ...incoming, from: source }] });
      // A conflict has no active global meaning until the user resolves it.
      state.terms = put(state.terms, { ...old, disabled: true, source: 'conflict' });
    }
  }
}
export function migrateVocabulary(allStorage) {
  const state = emptyVocabulary();
  for (const [name, value] of Object.entries(allStorage)) {
    if (!name.startsWith('ioVocabulary.v1:')) continue;
    const terms = sanitizeKnowledge(value).terms.map(term => ({ ...term, aliases: [], source: 'learned' }));
    mergeEntries(state, terms, name.slice('ioVocabulary.v1:'.length), true);
  }
  return state;
}
export function exportVocabulary(state) {
  return { format: 'bacsolution-io-vocabulary', version: 1,
    terms: [...effectiveTerms(state.terms), ...state.terms.filter(term => term.disabled && term.source !== 'conflict')].map(({ short, meaning, aliases, disabled }) => ({ short, meaning, aliases, disabled: !!disabled })) };
}
export function parseVocabularyFile(text) {
  const data = JSON.parse(text);
  if (data?.format !== 'bacsolution-io-vocabulary' || data.version !== 1 || !Array.isArray(data.terms) || data.terms.length > 1000) throw new Error('Kein gültiger BACsolution-Begriffsexport (maximal 1000 Einträge).');
  const terms = data.terms.map(term => validateDefinition({ ...term, source: 'import' }));
  if (new Set(terms.map(key)).size !== terms.length) throw new Error('Der Import enthält dasselbe Kürzel mehrfach.');
  checkAliases(terms);
  return terms;
}
// One service-worker instance serializes writes from all controller/settings tabs.
// Revision checks prevent stale editors from overwriting newer definitions.
export function createVocabularyService(storage) {
  let pending = Promise.resolve();
  async function process(operation, data = {}) {
    const all = await storage.get(null);
    const existed = Object.hasOwn(all, globalVocabularyKey);
    let state = existed ? checkedVocabulary(all[globalVocabularyKey]) : migrateVocabulary(all);
    const catalogChanged = state.defaultsRevision !== defaultTermsRevision;
    if (catalogChanged) { state.defaultsRevision = defaultTermsRevision; state.revision += 1; }
    if (!existed || catalogChanged) await storage.set({ [globalVocabularyKey]: state });
    if (operation === 'get') return state;
    if (data.expectedRevision !== state.revision) throw new Error('Die Begriffsliste wurde inzwischen geändert. Bitte neu laden und deinen Eintrag erneut speichern.');
    if (operation === 'save') {
      const term = validateDefinition(data.term), oldKey = data.oldKey === undefined ? key(term) : languageKey(data.oldKey);
      if (data.mode === 'new' && effectiveTerms(state.terms).some(item => key(item) === key(term))) throw new Error('Dieses Kürzel ist bereits vorhanden. Bitte dessen Eintrag bearbeiten.');
      if (oldKey !== key(term) && effectiveTerms(state.terms).some(item => key(item) === key(term))) throw new Error('Dieses Kürzel ist bereits vorhanden. Bitte dessen Eintrag bearbeiten.');
      if (oldKey !== key(term)) {
        const old = effectiveTerms(state.terms).find(item => key(item) === oldKey);
        if (!old) throw new Error('Der bearbeitete Eintrag ist nicht mehr vorhanden.');
        state.terms = put(state.terms, { ...old, disabled: true });
      }
      state.terms = put(state.terms, term);
      state.conflicts = state.conflicts.filter(item => ![oldKey, key(term)].includes(item.key));
      checkAliases(state.terms);
    } else if (operation === 'delete') {
      const short = languageKey(data.short), term = effectiveTerms(state.terms).find(item => key(item) === short) || state.terms.find(item => key(item) === short);
      if (!term) throw new Error('Dieser Begriff ist nicht mehr vorhanden.');
      state.terms = put(state.terms, { ...term, disabled: true, source: 'manual' });
      state.conflicts = state.conflicts.filter(item => item.key !== short);
    } else if (operation === 'import') {
      if (typeof data.text !== 'string' || data.text.length > 1000000) throw new Error('Importdatei zu groß.');
      mergeEntries(state, parseVocabularyFile(data.text), 'Import');
      checkAliases(state.terms);
    } else if (operation === 'restoreDefaults') {
      const defaults = new Set(defaultTerms.map(key));
      state.terms = state.terms.filter(term => !defaults.has(key(term)));
      state.conflicts = state.conflicts.filter(item => !defaults.has(item.key));
      checkAliases(state.terms);
    } else throw new Error('Unbekannte Begriffsaktion.');
    if (state.terms.length > 1000) throw new Error('Maximal 1000 globale Begriffseinträge.');
    state.revision++;
    await storage.set({ [globalVocabularyKey]: state });
    return state;
  }
  return { request(operation, data) {
    const task = pending.then(() => process(operation, data)); pending = task.catch(() => {}); return task;
  } };
}
export async function vocabularyRequest(operation, data = {}) {
  const response = await chrome.runtime.sendMessage({ channel: 'bacsolution-vocabulary', operation, data });
  if (!response?.ok) throw new Error(response?.error || 'Begriffseinstellungen sind nicht erreichbar. Erweiterung neu laden.');
  return response.vocabulary;
}
