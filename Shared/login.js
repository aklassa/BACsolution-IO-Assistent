// Login protocol observed in the supplied LOYTEC 8.4.20 base.js (LoginPage).
// This bridge never focuses/fills browser inputs and never changes controller settings.
// Credentials arrive as WKWebView structured arguments, never executable source text.
export async function controllerLogin(request, pageContext = null) {
  let diagnostics;
  const safeFailures = new WeakSet();
  const reply = (state, code, message) => ({ state, code, ...(message ? {message} : {}), ...(diagnostics ? {diagnostics} : {}) });
  const fail = (code, message) => { const error = new Error(message); error.loginCode = code; safeFailures.add(error); throw error; };
  try {
    if (!request || !['inspect', 'authenticate'].includes(request.operation)) fail('invalid-operation', 'Unbekannter Anmeldeauftrag.');
    if (!['http:', 'https:'].includes(location.protocol) || location.origin !== request.origin ||
        !['/webui/liob/iotest', '/webui/liob/iotest/', '/webui/login', '/'].includes(location.pathname)) {
      fail('wrong-controller', 'Die Anmeldung gehört nicht zum gewählten Controller.');
    }
    if (pageContext?.error) fail('controller-page-data-ambiguous', 'Die Controller-Seite enthält keine eindeutig zugeordneten Sitzungsdaten. Erneut verbinden.');
    const form = document.getElementById('loginForm');
    const username = document.getElementById('username');
    const password = document.getElementById('password');
    const loginContainer = !!document.getElementById('loginContainer');
    const passwordAction = !!(document.getElementById('confirmWarnForm') || document.getElementById('passwdInitContainer'));
    const base = pageContext?.base ?? (typeof optBase === 'object' && optBase !== null ? optBase : {});
    const controllerBrand = typeof base.prodCode === 'string' && /^L(IOB|INX)-/.test(base.prodCode);
    const loginClass = typeof LoginPage === 'function';
    const csrfToken = pageContext?.csrfToken ?? (typeof g_csrf_token === 'string' ? g_csrf_token : '');
    const csrf = !!csrfToken;
    const inputsLinked = !!form && !!username && !!password && username.form === form && password.form === form;
    // A named form control can shadow form.method; read the attribute on real DOM nodes.
    const method = typeof form?.getAttribute === 'function' ? form.getAttribute('method') : form?.method;
    const postForm = typeof method === 'string' && method.toLowerCase() === 'post';
    const passwordInput = password?.type === 'password';
    const transportHook = typeof __bacIOTransportDiagnostics === 'object' && __bacIOTransportDiagnostics !== null;
    const transport = transportHook ? __bacIOTransportDiagnostics : {};
    const count = n => Number.isInteger(n) && n >= 0 ? Math.min(n, 999) : 0;
    const sourceKind = value => ['none', 'page', 'prototype', 'base', 'liob', 'liob_host', 'other'].includes(value) ? value : 'other';
    // Presence flags only: never include field values, page text, URLs, tokens or exception messages.
    diagnostics = {
      readyState: ['loading', 'interactive', 'complete'].includes(document.readyState) ? document.readyState : 'unknown',
      flags: { form: !!form, username: !!username, password: !!password, inputsLinked, passwordInput,
        postForm, loginContainer, loginClass, controllerBrand, authenticated: base.loggedIn === true, csrf, passwordAction,
        baseFromHTML: pageContext?.baseSource === 'inline', csrfFromHTML: ['inline', 'form'].includes(pageContext?.csrfSource), transportHook },
      scriptErrors: count(transport.scriptErrors), resourceErrors: count(transport.resourceErrors),
      firstScriptError: ['none', 'SyntaxError', 'TypeError', 'ReferenceError', 'RangeError', 'unhandled-promise', 'other'].includes(transport.firstScriptError) ? transport.firstScriptError : 'none',
      firstScriptSource: sourceKind(transport.firstScriptSource), firstResourceSource: sourceKind(transport.firstResourceSource)
    };
    if (passwordAction) return reply('actionRequired', 'controller-action-required');
    // The recognized LOYTEC form is sufficient when controller metadata and CSRF
    // identify it. A missing legacy LoginPage constructor alone must not block it.
    const knownController = loginClass || (controllerBrand && loginContainer && csrf && base.loggedIn === false);
    const loginPage = inputsLinked && passwordInput && postForm && knownController;
    if (!loginPage) {
      if (!form && controllerBrand && base.loggedIn === true) return reply('authenticated', 'already-authenticated');
      // didFinish is not a guarantee that asynchronous page setup has created the
      // form. Native code may repeat this READ-ONLY check for at most three seconds.
      if (request.operation === 'inspect' && !form && !username && !password) return reply('pending', 'page-not-ready');
      fail('login-form-unrecognized', 'Die Controller-Anmeldeseite wird nicht erkannt. Die Verbindungsdiagnose enthält die fehlenden Seitenmerkmale.');
    }
    if (request.operation === 'inspect') return reply('login', 'login-form-ready');
    if (typeof request.username !== 'string' || !request.username.trim() ||
        typeof request.password !== 'string' || !request.password) fail('credentials-missing', 'Benutzername und Passwort fehlen.');
    if (!csrf) fail('csrf-missing', 'Die Anmeldesitzung ist unvollständig. Controller erneut verbinden.');

    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 12000);
    try {
      const response = await fetch('/webui/login', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest', 'X-Create-Session': '1', 'X-Csrf-Token': csrfToken
        },
        body: new URLSearchParams({ username: request.username, password: request.password }).toString(),
        signal: abort.signal
      });
      if (!response.ok) fail('login-http-error', `Controller-Anmeldung fehlgeschlagen (HTTP ${Number.isInteger(response.status) ? response.status : 0}).`);
      const text = await response.text();
      let result;
      try {
        if (text.length > 65536) fail('invalid-login-response', 'Zu große Antwort.');
        result = JSON.parse(text);
      } catch { fail('invalid-login-response', 'Keine gültige Antwort auf die Controller-Anmeldung.'); }
      if (!result || typeof result !== 'object') fail('invalid-login-response', 'Keine gültige Antwort auf die Controller-Anmeldung.');
      if (['0', 0, false].includes(result.loggedIn)) {
        const blocked = (Array.isArray(result.authFail) || typeof result.authFail === 'string') &&
          result.authFail.includes(request.username);
        fail(blocked ? 'login-throttled' : 'login-rejected', blocked ? 'Controller meldet zu viele Anmeldeversuche. Bitte später erneut verbinden.' :
          'Anmeldung abgewiesen. Benutzername und Passwort prüfen.');
      }
      if (!['1', 1, true].includes(result.loggedIn)) fail('login-unconfirmed', 'Controller hat die Anmeldung nicht bestätigt.');
      // Do not silently acknowledge a default-password warning or change a password.
      return Number(result.loginState) === 2 ? reply('actionRequired', 'controller-action-required') : reply('authenticated', 'login-confirmed');
    } catch (error) {
      if (abort.signal.aborted) fail('login-timeout', 'Zeitüberschreitung bei der Anmeldung. Bei Bedarf erneut verbinden.');
      // Never return response bodies, credentials or URL parameters to the native UI.
      if (error instanceof TypeError) fail('login-transport-error', 'Controller-Anmeldung konnte nicht übertragen werden. Verbindung prüfen.');
      throw error;
    } finally { clearTimeout(timeout); }
  } catch (error) {
    if (safeFailures.has(error)) return reply('error', error.loginCode, error.message);
    // A page/library exception can contain credentials or other page content.
    return reply('error', 'login-script-error', 'Die Anmeldeprüfung konnte nicht ausgeführt werden. Verbindungsdiagnose kopieren.');
  }
}
