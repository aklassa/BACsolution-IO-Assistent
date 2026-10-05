# BACsolution I/O-Assistent – Arbeitsstand 0.1.4

Unveröffentlichter Quellcode für eine native iPhone-App ab iOS 17. Controller-Anbindung: LOYTEC LIOB-589, Firmware 8.4.20. Keine aktive Ausgangsansteuerung.

**Stand 0.1.4:** Der gemeldete HTTPS-Versuch scheitert an einem von iOS nicht bestätigten Controller-Zertifikat. Dafür gibt es nun eine ausdrückliche Freigabe anhand des SHA-256-Fingerabdrucks, gebunden an Station, HTTPS-Adresse und Zertifikat. Der HTTP-Screenshot zeigt einen Stillstand beim Laden; seine genaue Ursache ist noch offen. Der Controller-Transport wird jetzt an das App-Fenster angebunden, erhält einen TCP-Porttest und eine kopierbare Diagnose. Der tatsächliche Login-Erfolg muss am Controller bestätigt werden.

Zusätzlich vorbereitet: ein optionales KI-Gespräch mit natürlicher Datenpunktsuche, Rückfragen, Wertbeobachtung und Referenzvergleich. Die App liest Prüfkommentare vor und speichert sie nur nach ausdrücklicher Bestätigung mit separatem Controller-Readback. Die erste KI-Version setzt keine Prüfstatus automatisch und schaltet keine Ausgänge. Ein eigener HTTPS-Dienst mit OpenAI-API-Zugang ist erforderlich und noch nicht eingerichtet.

**Validierung:** 82 portable Tests bestanden. Der zusätzliche native Zertifikatstest benötigt macOS/Swift und wird in den vorhandenen Codemagic-Workflows durch `npm test` ausgeführt; lokal übersprungen. Projektstruktur und Syntax von 18 App-Swift-Dateien und einer Swift-Testdatei geprüft. Kein Xcode-Build und kein Live-Test mit OpenAI oder dem Controller für diesen Stand. Das ursprüngliche Crashlog betrifft 0.1.1 (6), iOS 27.0.1, und zeigt eine UIKit-Touch-Ausnahme; der konkrete Auslöser ist nicht bewiesen.

**Codemagic/TestFlight:** Bestehende manuelle Workflows und Signierung unverändert. Update-Anleitung: `docs/UPDATE_0.1.4.md`; KI-Einrichtung: `docs/KI_GESPRAECH.md`. Keine Veröffentlichung, kein Upload und kein kostenpflichtiger API-Aufruf durch diese Bearbeitung.

## Enthalten

- Projekte mit eigenen Stations-IDs, Controller-Adresse und eindeutiger Stationskennung. Diese IDs bleiben unabhängig von der IP-Adresse.
- Native Felder für Account und Passwort beim Anlegen eines Projekts mit erster Station sowie jeder weiteren Station. Bestehende Stationen können Zugangsdaten im Verbindungsdialog ergänzen oder ändern.
- Automatische Anmeldung über die in Firmware 8.4.20 vorgefundene LOYTEC-Schnittstelle. WebKit dient nur als Sitzungs- und Protokolltransport und wird nicht als Eingabefläche eingeblendet. Ein abgewiesener oder unklarer Anmeldeversuch wird nicht automatisch wiederholt.
- Controller-Passwörter liegen ausschließlich im gerätegebundenen Schlüsselbund, getrennt nach Stations-ID und Controller-Adresse einschließlich Protokoll und Port. Projektdateien, Prüfergebnisse und Serverabgleich enthalten keine Zugangsdaten. Auf weiteren iPhones ist eine einmalige Eingabe erforderlich.
- HTTPS-Zertifikate mit Systemvertrauen werden regulär geprüft. Ein abweichendes Controller-Zertifikat kann nach Fingerabdruckvergleich ausdrücklich für diese Station freigegeben werden. Änderungen daran benötigen eine neue Freigabe. Diese Ausnahme gilt nicht für Sync- oder KI-Server. Unter **Verbindungsdiagnose** stehen TCP-Erreichbarkeit, HTTP-Status, Anmeldeschritte und Fehlercodes ohne Passwort oder Sitzungstoken.
- Lesen aller von der Station angebotenen I/O-Busse. Suche über Namen, Beschreibung, Klemme, Gerät und Bus. Ein- und Ausgänge werden angezeigt; aktive Ausgangsansteuerung ist nicht implementiert.
- 58 vorbelegte Begriffe aus dem bisherigen Arbeitsstand, eigene Ergänzungen und deaktivierbare Begriffe. Weitere Bezeichnungen stehen einzeln untereinander. Das Verzeichnis gilt für alle Projekte der App.
- Lokaler Sprachmodus mit Apple-Spracherkennung und Sprachausgabe. Zusätzlich optionaler KI-Modus mit direktem Realtime-Audio, Unterbrechungen und Funktionsaufrufen. Bestätigungen verwenden ausschließlich abgeschlossene Transkripte. Das lokale Vorlesen des vollständigen Kommentars pausiert vorübergehend das Mikrofon.
- Lokale Prüfentwürfe, die App-Neustarts überstehen. Im lokalen Modus werden Ergebnisse und Kommentare nach ausdrücklichem „Speichern“ bzw. Antippen übertragen. Im KI-Modus gilt ein klares „Ja“ ausschließlich für den gerade vollständig vorgelesenen, unveränderten Kommentarentwurf.
- Vorprüfung gegen die bisherigen Controller-Prüfdaten, anschließendes separates Zurücklesen. Datum vergibt ausschließlich der Controller. Unsichere Schreibaufträge werden nicht automatisch wiederholt.
- Getrennte Speicherung von „lokaler Entwurf“, „Controller bestätigt“ und „gemeinsam gespeichert“. Konflikte und ausstehende Abgleiche bleiben sichtbar.
- Optionaler HTTPS-Abgleichclient und ein Node-Referenzdienst für Projekte, globale Begriffe und bestätigte Prüfhistorie. Keine automatischen Controller-Schreibaufträge aus der zentralen Datenbank.

## Projekt öffnen und bauen

`BACsolution.xcodeproj` ist bereits erzeugt und kann mit Xcode geöffnet werden. Externe Swift-Pakete, CocoaPods und XcodeGen werden nicht benötigt.

Auf einem Mac mit Xcode und iOS-SDK:

```sh
xcodebuild -project BACsolution.xcodeproj -scheme BACsolution \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build CODE_SIGNING_ALLOWED=NO build
```

Für ein echtes iPhone anschließend in Xcode unter **Signing & Capabilities** das eigene Team und eine passende Bundle-ID auswählen, das iPhone anschließen und den Entwicklungsbuild starten. Apple-Anmeldung, Signierung und Gerätefreigabe werden nicht durch dieses Quellcodepaket erledigt.

Unter Windows können Quellcode und JavaScript-Tests bearbeitet werden. Der native iOS-Build benötigt einen Mac oder einen macOS-Builddienst. Als Vorbereitung liegt `.github/workflows/ios-check.yml` bei: ausschließlich manuell gestartet, ausschließlich unsignierter Simulator-Build und Tests, ohne Veröffentlichung oder Artefakt-Upload. Der Workflow wurde noch nicht in GitHub ausgeführt.

## Erster Gerätetest

1. iPhone mit einem Netz verbinden, das den Controller erreicht. Unter **Abgleich → Prüfer** den eigenen Namen speichern. Ein gemeinsamer Server ist für den lokalen Controller-Test nicht erforderlich.
2. Projekt und Station mit Controller-Adresse, Stationskennung, Account und Passwort anlegen. Bei „Stationskennung“ beispielsweise die Controller-Seriennummer eintragen und am realen Gerät vergleichen.
3. Station öffnen. Bei einer HTTPS-Zertifikatsabfrage zuerst den Fingerabdruck am tatsächlichen Controller bzw. auf einem bereits geprüften PC vergleichen und ausdrücklich freigeben. Die App meldet sich mit den gespeicherten Zugangsdaten an und lädt die I/O-Testseite. Bei einer bestehenden Station ohne gespeicherte Zugangsdaten einmal **Speichern und verbinden** wählen. Nach erfolgreicher Anmeldung die hinterlegte Identität vor Ort vergleichen und **Identität bestätigt · Lesen** wählen. Eine automatische Seriennummer-Erkennung wird nicht vorausgesetzt. Änderungen an Account oder Passwort sind unter **Zugangsdaten ändern** möglich.
4. Zunächst einen bekannten Eingang auswählen und aktuellen Wert vorlesen lassen. Danach „Wert von Zulufttemperatur Anlage 2.1“ oder einen tatsächlich vorhandenen Punktnamen sprechen.
5. Bei mehreren Treffern „Treffer zwei“ sagen. Die App liest den gewählten Punkt erneut. Anlage 2.1 und 2.10 dürfen nicht verwechselt werden.
6. An einem vorgesehenen Prüfpunkt einen Kommentar vormerken und ausdrücklich speichern. Kommentar und gegebenenfalls Prüfstatus anschließend auch in der LOYTEC-Oberfläche vergleichen.
7. Erst danach Mikrofon, Sprachausgabe und Headset-Sitzung mit dem tatsächlichen Kopfhörer prüfen. Verbindungsabbruch und Konfliktfälle stehen in `docs/GERAETETEST.md`.

Die App bleibt für die Headset-Sitzung geöffnet und verhindert dabei den automatischen Ruhezustand. Sperren, App-Wechsel, Audio-Unterbrechungen oder das Trennen des Headsets pausieren die Sitzung. Hintergrundbetrieb bei gesperrtem iPhone und Headset-Tastensteuerung sind noch nicht umgesetzt. Die Sprachfunktion startet nicht selbständig nach einer Unterbrechung.

Lokale deutsche Spracherkennung ist der Standard und hängt von Gerät und verfügbarer Sprachunterstützung ab. Ohne diese Unterstützung bleibt die Texteingabe nutzbar. Online-Erkennung durch Apple lässt sich ausdrücklich erlauben. Die App speichert keine Audiodateien. Der lokale Modus verwendet die übernommenen Befehlsregeln. Der neue KI-Modus wird gesondert freigegeben und gestartet; Sprache sowie benötigte Punktdaten werden dabei an OpenAI übertragen. Die gemeinsame Begriffsliste bleibt die Grundlage der Suche. Einrichtung und Grenzen stehen in `docs/KI_GESPRAECH.md`.

## Gemeinsamer Datenbestand und PC

Der Referenzdienst in `SyncServer/` ist für die Entwicklung eines einzelnen gemeinsamen Arbeitsbereichs vorbereitet. Er läuft standardmäßig nur auf `127.0.0.1`. Für das iPhone benötigt er einen erreichbaren HTTPS-Zugang mit gültigem Zertifikat. Controller müssen nicht ins Internet gestellt werden.

`docs/SYNC.md` beschreibt Einrichtung, Datenformat, Wiederholungen und Konfliktauflösung. Projekte und Begriffe werden nach Änderungen manuell abgeglichen. Bestätigte Prüfergebnisse bleiben bis zum erfolgreichen Abgleich in der lokalen Warteschlange. Bei Internetausfall kann lokal weitergeprüft werden, solange das iPhone den Controller erreicht. Ein nicht erreichbarer Controller liefert keine neuen Messwerte.

Die PC-Erweiterung muss als nächster Integrationsschritt dieselben Projekt-/Stations-IDs übernehmen, bestätigte Ergebnisse an diese Schnittstelle senden und die gemeinsame Begriffsliste laden. Diese Verdrahtung in die PC-Oberfläche ist **noch offen**. Die API und ihr Verhalten mit zwei Clients sind bereits geprüft. Der aktuelle Stand wird deshalb nicht als bereits funktionierender nahtloser iPhone-PC-Wechsel ausgegeben.

## Quellcode und Prüfungen

| Verzeichnis | Inhalt |
|---|---|
| `App/` | SwiftUI-Oberfläche, lokale Daten, LOYTEC-Sitzung, Sprache und Abgleich |
| `Shared/` | Übernommene JavaScript-Logik für Protokoll, Suche und Begriffe |
| `Resources/` | Generierte JavaScript-Brücken und iOS-Berechtigungen |
| `SyncServer/` | Optionaler Referenzdienst, ohne bereitgestellten Server |
| `Tests/` | Protokoll-, Such-, Brücken- und Abgleichprüfungen |
| `Tests/DesktopReference/` | Bestehende Desktop-Oberfläche ausschließlich als Fixture der übernommenen Regressionstests |
| `scripts/` | Reproduzierbare Ressourcen-/Projektgenerierung und Strukturprüfung |

```sh
npm run prepare
npm test
python3 scripts/check_project.py
```

`npm run prepare` bündelt die gemeinsamen JavaScript-Dateien und erzeugt das Xcode-Projekt neu. Bei neuen Swift-Dateien erneut ausführen. Die Befehle installieren keine Node-Abhängigkeiten.

Der konkrete Prüfstand und die Grenzen stehen in `docs/PRUEFSTAND.md`. Die Original-Controller-Seite und reale Exportdateien sind wegen ihrer Sitzungs- und Anlagendaten nicht im Paket enthalten.
