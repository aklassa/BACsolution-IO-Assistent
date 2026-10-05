// Login protocol observed in the supplied LOYTEC 8.4.20 base.js (LoginPage).
// This bridge never focuses/fills browser inputs and never changes controller settings.
// Credentials arrive as WKWebView structured arguments, never executable source text.
async function controllerLogin(request) {
  const fail = message => { throw new Error(message); };
  if (!request || !['inspect', 'authenticate'].includes(request.operation)) fail('Unbekannter Anmeldeauftrag.');
  if (!['http:', 'https:'].includes(location.protocol) || location.origin !== request.origin ||
      !['/webui/liob/iotest', '/webui/liob/iotest/', '/webui/login', '/'].includes(location.pathname)) {
    fail('Die Anmeldung gehört nicht zum gewählten Controller.');
  }
  if (document.getElementById('confirmWarnForm') || document.getElementById('passwdInitContainer')) {
    return { state: 'actionRequired' };
  }
  const form = document.getElementById('loginForm');
  const username = document.getElementById('username');
  const password = document.getElementById('password');
  const loginPage = form && username?.form === form && password?.form === form &&
    password.type === 'password' && form.method.toLowerCase() === 'post' &&
    typeof LoginPage === 'function';
  if (!loginPage) {
    if (typeof optBase !== 'undefined' && optBase.loggedIn === true) return { state: 'authenticated' };
    fail('Die Controller-Anmeldeseite wird nicht erkannt. Unterstützt wird LOYTEC Firmware 8.4.20.');
  }
  if (request.operation === 'inspect') return { state: 'login' };
  if (typeof request.username !== 'string' || !request.username.trim() ||
      typeof request.password !== 'string' || !request.password) fail('Benutzername und Passwort fehlen.');
  if (typeof g_csrf_token !== 'string' || !g_csrf_token) fail('Die Anmeldesitzung ist unvollständig. Controller erneut verbinden.');

  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 12000);
  try {
    const response = await fetch('/webui/login', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest', 'X-Create-Session': '1', 'X-Csrf-Token': g_csrf_token
      },
      body: new URLSearchParams({ username: request.username, password: request.password }).toString(),
      signal: abort.signal
    });
    if (!response.ok) fail(`Controller-Anmeldung fehlgeschlagen (HTTP ${response.status}).`);
    const text = await response.text();
    let result;
    try {
      if (text.length > 65536) fail('Zu große Antwort.');
      result = JSON.parse(text);
    } catch { fail('Keine gültige Antwort auf die Controller-Anmeldung.'); }
    if (!result || typeof result !== 'object') fail('Keine gültige Antwort auf die Controller-Anmeldung.');
    if (['0', 0, false].includes(result.loggedIn)) {
      const blocked = (Array.isArray(result.authFail) || typeof result.authFail === 'string') &&
        result.authFail.includes(request.username);
      fail(blocked ? 'Controller meldet zu viele Anmeldeversuche. Bitte später erneut verbinden.' :
        'Anmeldung abgewiesen. Benutzername und Passwort prüfen.');
    }
    if (!['1', 1, true].includes(result.loggedIn)) fail('Controller hat die Anmeldung nicht bestätigt.');
    // Do not silently acknowledge a default-password warning or change a password.
    return { state: Number(result.loginState) === 2 ? 'actionRequired' : 'authenticated' };
  } catch (error) {
    if (abort.signal.aborted) fail('Zeitüberschreitung bei der Anmeldung. Bei Bedarf erneut verbinden.');
    // Never return response bodies, credentials or URL parameters to the native UI.
    if (error instanceof TypeError) fail('Controller-Anmeldung konnte nicht übertragen werden. Verbindung prüfen.');
    throw error;
  } finally { clearTimeout(timeout); }
}

try { return JSON.stringify(await controllerLogin(request)); }
catch (error) { return JSON.stringify({state:'error', message:String(error.message || 'Controller-Anmeldung fehlgeschlagen.')}); }
