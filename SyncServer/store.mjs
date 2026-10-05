import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseVocabularyFile } from '../Shared/vocabulary.js';

export class APIError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
const assert = (ok, message) => { if (!ok) throw new APIError(400, message); };
const identifier = s => typeof s === 'string' && /^[a-zA-Z0-9:_-]{1,120}$/.test(s);
const text = (s, max = 2000) => typeof s === 'string' && s.length <= max;
const canonical = value => JSON.stringify(value, function (key, v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v;
});
export function validateDocument(m) {
  assert(m && identifier(m.id) && identifier(m.documentID), 'Änderungs-ID fehlt.');
  assert(Number.isSafeInteger(m.baseRevision) && m.baseRevision >= 0, 'Änderungsstand fehlt.');
  assert(text(m.payload, 1_000_000), 'Dokument zu groß.');
  let data; try { data = JSON.parse(m.payload); } catch { throw new APIError(400, 'Dokument ist kein JSON.'); }
  if (m.kind === 'vocabulary') {
    assert(m.documentID === 'vocabulary:global', 'Begriffs-ID ungültig.');
    try { parseVocabularyFile(m.payload); } catch (e) { throw new APIError(400, e.message); }
  } else if (m.kind === 'project') {
    assert(data && identifier(data.id) && m.documentID === `project:${data.id}` && text(data.name, 200) && data.name.trim(), 'Projekt ungültig.');
    assert(Array.isArray(data.stations) && data.stations.length <= 200, 'Stationsliste ungültig.');
    assert(new Set(data.stations.map(s => s.id)).size === data.stations.length, 'Doppelte Station.');
    for (const s of data.stations) {
      assert(identifier(s.id) && text(s.name, 200) && s.name.trim() && text(s.identity, 200) && s.identity.trim() && text(s.configuration, 100), 'Stationszuordnung fehlt.');
      let u; try { u = new URL(s.origin); } catch { throw new APIError(400, 'Controller-Adresse ungültig.'); }
      assert(['http:', 'https:'].includes(u.protocol) && !u.username && !u.password && !u.search && !u.hash && u.pathname === '/', 'Controller-Adresse enthält Zugangsdaten oder Pfad.');
    }
  } else throw new APIError(400, 'Dokumentart unbekannt.');
  return { id: m.id, documentID: m.documentID, kind: m.kind, baseRevision: m.baseRevision, payload: m.payload };
}
export function validateResult(event) {
  assert(event && ['id', 'projectID', 'stationID', 'deviceID'].every(k => identifier(event[k])), 'Prüfzuordnung fehlt.');
  assert(['stationIdentity', 'configuration', 'technician', 'recordedAt'].every(k => text(event[k], 200)), 'Prüfmetadaten fehlen.');
  assert(event.stationIdentity.trim() && event.technician.trim(), 'Station oder Prüfer fehlt.');
  assert(event.controllerState === 'verified' && ['testState', 'testComment'].includes(event.prop), 'Nur bestätigte Prüfeinträge.');
  assert(event.serverStoredAt == null, 'Serverdatum wird vom Server vergeben.');
  const p = event.point;
  assert(p && ['inst', 'dev', 'objType', 'objIdx'].every(k => Number.isSafeInteger(p[k]) && p[k] >= 0), 'Punktadresse ungültig.');
  assert(['key', 'busName', 'deviceName', 'terminal', 'name', 'description', 'hwType', 'path', 'mode', 'testDate', 'testComment', 'receivedAt'].every(k => text(p[k])), 'Punktdaten unvollständig.');
  assert(p.terminal && [0,1,2,3].includes(p.testState) && p.online === true && p.source === 'controller', 'Keine bestätigte Controller-Lesung.');
  assert(p.value && text(p.value.text) && text(p.value.unit, 100), 'Messwert fehlt.');
  assert(event.prop !== 'testState' || (p.testState > 0 && p.testDate), 'Controller-Testdatum fehlt.');
  const copy = structuredClone(event); delete copy.serverStoredAt;
  return copy;
}

export class WorkspaceStore {
  constructor(file, data) { this.file = file; this.data = data; this.queue = Promise.resolve(); }
  static async open(file) {
    let data;
    try { data = JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (e) {
      if (e.code !== 'ENOENT') throw e; // Never replace unreadable state.
      data = { schema: 1, workspaceID: randomUUID(), documents: [], results: [], receipts: [] };
    }
    if (data.schema !== 1 || !identifier(data.workspaceID) || !['documents','results','receipts'].every(k => Array.isArray(data[k]))) throw new Error('Speicherformat ungültig.');
    const store = new WorkspaceStore(file, data);
    await store.persist(data);
    return store;
  }
  async persist(next) {
    await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.tmp-${randomUUID()}`;
    const handle = await fs.open(temporary, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(next)); await handle.sync(); }
    finally { await handle.close(); }
    await fs.rename(temporary, this.file);
  }
  transaction(fn) {
    const job = this.queue.then(async () => {
      const next = structuredClone(this.data), result = fn(next);
      await this.persist(next); this.data = next; return structuredClone(result);
    });
    this.queue = job.catch(() => {});
    return job;
  }
  snapshot() { const {workspaceID, documents, results} = this.data; return structuredClone({workspaceID, documents, results}); }
  writeDocument(input) {
    const m = validateDocument(input);
    return this.transaction(db => {
      const receipt = db.receipts.find(r => r.id === m.id);
      if (receipt) {
        if (canonical(receipt.request) !== canonical(m)) throw new APIError(422, 'Änderungs-ID wurde für andere Daten wiederverwendet.');
        return receipt.response;
      }
      const current = db.documents.find(d => d.id === m.documentID);
      if ((current?.revision ?? 0) !== m.baseRevision) {
        if (!current) throw new APIError(422, 'Dokument fehlt für diesen Änderungsstand.');
        throw new APIError(409, 'Zwischenzeitlich geändert.', { current });
      }
      if (current && current.kind !== m.kind) throw new APIError(400, 'Dokumentart geändert.');
      const response = { id: m.documentID, kind: m.kind, revision: m.baseRevision + 1, payload: m.payload };
      db.documents = db.documents.filter(d => d.id !== m.documentID).concat(response);
      db.receipts.push({ id: m.id, request: m, response });
      return response;
    });
  }
  writeResult(input) {
    const event = validateResult(input);
    return this.transaction(db => {
      const current = db.results.find(e => e.id === event.id);
      if (current) {
        const { serverStoredAt, ...before } = current;
        if (canonical(before) !== canonical(event)) throw new APIError(409, 'Prüfeintrag mit dieser ID enthält andere Daten.');
        return current;
      }
      const projectID = `project:${event.projectID}`;
      const versions = db.documents.filter(d => d.id === projectID).concat(db.receipts.filter(r => r.response.id === projectID).map(r => r.response));
      const knownAssignment = versions.some(d => JSON.parse(d.payload).stations.some(s => s.id === event.stationID && s.identity === event.stationIdentity && s.configuration === event.configuration));
      assert(knownAssignment, 'Station oder Konfiguration passt nicht zum Projekt oder dessen Historie.');
      const stored = { ...event, serverStoredAt: new Date().toISOString() };
      db.results.push(stored); return stored;
    });
  }
}
