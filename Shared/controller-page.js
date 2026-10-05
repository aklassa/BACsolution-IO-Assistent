// LOYTEC 8.4.20 exposes the same session data in globals, inline JSON and
// hidden CSRFToken fields. Native WebKit must not require global visibility.
// This function reads literal data only. It never evaluates controller source,
// sends a request, changes the DOM, or returns secrets to the native UI.
export function controllerPageContext(expectedOrigin) {
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
