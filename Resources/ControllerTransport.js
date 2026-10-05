// Injected at document start, only in the noninteractive native transport.
// LOYTEC's legacy login invokes focus()/select(). Never let those calls open
// WebKit's keyboard while credentials are entered in the native SwiftUI form.
(() => {
  // Count page failures before LOYTEC scripts run. Deliberately retain no
  // messages, raw filenames, response text or tokens from the controller page.
  const diagnostics = { scriptErrors: 0, resourceErrors: 0, firstScriptError: 'none', firstScriptSource: 'none', firstResourceSource: 'none' };
  const sourceKind = source => {
    if (!source || source === location.href) return 'page';
    try {
      const name = new URL(source, location.href).pathname.split('/').pop();
      const match = /^(prototype|base|liob|liob_host)\.jsz?$/.exec(name);
      return match ? match[1] : 'other';
    } catch { return 'other'; }
  };
  Object.defineProperty(window, '__bacIOTransportDiagnostics', { value: diagnostics });
  window.addEventListener('error', event => {
    const key = event.target && event.target !== window ? 'resourceErrors' : 'scriptErrors';
    diagnostics[key] = Math.min(diagnostics[key] + 1, 999);
    if (key === 'scriptErrors' && diagnostics.scriptErrors === 1) {
      diagnostics.firstScriptError = ['SyntaxError', 'TypeError', 'ReferenceError', 'RangeError'].includes(event.error?.name) ? event.error.name : 'other';
      diagnostics.firstScriptSource = sourceKind(event.filename);
    }
    if (key === 'resourceErrors' && diagnostics.resourceErrors === 1) diagnostics.firstResourceSource = sourceKind(event.target?.src);
  }, true);
  window.addEventListener('unhandledrejection', () => {
    diagnostics.scriptErrors = Math.min(diagnostics.scriptErrors + 1, 999);
    if (diagnostics.scriptErrors === 1) {
      diagnostics.firstScriptError = 'unhandled-promise'; diagnostics.firstScriptSource = 'other';
    }
  });
  const ignore = function () {};
  for (const [prototype, names] of [
    [HTMLElement.prototype, ['focus']],
    [HTMLInputElement.prototype, ['focus', 'select']],
    [HTMLTextAreaElement.prototype, ['focus', 'select']]
  ]) {
    for (const name of names) {
      Object.defineProperty(prototype, name, { value: ignore, writable: false, configurable: false });
    }
  }
})();
