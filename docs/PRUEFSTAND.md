# Prüfstand 0.1.3 vom 5. Oktober 2026

| Bereich | Ergebnis |
|---|---|
| Portable Node-Tests | 81 bestanden; 72 bisherige und 9 neue Tests |
| Geführter Test | Referenzabweichung, bestehende Kommentare, klare/negierte Zustimmungen, numerische und binäre Änderungen geprüft |
| Serverteil | Kurzlebige Tokens, feste Werkzeuge, Authentifizierung, Schema, Antwortvalidierung, Startgrenzen mit simuliertem OpenAI-Dienst geprüft |
| Native Ressourcen | Gemeinsame Regeln und Werkzeuge aus derselben JS-Quelle generiert und geprüft |
| Xcode-Projekt | 15 Swift-Dateien und 4 Ressourcen, Strukturprüfung bestanden |
| Swift | Syntax aller 15 Dateien mit Parser geprüft; kein Swift-Typecheck, kein Xcode-Build |
| Live-KI / Audio / iPhone | Ausstehend; kein API-Schlüssel verwendet, keine kostenpflichtige Anfrage ausgeführt |
| LOYTEC-Anmeldung 0.1.3 | Korrektur vorbereitet, realer Gerätetest ausstehend |
| Upload / Codemagic / Veröffentlichung | Nicht durchgeführt |

## Nachgereichtes Crash-Feedback

Das TestFlight-Feedback betrifft **0.1.1 (6)** auf **iOS 27.0.1**. Exception: `EXC_CRASH (SIGABRT)`, `-[__NSArrayM insertObject:atIndex:]: object cannot be nil`. Erster aussagekräftiger Framework-Frame: `UIGestureRecognizer _delayTouch:forEvent:`. Der App-Frame ist lediglich der Programmeinstieg. Das belegt eine Ausnahme bei der Touch-Verarbeitung, keinen Fehler bei der Passwortprüfung. Der konkrete Auslöser innerhalb der Browser-Eingabe bleibt ohne Geräte-Reproduktion offen.

Der Nutzer hat 0.1.2 getestet: Zugangsdaten werden gespeichert, Verbindung bleibt vor dem Login stehen. Die aus der View-Hierarchie entfernte WKWebView besaß noch die voreingestellte Inaktivitätsregel. Neuere SDKs können damit ihren WebContent-Prozess sofort suspendieren. 0.1.3 setzt `inactiveSchedulingPolicy = .none` bei aktiver App und `.suspend` bei App-Hintergrund bzw. abgebrochener Anmeldung. Native Zugangsfelder bleiben erhalten. Der tatsächliche Login-Erfolg ist noch zu bestätigen.

Quellen: [WebKit-Erklärung](https://bugs.webkit.org/show_bug.cgi?format=multiple&id=283794), [Apple InactiveSchedulingPolicy.none](https://developer.apple.com/documentation/webkit/wkpreferences/inactiveschedulingpolicy-swift.enum/none).

Portable Prüfungen:

```sh
npm run prepare
npm test
python3 scripts/check_project.py
```

Die Geräteprüfungen aus `GERAETETEST.md` und `KI_GESPRAECH.md` stehen aus. Original-Feedback und Anlagendaten werden nicht in das Quellcodepaket übernommen.
