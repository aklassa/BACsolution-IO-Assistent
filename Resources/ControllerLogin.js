// LOYTEC 8.4.20 exposes the same session data in globals, inline JSON and
// hidden CSRFToken fields. Native WebKit must not require global visibility.
// This function reads literal data only. It never evaluates controller source,
// sends a request, changes the DOM, or returns secrets to the native UI.
function controllerPageContext(expectedOrigin) {
  if (!['http:', 'https:'].includes(location.protocol) || location.origin !== expectedOrigin) {
    return {error:'wrong-controller'};
  }
  const baseFields = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        typeof value.prodCode !== 'string' || !/^L(IOB|INX)-/.test(value.prodCode) ||
        typeof value.loggedIn !== 'boolean') return null;
    return {prodCode:value.prodCode, loggedIn:value.loggedIn,
      date:typeof value.date === 'string' ? value.date : '',
      role:typeof value.role === 'string' ? value.role : ''};
  };
  const validToken = value => typeof value === 'string' && value.length > 0 && value.length <= 4096 &&
    !/[\u0000-\u0020\u007f]/.test(value);
  const root = typeof window === 'object' ? window : globalThis;
  let base = baseFields(typeof optBase === 'undefined' ? root.optBase : optBase);
  let csrfToken = typeof g_csrf_token === 'undefined' ? root.g_csrf_token : g_csrf_token;
  if (!validToken(csrfToken)) csrfToken = '';
  let baseSource = base ? 'global' : 'missing';
  let csrfSource = csrfToken ? 'global' : 'missing';

  // Keep character positions but hide comments and quoted text from matching.
  // Thus a string or comment containing "optBase = ..." is never configuration.
  function codeMask(text) {
    const out = text.split('');
    let quote = '', lineComment = false, blockComment = false, escaped = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], next = text[i + 1];
      if (lineComment) {
        if (c === '\n' || c === '\r') lineComment = false;
        else out[i] = ' ';
      } else if (blockComment) {
        out[i] = c === '\n' || c === '\r' ? c : ' ';
        if (c === '*' && next === '/') { out[++i] = ' '; blockComment = false; }
      } else if (quote) {
        out[i] = c === '\n' || c === '\r' ? c : ' ';
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === quote) quote = '';
      } else if (c === '/' && next === '/') {
        out[i] = out[++i] = ' '; lineComment = true;
      } else if (c === '/' && next === '*') {
        out[i] = out[++i] = ' '; blockComment = true;
      } else if (c === '"' || c === "'" || c === '`') {
        out[i] = ' '; quote = c;
      }
    }
    return out.join('');
  }
  function literal(text, start) {
    while (/\s/.test(text[start] || '') && start < text.length) start++;
    if (text[start] !== '{' && text[start] !== '"') return null;
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') depth--;
      if (!quoted && depth === 0) {
        // Reject concatenation, property reads, calls and other expressions.
        if (!/^\s*;/.test(text.slice(i + 1))) return null;
        try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
      }
    }
    return null;
  }
  const bases = [], tokens = [];
  let inspectedBytes = 0;
  if (!base || !csrfToken) {
    for (const script of Array.from(document.scripts || []).slice(0, 80)) {
      if (script.src) continue;
      const text = script.textContent || '';
      if (text.length > 262144) continue;
      inspectedBytes += text.length;
      if (inspectedBytes > 1048576) break;
      const mask = codeMask(text);
      const declaration = /(?:^|[;\r\n])\s*(?:(?:var|let|const)\s+)?(optBase|g_csrf_token)\s*=/g;
      let match;
      while ((match = declaration.exec(mask))) {
        // The supplied firmware defines these at script top level. Do not
        // interpret function-local examples or conditional assignments.
        let depth = 0;
        for (let i = 0; i < match.index; i++) {
          if ('{[('.includes(mask[i])) depth++;
          else if ('}])'.includes(mask[i])) depth--;
        }
        if (depth !== 0) continue;
        const value = literal(text, declaration.lastIndex);
        if (match[1] === 'optBase') {
          const candidate = baseFields(value); if (candidate) bases.push(candidate);
        } else if (validToken(value)) tokens.push(value);
      }
    }
  }
  if (!base && bases.length) {
    if (new Set(bases.map(value => JSON.stringify(value))).size !== 1) return {error:'ambiguous-page-data'};
    base = bases[0]; baseSource = 'inline';
  }
  if (!csrfToken) {
    const loginForm = typeof document.getElementById === 'function' ? document.getElementById('loginForm') : null;
    const scope = loginForm || document;
    const fields = typeof scope.querySelectorAll === 'function' ? scope.querySelectorAll('input[type="hidden"][name="CSRFToken"]') : [];
    const fieldTokens = Array.from(fields).filter(field => !loginForm || field.form === loginForm)
      .map(field => field.value).filter(validToken);
    if (new Set([...fieldTokens, ...tokens]).size > 1) return {error:'ambiguous-page-data'};
    if (fieldTokens.length) { csrfToken = fieldTokens[0]; csrfSource = 'form'; }
    else if (tokens.length) { csrfToken = tokens[0]; csrfSource = 'inline'; }
  }

  const manager = typeof g_LBase === 'undefined' ? root.g_LBase : g_LBase;
  let canEdit = false;
  if (base?.loggedIn === true && /^\/webui\/liob\/iotest\/?$/.test(location.pathname)) {
    if (manager && typeof manager.editAllowedByRole === 'function') {
      // A live denial is authoritative, even if the metadata contains an edit role.
      canEdit = !!manager.editAllowedByRole();
    } else {
      // Exact default roles from supplied 8.4.20 LBase; LiobHost does not override
      // them. Unknown roles stay read-only. Server permissions still apply.
      canEdit = ['superadmin', 'admin', 'operator'].includes(base.role);
    }
  }
  return {base, csrfToken, canEdit, baseSource, csrfSource};
}

// Login protocol observed in the supplied LOYTEC 8.4.20 base.js (LoginPage).
// This bridge never focuses/fills browser inputs and never changes controller settings.
// Credentials arrive as WKWebView structured arguments, never executable source text.
async function controllerLogin(request, pageContext = null) {
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

try { return JSON.stringify(await controllerLogin(request, controllerPageContext(request.origin))); }
catch { return JSON.stringify({state:'error', code:'login-bridge-error', message:'Anmeldebrücke konnte nicht ausgeführt werden. Verbindungsdiagnose kopieren.'}); }
