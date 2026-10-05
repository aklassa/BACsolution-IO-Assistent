// Self-contained: Chrome copies this function into the authenticated page.
// Protocol observed in the user's LIOB-589 Web UI, firmware 8.4.20.
// Only testState / testComment writes are implemented. Never accept arbitrary URLs,
// semantic IDs, actuator values, operating modes, reset or clear parameters.
export async function controllerTask(request, pageContext = null) {
  const fail = (message) => { throw new Error(message); };
  if (!request || !['info', 'read', 'write'].includes(request.operation)) fail('Unbekannter Auftrag.');
  if (!['https:', 'http:'].includes(location.protocol) || location.origin !== request.origin ||
      !/^\/webui\/liob\/iotest\/?$/.test(location.pathname)) fail('Der zugeordnete LOYTEC-I/O-Testtab ist nicht mehr geöffnet.');
  if (pageContext?.error) fail('Sitzungsdaten der Controller-Seite sind nicht eindeutig. Erneut verbinden.');
  const base = pageContext?.base ?? (typeof optBase === 'undefined' ? null : optBase);
  const csrfToken = pageContext?.csrfToken ?? (typeof g_csrf_token === 'string' ? g_csrf_token : '');
  if (!base || base.loggedIn !== true || !/^L(IOB|INX)-/.test(String(base.prodCode))) {
    fail('Bitte am LOYTEC-Controller anmelden und die I/O-Testseite neu öffnen.');
  }
  if (!csrfToken) fail('Aktuelle Anmeldung fehlt. I/O-Testseite neu laden.');

  function pageOptions() {
    for (const script of document.scripts) {
      const text = script.textContent || '';
      const start = text.indexOf('var opt = ');
      const delimiter = start >= 0 ? /;\s*opt\.ioTest\s*=/.exec(text.slice(start)) : null;
      const finish = delimiter ? start + delimiter.index : -1;
      if (start >= 0 && finish > start) {
        try { return JSON.parse(text.slice(start + 10, finish)); } catch { /* fail below */ }
      }
    }
    fail('Seitenformat unbekannt. Dieser Prototyp erwartet die I/O-Testseite der Firmware 8.4.20.');
  }
  const opt = pageOptions();
  if (opt.err || opt.errInst || opt.showResetPage) fail('Die I/O-Testseite meldet einen Geräte- oder Konfigurationsfehler.');
  if (!Array.isArray(opt.tabs) || !opt.tabs.length) fail('Keine I/O-Busse in der Seite gefunden.');
  const buses = opt.tabs.map(([id, name]) => ({ id, name }));
  if (buses.some(b => !Number.isInteger(b.id) || b.id < 0 || typeof b.name !== 'string')) fail('Ungültige Buszuordnung.');
  const info = { origin: location.origin, product: base.prodCode, buses,
    pageTime: base.date, canEdit: pageContext?.canEdit ?? (typeof g_LBase !== 'undefined' && typeof g_LBase.editAllowedByRole === 'function' && !!g_LBase.editAllowedByRole()) };
  if (request.operation === 'info') return info;
  const bus = buses.find(b => b.id === request.inst);
  if (!bus) fail('Unbekannter Bus.');

  // Full value tuples; flags are defined by LiobDefines in the supplied source.
  const fullFlags = 1 | 2 | 4 | 8 | 16 | 32 | 128 | 256 | 512 | 1024 | 2048 | 8192 | 16384;
  const shortFlags = (fullFlags & ~16384) | 4096;
  function unpack(packed) {
    if (!Array.isArray(packed)) fail('Unbekanntes I/O-Datenformat.');
    const count = packed[0];
    if (!Number.isInteger(count) || count < 1 || count > 64 || (packed.length - count - 1) % count) fail('Unvollständige I/O-Daten.');
    const keys = packed.slice(1, count + 1);
    if (keys.some(k => typeof k !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(k)) || new Set(keys).size !== count) fail('Ungültige I/O-Felder.');
    const rows = [];
    for (let index = count + 1; index < packed.length; index += count) {
      const row = Object.create(null);
      keys.forEach((key, offset) => { row[key] = packed[index + offset]; });
      rows.push(row);
    }
    return rows;
  }
  function tuple(value) {
    if (!Array.isArray(value) || value.length < 3) fail('Wertformat unvollständig.');
    return { text: String(value[0] ?? ''), unit: String(value[1] ?? '') };
  }
  function decode(data) {
    if (!data || data.err || data.errInst || data.error || data.portDsbld || !Array.isArray(data.devs)) fail('I/O-Daten konnten nicht vollständig gelesen werden.');
    const points = [], seen = new Set();
    for (const dev of data.devs) {
      if (!Number.isInteger(dev.idx) || dev.idx < 0) fail('Geräteindex fehlt.');
      for (const io of unpack(dev.ios)) {
        if (!Number.isInteger(io.objIdx) || io.objIdx < 0 || !Number.isInteger(io.type) || io.type < 0 ||
            typeof io.term !== 'string' || !io.term || typeof io.ioName !== 'string' ||
            ![0, 1, 2, 3].includes(io.testState) || typeof io.testDate !== 'string' || typeof io.testComment !== 'string') fail('Unvollständiger Prüfpunkt.');
        const key = JSON.stringify([location.origin, bus.id, dev.idx, io.type, io.objIdx]);
        if (seen.has(key)) fail('Doppelte I/O-Zuordnung.');
        seen.add(key);
        const isLocal = bus.id === 0;
        // For expansion devices absent/offline status must never be treated as a fresh field reading.
        const flags = dev.flagsErr;
        const online = isLocal || (Number.isInteger(flags) && !!(flags & 65536) && !!(flags & 131072) && !!(flags & 2147483648));
        points.push({ key, inst: bus.id, busName: bus.name, dev: dev.idx, deviceName: String(dev.name ?? ''),
          objType: io.type, objIdx: io.objIdx, terminal: io.term, name: io.ioName, description: String(io.dscr ?? ''),
          hwType: String(io.hwType ?? ''), path: String(io.dpPath ?? ''), value: tuple(io.value), mode: tuple(io.opmode).text,
          testState: io.testState, testDate: io.testDate, testComment: io.testComment, online,
          receivedAt: new Date().toISOString(), source: 'controller' });
      }
    }
    return points;
  }
  async function post(path, parameters) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(path, { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Csrf-Token': csrfToken, 'X-Requested-With': 'XMLHttpRequest' },
        body: new URLSearchParams(parameters).toString(), signal: controller.signal });
      if (!response.ok) fail(`Controller antwortet mit HTTP ${response.status}. Anmeldung und Verbindung prüfen.`);
      let data;
      try { data = JSON.parse(await response.text()); } catch { fail('Keine gültige Datenantwort. Anmeldung oder Firmware prüfen.'); }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') fail('Zeitüberschreitung. Bei einem Speicherauftrag ist das Ergebnis unbestätigt; zuerst neu lesen.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function read() { return decode(await post('/webui/liob/overview/action', { inst: bus.id, colFlags: fullFlags })); }
  if (request.operation === 'read') return { ...info, points: await read() };

  if (!info.canEdit) fail('Die aktuelle LOYTEC-Anmeldung erlaubt keine Änderungen.');
  const { target, expected, change } = request;
  if (!target || !expected || !change || !['testState', 'testComment'].includes(change.prop) ||
      Object.keys(change).some(k => !['prop', 'value'].includes(k))) fail('Nur Testergebnis und Testkommentar dürfen geschrieben werden.');
  if (change.prop === 'testState' && ![1, 2, 3].includes(change.value)) fail('Ungültiges Prüfergebnis.');
  if (change.prop === 'testComment' && (typeof change.value !== 'string' || change.value.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(change.value))) fail('Kommentar ungültig oder länger als 2000 Zeichen.');
  if (!Number.isInteger(target.dev) || target.dev < 0 || !Number.isInteger(target.objType) || target.objType < 0 ||
      !Number.isInteger(target.objIdx) || target.objIdx < 0 || typeof target.terminal !== 'string') fail('Prüfpunkt nicht eindeutig.');
  const before = (await read()).find(p => p.dev === target.dev && p.objType === target.objType && p.objIdx === target.objIdx);
  if (!before || before.terminal !== target.terminal || before.name !== expected.name) fail('Prüfpunkt wurde umbenannt oder geändert. Liste neu laden.');
  if (!before.online) fail('Das I/O-Gerät ist offline oder sein Verbindungszustand ist unbekannt.');
  if (['testState', 'testDate', 'testComment'].some(key => before[key] !== expected[key])) fail('Prüfdaten wurden zwischenzeitlich geändert. Entwurf prüfen und aktuelle Daten übernehmen.');
  const answer = await post('/webui/liob/liob_io_value_save', { value: change.value, colFlags: shortFlags, inst: bus.id,
    dev: before.dev, obj_type: before.objType, obj_idx: before.objIdx, sem_id: 0, prop: change.prop });
  if (!answer || answer.saveErr !== 0) fail(`Speichern nicht bestätigt (Gerätecode ${answer?.saveErr ?? 'unbekannt'}). Zuerst neu lesen.`);
  const after = (await read()).find(p => p.key === before.key);
  if (!after || after.terminal !== before.terminal || after.name !== before.name || !after.online || after[change.prop] !== change.value) fail('Der gespeicherte Wert wurde beim Zurücklesen nicht bestätigt. Zuerst neu lesen.');
  if (change.prop === 'testState' && !after.testDate) fail('Testergebnis gelesen, aber kein Testdatum bestätigt.');
  return { point: after, verified: true, prop: change.prop };
}
