# Prüfstand 0.1.5 vom 5. Oktober 2026

| Bereich | Ergebnis |
|---|---|
| Portable Node-Tests | 89 bestanden; keine Fehler |
| Anmeldeprüfung | Verzögerter Formularaufbau, fehlender Legacy-Konstruktor, verdeckte Formulareigenschaft, unbekannte Seiten, feste Diagnosefelder und Unterdrückung vertraulicher Ausnahmeinhalte geprüft |
| Geführter Test | Referenzabweichung, bestehende Kommentare, klare/negierte Zustimmungen, numerische und binäre Änderungen geprüft |
| Serverteil | Kurzlebige Tokens, feste Werkzeuge, Authentifizierung, Schema, Antwortvalidierung, Startgrenzen mit simuliertem OpenAI-Dienst geprüft |
| Native Ressourcen | Gemeinsame Regeln und Werkzeuge geprüft; Browser-Fokus und Selektion im nicht bedienbaren Transport unterbunden |
| Native Zertifikatspolitik | 16 Fälle in Swift vorbereitet; lokal ohne macOS/Swift übersprungen. Läuft in Codemagic über npm test |
| Xcode-Projekt | 18 App-Swift-Dateien und 5 Ressourcen, Strukturprüfung bestanden |
| Swift | Syntax von 18 App-Dateien und einer Swift-Testdatei mit Parser geprüft; kein Swift-Typecheck, kein Xcode-Build |
| Live-KI / Audio / iPhone | Ausstehend; kein API-Schlüssel verwendet, keine kostenpflichtige Anfrage ausgeführt |
| Gerätetest 0.1.4 (9) | TCP-Port erreichbar, HTTP 200 und Seite geladen; Abbruch bei Anmeldeprüfung ohne protokollierten Grund |
| LOYTEC-Anmeldung 0.1.5 | Quellcode korrigiert; neuer iPhone-Build und tatsächlicher Login ausstehend |
| Upload / Codemagic / Veröffentlichung | Nicht durchgeführt |

## Aktuelles Fehlerbild und Änderung

Der Nutzer hat den vollständigen Gerätelog von **0.1.4 (9), iOS 27.0.1** geliefert. Der Controller antwortet nach 0,5 Sekunden mit HTTP 200. Nach „Seite geladen; Anmeldestatus prüfen“ endet der Versuch sofort. Eine zusätzliche Fehlermeldung war nach Rückmeldung des Nutzers nicht vorhanden. Der Quellcode bestätigt, dass `stopWithMessage` den Grund bislang nur in den UI-Status schreibt, im kopierten Log aber lediglich Phase und Verbindungsende hinterlässt. Der konkrete Login-Abbruch ist dadurch nicht bestimmbar; ein falsches Passwort ist nicht belegt.

0.1.5 ergänzt sichtbaren Abbruchtext, Diagnosecode und denselben Grund im kopierten Bericht. Dazu kommen sichere Seitenmerkmale und Fehlerzähler ohne vertrauliche Seiteninhalte. Vollständig fehlende Formulare werden für drei Sekunden erneut geprüft; es werden keine Passwortanfragen wiederholt. Eindeutig identifizierte LOYTEC-Formulare können über zusätzliche Controller-Metadaten erkannt werden, auch wenn der Legacy-Konstruktor fehlt. Formularattribute werden gegen eine Verdeckung durch gleichnamige Felder gelesen. Diese Fälle sind in simulierten Seiten geprüft, nicht am tatsächlichen Controller reproduziert.

## Vorangegangene Transportkorrektur 0.1.4

Die nach 0.1.3 gelieferten Bilder zeigten bei HTTP die Phase **1/4 · Controller-Seite laden** und bei HTTPS einen iOS-Zertifikatsfehler. Der neue 0.1.4-Gerätelog bestätigt inzwischen den erfolgreichen HTTP-Seitenabruf.

0.1.4 bindet den nicht bedienbaren WebKit-Transport an das App-Fenster an, blockiert die bekannten Fokus-/Selektionsaufrufe der alten Browser-Anmeldung und prüft vor dem Laden den konfigurierten TCP-Port. Ein Versuch endet nach spätestens 30 Sekunden, der reine Porttest nach 10 Sekunden. Feste Diagnoseereignisse, HTTP-Status und Fehlercodes können kopiert werden. Keine Protokollierung von Anmeldeformularen, Passwörtern, Antwortinhalten oder Sitzungstoken.

HTTPS nutzt Systemvertrauen oder eine ausdrücklich bestätigte, lokal gespeicherte SHA-256-Bindung an das konkrete Controller-Zertifikat. Die Freigabe ist nach Station und HTTPS-Adresse einschließlich Port getrennt. Ein geändertes Zertifikat erfordert erneut einen Fingerabdruckvergleich. Die Entscheidung wird vor dem Login getroffen. Sync- und KI-Verbindungen verwenden weiterhin ihre reguläre Zertifikatsprüfung.

Der Code ist für den nächsten internen Build vorbereitet. Ein erfolgreicher Controller-Login wird erst nach Rückmeldung vom iPhone als bestätigt gewertet.

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
