import { createVocabularyService } from './vocabulary.js';

const vocabulary = createVocabularyService(chrome.storage.local);
chrome.runtime.onMessage.addListener((request, sender, respond) => {
  if (request?.channel !== 'bacsolution-vocabulary') return;
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) { respond({ ok: false, error: 'Unzulässiger Zugriff auf die Begriffseinstellungen.' }); return; }
  vocabulary.request(request.operation, request.data).then(value => respond({ ok: true, vocabulary: value }), error => respond({ ok: false, error: error.message }));
  return true;
});

chrome.action.onClicked.addListener(async (tab) => {
  const url = new URL(chrome.runtime.getURL('assistant.html'));
  try {
    const target = new URL(tab.url || '');
    if (!['https:', 'http:'].includes(target.protocol) || !/^\/webui\/liob\/iotest\/?$/.test(target.pathname)) {
      throw new Error('Bitte zuerst die angemeldete LOYTEC-Seite „L-IOB → I/O Test“ öffnen und dort auf das Erweiterungssymbol klicken.');
    }
    url.searchParams.set('tab', String(tab.id));
    url.searchParams.set('origin', target.origin);
  } catch (error) {
    url.searchParams.set('notice', error.message);
  }
  await chrome.tabs.create({ url: url.href });
});
