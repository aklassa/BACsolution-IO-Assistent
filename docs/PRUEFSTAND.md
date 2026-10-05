# Prüfstand für Testversion 0.1.1 vom 5. Oktober 2026

**Unveröffentlichter Quellcode-Arbeitsstand. Kein iOS-Build, keine Signierung und kein Geräte- oder Headset-Test ausgeführt.**

| Bereich | Stand |
|---|---|
| Mitgelieferte Node-Tests für Version 0.1.1, ohne Anlagendateien | 61 bestanden |
| Vorherige Prüfung der unveränderten gemeinsamen Logik einschließlich der zwei bereitgestellten LOYTEC-Beispiele | 63 bestanden; Anlagendateien nicht mitgeliefert |
| Generierte JavaScript-Brücken | Suche, Begriffsvalidierung und strukturierte Controller-Aufrufe unter Node geprüft |
| Abgleichdienst | Konflikte bei zwei Clients, Wiederholungen nach Neustart, Offline-Folgeänderungen, historische Konfigurationsstände, unveränderliche Prüfhistorie und API-Anmeldung geprüft |
| Xcode-Projektstruktur | Quelldateien, Ressourcen, Berechtigungen, Objektverweise und gemeinsames Build-Schema geprüft |
| Swift-Quelldateien | 11 Dateien syntaktisch mit Tree-sitter geprüft; keine Syntaxfehler |
| Swift-Typprüfung, Apple-SDK-Verfügbarkeit und Verlinkung | Offen; Xcode ist in dieser Arbeitsumgebung nicht vorhanden |
| Native Oberfläche, WebKit-Sitzung, Mikrofon, Spracherkennung und Headset | Offen; auf echtem iPhone zu prüfen |
| Controller-Schreibvorgang aus der iPhone-App | Offen; in dieser Sitzung keine Verbindung zu einem realen Controller hergestellt |
| Gemeinsamer Server | Ausführbarer Referenzcode vorhanden; kein Server bereitgestellt |
| Nahtloses Weiterprüfen in der bestehenden PC-Erweiterung | Offen; die PC-Oberfläche ist noch an die gemeinsame API anzuschließen |
| Codemagic / TestFlight | Version 0.1.1, zwei manuelle Workflows, interne TestFlight-Exportoption, Buildnummerierung und App-Icon vorbereitet; noch kein Remote-Build oder Upload |
| Versionsanzeige | Version und Build werden aus der gebauten App gelesen und unter Abgleich → App angezeigt |

Die übernommenen Desktop-Interaktionstests laufen mit Fixtures der bisherigen Erweiterung. Sie belegen das Verhalten der bestehenden gemeinsamen Logik, **nicht** die native SwiftUI-Bedienung. Neue Tests prüfen zusätzlich die generierten nativen JavaScript-Ressourcen und die zentrale API.

Reproduzierbar ohne Anlagendaten:

```sh
npm run prepare
npm test
python3 scripts/check_project.py
```

Die beiden zusätzlichen LOYTEC-Tests werden nur ausgeführt, wenn `LOYTEC_SOURCE_HTML` und `LOYTEC_SOURCE_CSV` auf die ursprünglichen lokalen Dateien zeigen. Die Dateien werden nicht im Quellcodepaket gespeichert.

Die Syntaxprüfung ersetzt keinen Xcode-Build. Als nächster technischer Prüfpunkt ist der mitgelieferte manuelle macOS-Build-Workflow oder ein lokaler Xcode-Build vorgesehen. Erst ein erfolgreicher Entwicklungsbuild und die Prüfungen aus `GERAETETEST.md` können die tatsächliche iPhone-Funktion bestätigen.
