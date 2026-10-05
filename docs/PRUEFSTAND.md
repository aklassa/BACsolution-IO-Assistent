# Prüfstand für Arbeitsstand 0.1.2 vom 5. Oktober 2026

**Neuer Quellcode-Arbeitsstand, noch nicht mit Xcode gebaut oder auf dem iPhone getestet.** Für die vorherige Version 0.1.1 wurden ein erfolgreicher Codemagic-Simulator-Build und der App-Start auf dem iPhone vom Anwender gezeigt. Dort trat der gemeldete Absturz beim Antippen von Account/Passwort in der Controller-Webseite auf. Ohne iPhone-Absturzprotokoll ist die konkrete Ursache nicht belegt.

0.1.2 ersetzt diese Eingabe durch native SwiftUI-Felder. Die Controller-Webansicht wird nicht mehr in ein Fenster eingebunden. Gespeicherte Zugangsdaten werden strukturiert an die in der bereitgestellten Firmware nachvollzogene LOYTEC-Anmeldeschnittstelle übergeben.

| Bereich | Stand |
|---|---|
| Mitgelieferte Node-Tests für Version 0.1.2, ohne Anlagendateien | 72 bestanden, einschließlich elf neuer Prüfungen der Login-Brücke |
| Vorherige Prüfung der unveränderten gemeinsamen Logik einschließlich der zwei bereitgestellten LOYTEC-Beispiele | 63 bestanden; Anlagendateien nicht mitgeliefert |
| Generierte JavaScript-Brücken | Suche, Begriffsvalidierung und strukturierte Controller-Aufrufe unter Node geprüft |
| Login-Brücke | Erfolgs- und Fehlerantworten, Ursprung/Port, unbekannte Formulare, CSRF, Sonderzeichen, Anmeldesperre, Timeout, Pflichtaktion am Controller und Geheimnisfreiheit der Rückgabe unter Node geprüft |
| Native Schlüsselbundspeicherung | Implementiert, nur bei entsperrtem iPhone und gerätegebunden; tatsächliches Lesen/Schreiben nach Installation noch am Gerät zu prüfen |
| Abgleichdienst | Konflikte bei zwei Clients, Wiederholungen nach Neustart, Offline-Folgeänderungen, historische Konfigurationsstände, unveränderliche Prüfhistorie und API-Anmeldung geprüft |
| Xcode-Projektstruktur | Quelldateien, Ressourcen, Berechtigungen, Objektverweise und gemeinsames Build-Schema geprüft |
| Swift-Quelldateien | 12 Dateien syntaktisch mit Tree-sitter geprüft; keine Syntaxfehler. Typprüfung und native Ausführung stehen noch aus |
| Swift-Typprüfung, Apple-SDK-Verfügbarkeit und Verlinkung | Offen; Xcode ist in dieser Arbeitsumgebung nicht vorhanden |
| Native Oberfläche, WebKit-Sitzung und ursprünglicher Absturz | Beanstandeter Web-Eingabeweg entfernt; tatsächlicher Gerätetest noch offen |
| Mikrofon, Spracherkennung und Headset | Offen; auf echtem iPhone zu prüfen |
| Controller-Schreibvorgang aus der iPhone-App | Offen; in dieser Sitzung keine Verbindung zu einem realen Controller hergestellt |
| Gemeinsamer Server | Ausführbarer Referenzcode vorhanden; kein Server bereitgestellt |
| Nahtloses Weiterprüfen in der bestehenden PC-Erweiterung | Offen; die PC-Oberfläche ist noch an die gemeinsame API anzuschließen |
| Codemagic / TestFlight | Version 0.1.2 für die bestehenden manuellen Workflows vorbereitet; dieser neue Stand wurde nicht hochgeladen |
| Versionsanzeige | Version und Build werden aus der gebauten App gelesen und unter Abgleich → App angezeigt |

Die übernommenen Desktop-Interaktionstests laufen mit Fixtures der bisherigen Erweiterung. Sie belegen das Verhalten der bestehenden gemeinsamen Logik, **nicht** die native SwiftUI-Bedienung. Neue Tests prüfen zusätzlich die generierten nativen JavaScript-Ressourcen und die zentrale API.

Reproduzierbar ohne Anlagendaten:

```sh
npm run prepare
npm test
python3 scripts/check_project.py
```

Die beiden zusätzlichen LOYTEC-Tests werden nur ausgeführt, wenn `LOYTEC_SOURCE_HTML` und `LOYTEC_SOURCE_CSV` auf die ursprünglichen lokalen Dateien zeigen. Die Dateien werden nicht im Quellcodepaket gespeichert.

Logik- und Strukturprüfungen ersetzen keinen Xcode-Build. Nächster Schritt ist der vorhandene manuelle Codemagic-Build und danach die Anmeldung mit gespeicherten Zugangsdaten auf dem betroffenen iPhone. Erst die Prüfungen aus `GERAETETEST.md` können das tatsächliche native Verhalten und die Behebung des gemeldeten Absturzes bestätigen.
