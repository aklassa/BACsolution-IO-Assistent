import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { WorkspaceStore, APIError } from './store.mjs';

export function createServer(store, token) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('BAC_IO_SYNC_TOKEN mit mindestens 32 Zeichen setzen.');
  return http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (code, data) => { res.writeHead(code); res.end(JSON.stringify(data)); };
    try {
      const supplied = Buffer.from(req.headers.authorization || ''), expected = Buffer.from(`Bearer ${token}`);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new APIError(401, 'Anmeldung erforderlich.');
      if (req.headers['x-bacsolution-schema'] !== '1') throw new APIError(400, 'Protokollversion fehlt.');
      if (req.method === 'GET' && req.url === '/v1/state') { reply(200, store.snapshot()); return; }
      if (req.method !== 'POST' || !['/v1/documents', '/v1/results'].includes(req.url)) throw new APIError(404, 'Endpunkt unbekannt.');
      if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new APIError(415, 'JSON erforderlich.');
      const chunks = []; let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 2_000_000) throw new APIError(413, 'Anfrage zu groß.');
        chunks.push(chunk);
      }
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new APIError(400, 'Ungültiges JSON.'); }
      reply(200, req.url === '/v1/documents' ? await store.writeDocument(body) : await store.writeResult(body));
    } catch (e) {
      reply(e instanceof APIError ? e.status : 500, { error: e instanceof APIError ? e.message : 'Speichern fehlgeschlagen.', ...(e.extra || {}) });
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const file = path.resolve(process.env.BAC_IO_DATA_FILE || './var/workspace.json');
  const store = await WorkspaceStore.open(file);
  const server = createServer(store, process.env.BAC_IO_SYNC_TOKEN);
  server.requestTimeout = 15_000; server.headersTimeout = 10_000;
  const port = Number(process.env.BAC_IO_PORT || 8787);
  // TLS/auth gateway goes in front. No public listener or deployment in this package.
  server.listen(port, '127.0.0.1', () => console.log(`Lokaler Abgleichdienst auf 127.0.0.1:${port}`));
}
