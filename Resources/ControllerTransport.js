// Injected at document start, only in the noninteractive native transport.
// LOYTEC's legacy login invokes focus()/select(). Never let those calls open
// WebKit's keyboard while credentials are entered in the native SwiftUI form.
(() => {
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
