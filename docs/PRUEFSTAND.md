# Prüfstand 0.1.9 vom 5. Oktober 2026

| Bereich | Ergebnis |
|---|---|
| Portable Node-Tests | 119 bestanden, keine Fehler; ein nativer macOS-Test hier übersprungen |
| Apple-Kontext und Aktionen | Begrenzte Historie, passende Begriffe, genaue Anlagenkennungen, zulässige Werkzeuge und Wertansagen mit Fixtures geprüft |
| Google-Server | Roh-REST-Tokenanforderung, Modellbindung, Ablauf, Einmalnutzung als Request, Kontingent, Parallelstarts, Fehler ohne Schlüsselweitergabe mit simuliertem API-Dienst geprüft |
| Google-HTTP-Endpunkte | Authentifizierung und Schema, getrennte Anbieter, reiner Konfigurationsstatus, fehlende Schlüssel über lokalen HTTP-Server geprüft |
| WebSocket-Konfiguration | Im App-Bundle erzeugte Rohschemas, Audio-Konfiguration, Werkzeuge und nullable Referenzwerte geprüft; keine echte Google-Verbindung |
| Controller | Erfolgreiche Anmelde- und I/O-Brücken gegenüber 0.1.8 unverändert; bestehende Tests weiterhin erfolgreich |
| Swift | Syntax von 21 App-Dateien und einer Testdatei geprüft; kein Typecheck oder Makro-Build |
| Native Abläufe | Anbieterwechsel, Audiogeräte, lokale Bestätigung und Foundation Models im Code geprüft; Ausführung am iPhone steht aus |
| Projektstruktur | Alle neuen Quellen eingebunden, Foundation Models schwach gelinkt; Basisziel iOS 17, Nutzung des Apple-Modells ab iOS 26 |
| Build / Upload / API-Aufrufe | Kein Xcode-Build, kein Codemagic-Start, kein TestFlight-Upload, keine echten Apple-/Google-/OpenAI-Modellanfragen |

Die Tests des Tokenbrokers prüfen die erzeugte Anfrage und simulierte Antworten; sie belegen nicht die Annahme durch einen echten Google-Account. Der lokale Apple-KI-Code benötigt im nativen Build die Foundation-Models-Makros des Apple-SDK. Die reine Swift-Syntaxprüfung ersetzt dies nicht. Der bestehende macOS-Zertifikatstest bleibt Bestandteil von `npm test` im Codemagic-Workflow.

Update: `UPDATE_0.1.9.md`. Einrichtung: `KI_GESPRAECH.md`. Ausstehende Gerätetests: `GERAETETEST.md`.

## Vorangegangener Prüfstand 0.1.8 vom 5. Oktober 2026

| Bereich | Ergebnis |
|---|---|
| Nutzer-Rückmeldung zu 0.1.7 | Anmeldung funktioniert und Datenpunkte werden angezeigt |
| Portable Node-Tests | 108 bestanden; keine Fehler; ein nativer Test lokal übersprungen |
| Reservefilter | Eindeutige Wörter, AKS-Trennzeichen, Nummern und Beschreibungen erkannt; zusammengesetzte Namen und Nullwerte bleiben sichtbar |
| Prüfreihenfolge / Suche | Reserven werden in Liste, Suche und Vorwärts-/Rückwärtsnavigation berücksichtigt; Reihenfolge und vorhandene Auswahl bleiben erhalten |
| KI-Serverstatus | Authentifizierung, Schema, fehlender API-Schlüssel, keine OpenAI-Anfrage und kein Verbrauch des Sitzungslimits über lokales HTTP geprüft |
| KI-Gespräch | Vorhandene Tests für Suche, Referenzrechnung, Bestätigung und begrenzte Werkzeuge bestehen weiterhin; Live-Gespräch nicht getestet |
| Swift | Syntax von 18 App-Swift-Dateien und einer Swift-Testdatei geprüft; kein nativer Typecheck |
| Projektstruktur | Ressourcen, Berechtigungen und Schema konsistent; unveränderte Anmelde- und Controller-Brücken |
| iPhone / Xcode / Codemagic für 0.1.8 | Filter, Einrichtung und Gespräch stehen am Gerät noch aus; kein Build durch diese Bearbeitung |
| Upload / Veröffentlichung / echte OpenAI-Anfragen | Nicht durchgeführt |

Der Filter arbeitet ausschließlich auf Name und Beschreibung. Er verändert keine Controllerwerte, Prüfentwürfe oder gespeicherten Daten. Die Einstellung wird geräteweit gespeichert. Fehler bei der Klassifikation lassen alle Punkte sichtbar.

Der neue Statusendpunkt meldet die Serverkonfiguration. Ein hinterlegter API-Schlüssel ist kein Nachweis für seine Gültigkeit oder ein erfolgreiches Gespräch. Die tatsächliche Verbindung zu OpenAI erfolgt erst nach dem ausdrücklichen Gesprächsstart. Ein HTTPS-Server mit API-Zugang muss vom Nutzer eingerichtet werden.

Update-Anleitung: `UPDATE_0.1.8.md`. KI-Einrichtung: `KI_GESPRAECH.md`.

## Vorangegangener Prüfstand 0.1.7 vom 5. Oktober 2026

| Bereich | Ergebnis |
|---|---|
| Portable Node-Tests | 99 bestanden; keine Fehler; ein nativer Test lokal übersprungen |
| Gemeldeter Zustand aus 0.1.6 (11) | Alle protokollierten Seitenmerkmale ohne globale oder eingebettete Gerätekennung nachgebildet. Unveränderte 0.1.6-Brücke weist das Formular ab; korrigierte Brücke erkennt es |
| Tokenquellen und Protokolle | Inline-Token sowie zugehöriges verstecktes Formularfeld jeweils unter simuliertem HTTP und HTTPS geprüft |
| Anmeldung und I/O | Ein Anmeldeauftrag, danach bestätigte Sitzungsmetadaten, frisches Lesen und separater Kommentar-Readback in der Simulation bestanden |
| Fehlerfälle | Unvollständige Formulare, fehlende/ungültige Token, fremde Adressen/Pfade, abgewiesene Passwörter, unbestätigte Antworten und Passwortwarnungen geprüft |
| Ursprüngliche Controller-HTML-Datei | Zwei zusätzliche Prüfungen bestanden; keine Originaldaten im Update |
| Projektstruktur | Ressourcen, Berechtigungen und Schema konsistent |
| Swift und native Zertifikatspolitik | Swift-Dateien gegenüber 0.1.6 unverändert; kein neuer Syntax-/Typecheck. Nativer Test benötigt macOS und bleibt im Codemagic-Workflow enthalten |
| Tatsächlicher Controller-Login / Anzeige 0.1.7 | Nach Auslieferung durch den Nutzer am iPhone bestätigt |
| Upload / Codemagic / Veröffentlichung durch diese Bearbeitung | Nicht durchgeführt |

## Befund und Korrektur in 0.1.7

Der neue Nutzerlog belegt, dass 0.1.6 den Sitzungstoken findet. Die zusätzlich verlangte Gerätekennung fehlt weiterhin. Der Quellcode bestätigt, dass dies trotz vollständig erkanntem Anmeldeformular vor dem Passwortversand zum Abbruch führt. Die Korrektur erlaubt den Anmeldeversuch bei vollständiger LOYTEC-Formularstruktur und eindeutigem Token an der exakt gewählten Adresse. Vorhandene widersprüchliche Metadaten verhindern diese Formularerkennung weiterhin. Die Bestätigung der Anmeldung und der I/O-Seite bleibt gesondert erforderlich.

Der vorherige Test hatte Geräteinformationen im HTML vorausgesetzt. Diese Annahme war durch den damaligen Log nicht gesichert. Der neue Regressionstest enthält keinerlei Gerätekennung und bildet alle Merkmale des jetzt gelieferten Logs nach. Sein Fehlschlag vor der Codeänderung und sein Erfolg danach bestätigen die gezielte Korrektur der Formularprüfung, keinen tatsächlichen iPhone-Login.

Update-Anleitung: `UPDATE_0.1.7.md`.

## Vorangegangener Prüfstand 0.1.6 vom 5. Oktober 2026

| Bereich | Ergebnis |
|---|---|
| Portable Node-Tests | 96 bestanden; keine Fehler |
| Anmeldeprüfung | Verzögerter Formularaufbau, fehlender Legacy-Konstruktor, verdeckte Formulareigenschaft, unbekannte Seiten, feste Diagnosefelder und Unterdrückung vertraulicher Ausnahmeinhalte geprüft |
| Geführter Test | Referenzabweichung, bestehende Kommentare, klare/negierte Zustimmungen, numerische und binäre Änderungen geprüft |
| Serverteil | Kurzlebige Tokens, feste Werkzeuge, Authentifizierung, Schema, Antwortvalidierung, Startgrenzen mit simuliertem OpenAI-Dienst geprüft |
| Native Ressourcen | Gemeinsame Regeln und Werkzeuge geprüft; Browser-Fokus und Selektion im nicht bedienbaren Transport unterbunden |
| Native Zertifikatspolitik | 16 Fälle in Swift vorbereitet; lokal ohne macOS/Swift übersprungen. Läuft in Codemagic über npm test |
| Xcode-Projekt | 18 App-Swift-Dateien und 5 Ressourcen, Strukturprüfung bestanden |
| Swift | Syntax von 18 App-Dateien und einer Swift-Testdatei mit Parser geprüft; kein Swift-Typecheck, kein Xcode-Build |
| Live-KI / Audio / iPhone | Ausstehend; kein API-Schlüssel verwendet, keine kostenpflichtige Anfrage ausgeführt |
| Gerätetest 0.1.4 (9) | TCP-Port erreichbar, HTTP 200 und Seite geladen; Abbruch bei Anmeldeprüfung ohne protokollierten Grund |
| Gerätetest 0.1.5 (10) | Vollständiges Formular; LoginPage, Metadaten und CSRF-Variable für die Brücke nicht sichtbar; login-form-unrecognized |
| HTML-Sitzungsdaten 0.1.6 | Meldung aus 0.1.5 nachgestellt; gleiche Seite wird mit 0.1.6 erkannt. Simulierte Anmeldung, I/O-Lesen und Kommentar-Readback bestehen |
| Ursprüngliche Controller-HTML-Datei | Zwei zusätzliche Prüfungen bestanden: Metadaten/CSRF ohne Ausführung auslesen und 26 lokale Kanäle verarbeiten |
| LOYTEC-Anmeldung 0.1.6 | Nachträglicher Nutzerlog: Sitzungstoken erkannt, Gerätekennung fehlt weiterhin; Abbruch vor dem Anmeldeauftrag |
| Upload / Codemagic / Veröffentlichung | Nicht durchgeführt |

## Fehlerbild und Änderung in 0.1.6

Der vollständige Log von **0.1.5 (10)** zeigt: Formular, Accountfeld, Passwortfeld, Formularzuordnung, POST-Methode und Logincontainer vorhanden. Zugangsdaten sind gespeichert. Die bisher verwendeten JavaScript-Zugriffe liefern hingegen keinen LoginPage-Konstruktor, keine erkannten Controller-Metadaten und keinen CSRF-Token. Deshalb wird vor dem Passwortversand abgebrochen. Der Log belegt diesen Prüfungsfehler, aber nicht die zugrunde liegende WebKit-Ursache.

0.1.6 ergänzt einen gemeinsamen Leser für die Sitzungsdaten beider nativen Brücken. Er übernimmt ausschließlich JSON-Literale aus den bekannten Firmware-Zuweisungen und Tokenwerte aus dem zugehörigen versteckten Formularfeld. Controller-Quelltext wird dabei nicht ausgeführt. Globale Daten werden weiterhin bevorzugt. Widersprüchliche Daten stoppen den Auftrag; fremde Adressen und unbekannte Seiten erhalten keine Zugangsdaten. Nur Datenquellen und Ja/Nein-Merkmale gelangen in die Diagnose.

Für die I/O-Seite werden bei fehlender Laufzeitfunktion die exakt im gelieferten Firmwarecode definierten Bearbeitungsrollen ausgewertet: superadmin, admin, operator. Eine vorhandene Rollenfunktion bleibt maßgeblich; unbekannte Rollen erhalten keine Schreibberechtigung. Die vorhandenen Einschränkungen auf Prüfstatus und Kommentare einschließlich Vorprüfung und separatem Zurücklesen gelten weiterhin.

Ein Regressionstest bildet das gemeldete Formular ohne LOYTEC-Globals nach. Die alte Brücke liefert login-form-unrecognized; die neue liefert login-form-ready. Ein weiterer Test umfasst Anmeldung, Seitenwechsel, frisches Lesen und bestätigtes Zurücklesen eines Kommentars. Zusätzlich wurde der Datenleser gegen die ursprünglich gelieferte, lokal gehaltene Controller-HTML-Datei geprüft. Dies ersetzt keinen echten iPhone-Test.

Der Info.plist-Eintrag ITSAppUsesNonExemptEncryption=false beschreibt die im geprüften App-Code verwendeten Apple-Systemfunktionen. Er ist für künftige Builds vorgesehen; der bereits hochgeladene Build 10 wird dadurch nicht verändert.

## Vorangegangene Diagnosekorrektur 0.1.5

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
