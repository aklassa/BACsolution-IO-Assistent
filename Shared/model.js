import { semanticText, flexibleIntent, editDistance, languageKey, identityMatches } from './language.js';

export const labels = ['Keine Auswahl', 'Nicht getestet', 'OK', 'Nicht OK'];
export function clean(text) { return String(text ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim(); }
export function normalized(text) { return clean(text).toLocaleLowerCase('de-DE').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim(); }
export function commandFrom(text, knowledge = {}) {
  const raw = String(text).trim();
  const comment = raw.match(/^kommentar\s*[:,-]?\s+([\s\S]+)$/i);
  if (comment) return { action: 'comment', value: comment[1].trim() };
  const n = normalized(raw);
  const fixed = { 'weiter': 'next', 'nachster': 'next', 'nachster datenpunkt': 'next', 'nachster eingang': 'next',
    'zuruck': 'previous', 'vorheriger datenpunkt': 'previous', 'wert': 'read', 'wert vorlesen': 'read',
    'vorlesen': 'read', 'status': 'status', 'speichern': 'save', 'entwurf verwerfen': 'discard', 'stopp': 'stop',
    'stop': 'stop', 'nicht ok': 3, 'nicht okay': 3, 'ergebnis nicht ok': 3, 'ergebnis nicht okay': 3, 'nicht getestet': 1, 'ergebnis nicht getestet': 1,
    'ok': 2, 'okay': 2, 'ergebnis ok': 2, 'ergebnis okay': 2 };
  if (Object.hasOwn(fixed, n)) return typeof fixed[n] === 'number' ? { action: 'result', value: fixed[n] } : { action: fixed[n] };
  if (['suche abbrechen', 'auswahl abbrechen', 'abbrechen'].includes(n)) return { action: 'cancelSearch' };
  const choice = n.match(/^(?:treffer|nummer|nimm treffer|wahle treffer)\s+(.+)$/);
  if (choice) {
    const number = spokenNumber(choice[1]);
    if (/^[1-9]\d*$/.test(number)) return { action: 'choose', value: Number(number) };
  }
  const namedValue = raw.match(/^(?:bitte\s+)?(?:wert\s+(?:von|vom|für|fuer)|(?:lies|lese)\s+(?:bitte\s+)?(?:den\s+)?wert\s+(?:von|vom|für|fuer)|wie\s+(?:ist|lautet)\s+(?:der\s+)?wert\s+(?:von|vom))\s+(.+?)\s*[?.!]?$/i);
  if (namedValue) return { action: 'lookup', value: namedValue[1].replace(/\s+(?:bitte\s+)?vor(?:lesen)?\s*[.!]?$/i, '').trim() };
  const match = raw.match(/^(?:prüfe|pruefe|wähle|waehle)\s+(.+)$/i);
  if (match) return { action: 'select', value: match[1] };
  return flexibleIntent(raw, knowledge);
}
const numberWords = { null: '0', ein: '1', eins: '1', eine: '1', zwei: '2', zwo: '2', drei: '3', vier: '4', funf: '5', sechs: '6', sieben: '7', acht: '8', neun: '9', zehn: '10', elf: '11', zwolf: '12', dreizehn: '13', vierzehn: '14', funfzehn: '15', sechzehn: '16', siebzehn: '17', achtzehn: '18', neunzehn: '19', zwanzig: '20' };
function spokenNumber(word) { return Object.hasOwn(numberWords, word) ? numberWords[word] : word; }
const fillerWords = new Set(['der', 'die', 'das', 'den', 'dem', 'des', 'von', 'vom', 'fur', 'in', 'im', 'am', 'an', 'bitte', 'mal', 'mir', 'es', 'aktuell', 'aktuelle', 'aktuellen', 'aktueller', 'aktuelles', 'momentan', 'derzeit', 'gerade', 'denn', 'eigentlich']);
function searchWords(text, terms = []) {
  const words = semanticText(text, terms).split(/\s+/).map(spokenNumber);
  return words.filter((word, i) => word && !fillerWords.has(word) &&
    !(['punkt', 'komma'].includes(word) && /^\d+$/.test(words[i - 1]) && /^\d+$/.test(words[i + 1])))
    .join(' ').replace(/\b(?:[a-z] ){1,}[a-z]\b/g, letters => letters.replaceAll(' ', '')).split(' ').filter(Boolean);
}
function numericGroups(words) {
  const groups = []; let current = [];
  for (const word of [...words, '']) {
    if (/^\d+$/.test(word)) current.push(word);
    else if (current.length) { groups.push(current.join('.')); current = []; }
  }
  return groups;
}
function closeWord(a, b) {
  if (a.length < 6 || b.length < 6) return false;
  const limit = a.length >= 10 ? 2 : 1;
  if (Math.abs(a.length - b.length) > limit) return false;
  return editDistance(a, b) <= limit;
}
// The controller's real labels are the only search source. Never invent a point
// or silently replace an identifier (2.1 must not match 2.10 / 12.1).
export function searchPoints(points, query, knowledge = {}) {
  const words = searchWords(query, knowledge.terms);
  if (!words.length) return { matches: [], approximate: false };
  const numbers = numericGroups(words), letters = words.filter(w => !/^\d+$/.test(w));
  const strict = [], possible = [], eligible = [], conflicts = new Set();
  const roles = ['ansteuerung', 'freigabe', 'stormeldung', 'betriebsmeldung'];
  const requestedRoles = roles.filter(role => letters.some(word => word.includes(role)));
  for (const point of points) {
    const fields = [point.name, point.terminal, point.description, point.deviceName, point.busName].map(field => searchWords(field, knowledge.terms));
    const fieldNumbers = fields.flatMap(numericGroups);
    if (!numbers.every(n => fieldNumbers.includes(n))) continue;
    eligible.push(point);
    const texts = fields.map(field => field.filter(w => !/^\d+$/.test(w)).join(''));
    const tokens = fields.flat().filter(w => !/^\d+$/.test(w));
    const contains = word => texts.some(text => text.includes(word));
    const missing = letters.filter(word => !contains(word));
    const namedRoles = roles.filter(role => fields[0].some(word => word.includes(role)));
    const conflict = namedRoles.length && requestedRoles.some(role => !namedRoles.includes(role));
    if (!missing.length && conflict) { possible.push(point); conflicts.add(point.key); }
    else if (!missing.length) strict.push(point);
    else if (missing.every(word => tokens.some(token => closeWord(word, token)))) possible.push(point);
  }
  const alias = knowledge.points?.find(item => languageKey(item.query) === languageKey(query));
  const remembered = alias && eligible.find(point => identityMatches(point, alias.identity));
  if (remembered && strict.length === 1 && strict[0].key === remembered.key) return { matches: strict, approximate: false, learned: true };
  if (remembered && !conflicts.has(remembered.key) && !strict.length && (possible.length === 0 || (possible.length === 1 && possible[0].key === remembered.key))) {
    return { matches: [remembered], approximate: false, learned: true };
  }
  if (remembered) { strict.sort((a, b) => Number(b.key === remembered.key) - Number(a.key === remembered.key)); possible.sort((a, b) => Number(b.key === remembered.key) - Number(a.key === remembered.key)); }
  return strict.length ? { matches: strict, approximate: false } : { matches: possible, approximate: possible.length > 0,
    reason: possible.some(point => conflicts.has(point.key)) ? 'Name und Beschreibung passen bei mindestens einem Treffer nicht eindeutig zur angefragten Signalfunktion. Bitte bestätigen.' : '' };
}
export function matchingPoints(points, query) { return searchPoints(points, query).matches; }
export function parseCsv(text, sourceName = 'CSV-Import') {
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else field += ch;
    } else if (ch === '"' && field === '' && !closed) quoted = true;
    else if (ch === ';') { row.push(field); field = ''; closed = false; }
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = ''; closed = false;
    } else { if (closed) throw new Error('Ungültige CSV-Anführungszeichen.'); field += ch; }
  }
  if (quoted) throw new Error('CSV-Datei endet innerhalb eines Textfeldes.');
  row.push(field); if (row.some(Boolean)) rows.push(row);
  const header = rows.shift() || [];
  const required = ['Bus Name', 'Device Index', 'Device Name', 'I/O Name', 'Terminal', 'Test Result', 'Test Date', 'Test Comment', 'Description'];
  if (new Set(header).size !== header.length || required.some(key => !header.includes(key))) throw new Error('Die Datei ist kein vollständiger LOYTEC-I/O-Testexport.');
  const statuses = { 'Not Selected': 0, 'Auswählen': 0, 'Not Tested': 1, 'Nicht getestet': 1, 'OK': 2, 'NOT OK': 3, 'Not OK': 3, 'Nicht OK': 3 };
  const seen = new Set();
  return rows.map((values, index) => {
    if (values.length !== header.length) throw new Error(`CSV-Zeile ${index + 2}: falsche Spaltenanzahl.`);
    const item = Object.fromEntries(header.map((key, i) => [key, values[i]]));
    if (!Object.hasOwn(statuses, item['Test Result'])) throw new Error(`CSV-Zeile ${index + 2}: unbekanntes Prüfergebnis.`);
    if (!/^[1-9]\d*$/.test(item['Device Index']) || !item.Terminal || !item['Bus Name']) throw new Error(`CSV-Zeile ${index + 2}: Zuordnung fehlt.`);
    const key = JSON.stringify(['csv', sourceName, item['Bus Name'], item['Device Index'], item.Terminal]);
    if (seen.has(key)) throw new Error(`CSV-Zeile ${index + 2}: doppelte Klemme.`);
    seen.add(key);
    return { key, inst: item['Bus Name'], busName: item['Bus Name'], dev: Number(item['Device Index']) - 1,
      deviceName: item['Device Name'], terminal: item.Terminal, name: item['I/O Name'], description: item.Description,
      testState: statuses[item['Test Result']], testDate: item['Test Date'], testComment: item['Test Comment'],
      value: { text: '', unit: '' }, mode: '', hwType: '', online: false, receivedAt: null, source: 'csv' };
  });
}
