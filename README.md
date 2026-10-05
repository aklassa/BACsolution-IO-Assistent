# BACsolution I/O-Assistent – Arbeitsstand 0.1.2

Unveröffentlichter Quellcode für eine native iPhone-App ab iOS 17. Zielgerät der Controller-Anbindung: **LOYTEC LIOB-589, Firmware 8.4.20**. Die vorhandene Desktop-Erweiterung und deren veröffentlichte ZIP-Datei wurden durch diese Vorbereitung nicht geändert.

**Status 0.1.2:** Die Controller-Anmeldung wurde nach dem gemeldeten Absturz beim Antippen der Web-Eingabefelder umgebaut. Account und Passwort werden in nativen App-Feldern erfasst und pro Station im iOS-Schlüsselbund gespeichert. Dieser neue Arbeitsstand ist lokal auf Logik und Projektstruktur geprüft; Xcode-Build und Gerätetest stehen noch aus. Der genaue ursprüngliche Absturzgrund ist ohne iPhone-Absturzprotokoll nicht belegt. Der gemeinsame Speicher ist als optionaler Client und ausführbarer Referenzdienst enthalten; es ist kein Server eingerichtet. Die bestehende PC-Erweiterung verwendet den Abgleichdienst noch nicht.

**Codemagic/TestFlight:** Für den bisherigen Stand 0.1.1 wurden ein erfolgreicher Codemagic-Simulator-Build und der App-Start auf dem iPhone vom Anwender gezeigt. Version **0.1.2** ist als nächstes Update vorbereitet. Version und Buildnummer stehen unter **Abgleich → App**. Die bestehenden manuellen Workflows bleiben verwendbar. Die Update-Anleitung steht in `docs/UPDATE_0.1.2.md`. Dieser Arbeitsstand wurde nicht hochgeladen oder veröffentlicht.

## Enthalten

- Projekte mit eigenen Stations-IDs, Controller-Adresse und eindeutiger Stationskennung. Diese IDs bleiben unabhängig von der IP-Adresse.
- Native Felder für Account und Passwort beim Anlegen eines Projekts mit erster Station sowie jeder weiteren Station. Bestehende Stationen können Zugangsdaten im Verbindungsdialog ergänzen oder ändern.
- Automatische Anmeldung über die in Firmware 8.4.20 vorgefundene LOYTEC-Schnittstelle. WebKit dient nur als Sitzungs- und Protokolltransport und wird nicht als Eingabefläche eingeblendet. Ein abgewiesener oder unklarer Anmeldeversuch wird nicht automatisch wiederholt.
- Controller-Passwörter liegen ausschließlich im gerätegebundenen Schlüsselbund, getrennt nach Stations-ID und Controller-Adresse einschließlich Protokoll und Port. Projektdateien, Prüfergebnisse und Serverabgleich enthalten keine Zugangsdaten. Auf weiteren iPhones ist eine einmalige Eingabe erforderlich.
- Lesen aller von der Station angebotenen I/O-Busse. Suche über Namen, Beschreibung, Klemme, Gerät und Bus. Ein- und Ausgänge werden angezeigt; aktive Ausgangsansteuerung ist nicht implementiert.
- 58 vorbelegte Begriffe aus dem bisherigen Arbeitsstand, eigene Ergänzungen und deaktivierbare Begriffe. Weitere Bezeichnungen stehen einzeln untereinander. Das Verzeichnis gilt für alle Projekte der App.
- Native Spracherkennung und Sprachausgabe, einschließlich Bluetooth-HFP-Kopfhörern. Halbduplex: während der Sprachausgabe wird nicht zugehört. Nur abgeschlossene Erkennungsergebnisse werden als Befehle verarbeitet.
- Lokale Prüfentwürfe, die App-Neustarts überstehen. Ergebnisse und Kommentare werden erst nach ausdrücklichem „Speichern“ bzw. Antippen zum Controller übertragen.
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
3. Station öffnen. Die App meldet sich mit den gespeicherten Zugangsdaten an und lädt die I/O-Testseite. Bei einer bestehenden Station ohne gespeicherte Zugangsdaten einmal **Speichern und verbinden** wählen. Nach erfolgreicher Anmeldung die hinterlegte Identität vor Ort vergleichen und **Identität bestätigt · Lesen** wählen. Eine automatische Seriennummer-Erkennung wird nicht vorausgesetzt. Änderungen an Account oder Passwort sind unter **Zugangsdaten ändern** möglich.
4. Zunächst einen bekannten Eingang auswählen und aktuellen Wert vorlesen lassen. Danach „Wert von Zulufttemperatur Anlage 2.1“ oder einen tatsächlich vorhandenen Punktnamen sprechen.
5. Bei mehreren Treffern „Treffer zwei“ sagen. Die App liest den gewählten Punkt erneut. Anlage 2.1 und 2.10 dürfen nicht verwechselt werden.
6. An einem vorgesehenen Prüfpunkt einen Kommentar vormerken und ausdrücklich speichern. Kommentar und gegebenenfalls Prüfstatus anschließend auch in der LOYTEC-Oberfläche vergleichen.
7. Erst danach Mikrofon, Sprachausgabe und Headset-Sitzung mit dem tatsächlichen Kopfhörer prüfen. Verbindungsabbruch und Konfliktfälle stehen in `docs/GERAETETEST.md`.

Die App bleibt für die Headset-Sitzung geöffnet und verhindert dabei den automatischen Ruhezustand. Sperren, App-Wechsel, Audio-Unterbrechungen oder das Trennen des Headsets pausieren die Sitzung. Hintergrundbetrieb bei gesperrtem iPhone und Headset-Tastensteuerung sind noch nicht umgesetzt. Die Sprachfunktion startet nicht selbständig nach einer Unterbrechung.

Lokale deutsche Spracherkennung ist der Standard und hängt von Gerät und verfügbarer Sprachunterstützung ab. Ohne diese Unterstützung bleibt die Texteingabe nutzbar. Online-Erkennung durch Apple lässt sich ausdrücklich erlauben. Die App speichert keine Audiodateien. Die Befehls- und Begriffsauswertung verwendet die übernommenen lokalen Regeln; ein externer KI-Dienst ist nicht eingebunden.

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
