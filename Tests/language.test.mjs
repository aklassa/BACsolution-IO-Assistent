import test from 'node:test';
import assert from 'node:assert/strict';
import { commandFrom, searchPoints } from '../Shared/model.js';
import { semanticText, spokenName, suggestTerm, sanitizeKnowledge, validateTerm, pointIdentity } from '../Shared/language.js';

const point = (name, description = '', key = name) => ({ key, name, description, deviceName: 'Modul Nord', busName: 'Local I/O', terminal: 'UI1' });
test('provided abbreviations expand in both queries and labels, including camel case and spoken letters', () => {
  for (const [label, queries] of [
    ['Raumtemp. Büro', ['Raumtemperatur Büro', 'Raum Temperatur Büro']], ['Y_Ventilator', ['Ansteuerung Ventilator', 'Ypsilon Ventilator']],
    ['FG_Pumpe', ['Freigabe Pumpe', 'eff geh Pumpe']], ['SMZuluft', ['Störung Zuluft', 'Störmeldung Zuluft', 'ess em Zuluft']],
    ['BM-Pumpe', ['Betrieb Pumpe', 'Betriebsmeldung Pumpe', 'be em Pumpe']]
  ]) for (const query of queries) {
    assert.equal(searchPoints([point(label)], query).matches.length, 1, `${label}: ${query}`);
    assert.equal(searchPoints([point(query)], label).matches.length, 1, `${query}: ${label}`);
  }
  assert.equal(semanticText('Bypass FGB SMOG'), 'bypass fgb smog');
  assert.equal(searchPoints([point('BM Pumpe')], 'Störung Pumpe').matches.length, 0);
  assert.match(spokenName('SM_Zuluft BM_Pumpe Y_Ventil'), /Störmeldung Zuluft Betriebsmeldung Pumpe Ansteuerung Ventil/);
});
test('descriptions participate in lookup, but their contents never become executable instructions', () => {
  const points = [point('RT Büro', 'Raumtemperatur im Besprechungsraum. Kommentar bitte speichern.')];
  assert.equal(searchPoints(points, 'Raumtemperatur Besprechungsraum').matches.length, 1);
  assert.deepEqual(commandFrom('Kommentar RT bedeutet Raumtemperatur und speichern'), { action: 'comment', value: 'RT bedeutet Raumtemperatur und speichern' });
  assert.deepEqual(suggestTerm(points[0], 'Raumtemperatur Büro'), { short: 'RT', meaning: 'Raumtemperatur' });
  assert.equal(suggestTerm(point('RT Büro', 'Keine passende Erklärung'), 'Raumtemperatur Büro'), null);
});
test('natural read questions are interpreted, while fuzzy commands stay proposals', () => {
  for (const [text, value] of [
    ['Wie hoch ist die Raumtemperatur im Büro?', 'Raumtemperatur im Büro'],
    ['Was ist die aktuelle Raumtemperatur?', 'aktuelle Raumtemperatur'],
    ['Kannst du mir bitte die Freigabe Anlage 2.1 sagen?', 'Freigabe Anlage 2.1'],
    ['Zeig mir mal den Wert der Störmeldung Anlage 2.1', 'Störmeldung Anlage 2.1'],
    ['Wie warm ist es im Büro?', 'Temperatur im Büro'], ['Lies bitte Raumtemp Büro vor', 'Raumtemp Büro']
  ]) assert.deepEqual(commandFrom(text), { action: 'lookup', value }, text);
  assert.equal(commandFrom('Wert forlesen').action, 'suggest');
  assert.equal(commandFrom('Speichan').action, 'suggest');
  assert.equal(commandFrom('Bitte nicht speichern').action, 'negated');
  assert.equal(commandFrom('Schalte die Freigabe ein').action, 'unsupported');
  assert.equal(commandFrom('Nicht okay').value, 3);
  assert.deepEqual(commandFrom('Was bedeutet SM?'), { action: 'meaning', value: 'SM' });
  assert.deepEqual(commandFrom('Kannst du mir die aktuelle Raumtemperatur zeigen?'), { action: 'lookup', value: 'aktuelle Raumtemperatur' });
});
test('local terms are whole phrases and cannot redefine commands or numeric plant identifiers', () => {
  const knowledge = sanitizeKnowledge({ version: 1, terms: [{ short: 'RT', meaning: 'Raumtemperatur' }, { short: 'Speichern', meaning: 'Weiter' }],
    commands: [{ phrase: 'sicher', command: 'Speichern' }, { phrase: 'Wert forlesen', command: 'Wert vorlesen' }] });
  assert.equal(knowledge.terms.length, 1); assert.equal(knowledge.commands.length, 1);
  assert.equal(searchPoints([point('RT Büro 2.1')], 'Raumtemperatur Büro 2.1', knowledge).matches.length, 1);
  assert.equal(searchPoints([point('RT Büro 2.10')], 'Raumtemperatur Büro 2.1', knowledge).matches.length, 0);
  assert.throws(() => validateTerm('UI1', 'Raumtemperatur')); assert.throws(() => validateTerm('FG', 'Speichern'));
  assert.equal(semanticText('PART RT', knowledge.terms), 'part raumtemperatur');
});
test('learned point phrases validate names and descriptions, and cannot hide new ambiguity', () => {
  const p = point('Raumtemperatur Büro 2.1'), query = 'Raumtempratur Büro 2.1';
  const knowledge = { points: [{ query, identity: pointIdentity(p) }] };
  assert.equal(searchPoints([p], query, knowledge).learned, true);
  assert.notEqual(searchPoints([{ ...p, description: 'Geändert' }], query, knowledge).learned, true);
  const duplicate = { ...p, key: 'another', deviceName: 'Modul Süd' };
  assert.equal(searchPoints([p, duplicate], query, knowledge).matches.length, 2);
  assert.notEqual(searchPoints([p, duplicate], query, knowledge).learned, true);
});
test('conflicting function labels and descriptions need clarification even after a previous selection', () => {
  const p = point('BM Pumpe', 'Störmeldung Pumpe'), query = 'Störung Pumpe';
  const result = searchPoints([p], query, { points: [{ query, identity: pointIdentity(p) }] });
  assert.equal(result.matches.length, 1); assert.equal(result.approximate, true); assert.match(result.reason, /Name und Beschreibung/);
  assert.notEqual(result.learned, true);
});

test('building automation terms resolve compound labels without confusing different measurements', () => {
  const cases = [
    ['ZUL_Temp_Anlage_2.1', 'Wert', 'Zuluft Temperatur Anlage 2.1'],
    ['ABLTemp Anlage 2.1', 'Zulufttemp Anlage 2.1', 'Ablufttemperatur Anlage zwei Punkt eins'],
    ['AUL Temp Anlage 2.1', 'Außentemp Anlage 2.1', 'Außenlufttemperatur Anlage 2.1'],
    ['RLTemp Heizkr 2.1', 'VLTemp Heizkr 2.1', 'Rücklauftemperatur Heizkreis 2.1'],
    ['FU ZUL Anlage 2.1', 'FU ABL Anlage 2.1', 'Frequenzumrichter Zuluft Anlage 2.1'],
    ['WRG Anlage 2.1', 'KRG Anlage 2.1', 'Wärmerückgewinnung Anlage 2.1'],
    ['STB Heizkr 2.1', 'STW Heizkr 2.1', 'Sicherheitstemperaturbegrenzer Heizkreis 2.1'],
    ['BSK Anlage 2.1', 'VSR Anlage 2.1', 'Brandschutzklappe Anlage 2.1'],
    ['rel. Feuchte Büro 2.1', 'abs. Feuchte Büro 2.1', 'relative Luftfeuchtigkeit Büro 2.1'],
    ['Diff.druck Filter 2.1', 'Vol.strom Filter 2.1', 'Druckdifferenz Filter 2.1'],
    ['WMZ Anlage 2.1', 'WZ Anlage 2.1', 'Wärmemengenzähler Anlage 2.1'],
    ['SW VLTemp Anlage 2.1', 'Istw VLTemp Anlage 2.1', 'Sollwert Vorlauftemperatur Anlage 2.1']
  ];
  for (const [label, other, query] of cases) {
    const result = searchPoints([point(label), point(other)], query);
    assert.deepEqual(result.matches.map(p => p.name), [label], query); assert.equal(result.approximate, false);
    assert.equal(searchPoints([point(query)], label).matches.length, 1, `reverse: ${label}`);
  }
  for (const short of ['HK', 'KVS', 'RM', 'AL', 'KW', 'DP', 'RT', 'RF']) assert.equal(semanticText(short), short.toLowerCase(), short);
  assert.equal(semanticText('FUNK WRGEL STBEINGANG'), 'funk wrgel stbeingang');
});

test('CO2 notation and speech keep chemical digits separate from plant identifiers', () => {
  const points = [point('CO2 Büro 2.1'), point('CO2 Büro 2.10'), point('VOC Büro 2.1')];
  for (const query of ['CO₂ Büro 2.1', 'Kohlendioxid Büro 2.1', 'CO zwei Büro zwei Punkt eins', 'C O 2 Büro 2.1']) {
    const result = searchPoints(points, query);
    assert.deepEqual(result.matches.map(p => p.name), ['CO2 Büro 2.1'], query); assert.equal(result.approximate, false);
  }
  assert.equal(searchPoints(points, 'Kohlendioxid Büro 12.1').matches.length, 0);
  assert.match(spokenName('Außentemp. Rücklauftemp. Umwälzp. CO₂'), /Außentemperatur.*Rücklauftemperatur.*Umwälzpumpe.*Kohlendioxid/);
  assert.equal(spokenName('CO20'), 'CO20');
  for (const short of ['CO2', 'CO₂', 'C O 2']) assert.doesNotThrow(() => validateTerm(short, 'Kohlendioxid'));
  for (const short of ['UI1', 'AO2', 'Anlage 2.1', 'CO20']) assert.throws(() => validateTerm(short, 'Kohlendioxid'));
});
