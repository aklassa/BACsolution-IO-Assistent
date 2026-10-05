# Update 0.1.7: Anmeldeformular ohne Gerätekennung erkennen

Quellcode für den nächsten internen TestFlight-Build. Das kumulative Update kann über 0.1.1 bis 0.1.6 kopiert werden. Upload und Buildstart führt der Nutzer selbst aus.

## Befund und Korrektur

Der Log von **0.1.6 (11)** belegt: Der Controller antwortet mit HTTP 200. Formular, zusammengehörige Eingabefelder, POST-Methode, Logincontainer und Sitzungstoken sind vorhanden. Die Gerätekennung ist weder über die verwendeten JavaScript-Variablen noch über den HTML-Leser verfügbar (`controllerBrand=nein`, `baseFromHTML=nein`). Die bisherige Bedingung verlangt diese Kennung trotzdem. Deshalb bricht die App vor dem eigentlichen Anmeldeauftrag mit `login-form-unrecognized` ab.

0.1.7 erkennt diese Kombination: Auf einem bekannten Anmeldepfad an der exakt gewählten Controller-Adresse genügt die vollständige LOYTEC-Formularstruktur mit eindeutigem Sitzungstoken. Vorhandene widersprüchliche Metadaten verhindern diese Erkennung weiterhin. Es wird höchstens ein Anmeldeauftrag pro ausdrücklich gestarteter Verbindung gesendet. Eine positive Formularprüfung gilt noch nicht als erfolgreiche Anmeldung: Der Controller muss den Auftrag bestätigen, anschließend wird die authentifizierte I/O-Seite geprüft.

Der bisherige Test hatte zwar fehlende JavaScript-Variablen simuliert, aber weiterhin Metadaten im HTML bereitgestellt. Der neue Test lässt auch diese Daten weg und prüft sämtliche Ja/Nein-Merkmale deines Logs. Mit dem unveränderten 0.1.6-Code scheitert er, mit der Korrektur besteht er. Beide Tokenquellen – Inline-Daten und das zugehörige versteckte Formularfeld – werden jeweils für HTTP und HTTPS nachgebildet.

## Einspielen

1. ZIP entpacken. Die enthaltenen Dateien und Unterordner direkt nach `C:\BACsolution_IO_iPhone_Arbeitsstand` kopieren und vorhandene Dateien ersetzen.
2. In PowerShell nacheinander ausführen. Bei einem Fehler zuerst dessen Ursache beheben:

```powershell
Set-Location "C:\BACsolution_IO_iPhone_Arbeitsstand"
git add .
git commit -m "LOYTEC-Formularerkennung korrigiert 0.1.7"
git push
```

3. In Codemagic auf `main` den vorhandenen Workflow **BACsolution IO - internes TestFlight** starten (`ios-testflight-internal`). Die Buildnummer wird automatisch vergeben.
4. Über TestFlight installieren. Unter **Abgleich → App** muss **0.1.7** stehen.
5. Die bestehende Station öffnen und einmal verbinden. Gespeicherte Projekte und Zugangsdaten müssen nicht neu angelegt werden.

Im Log wird jetzt zunächst **Anmeldeprüfung: login-form-ready**, danach **Einmalige Anmeldung über /webui/login** erwartet. **Anmeldeantwort: login-confirmed** bedeutet, dass der Controller die Anmeldung bestätigt hat. Erst **I/O-Testseite und Anmeldung bestätigt** gibt die Verbindung frei. Bei einem weiteren Abbruch **Diagnose kopieren** wählen und den vollständigen Text senden.

## Verifikation und Grenzen

99 portable Tests bestanden, darunter der neue Regressionstest und Gegenfälle für unvollständige Formulare, fehlende bzw. ungültige Token, fremde Ziele, abgewiesene Passwörter und unbestätigte Antworten. Der simulierte Ablauf umfasst die Anmeldung ohne Gerätekennung, anschließendes Laden der authentifizierten Metadaten, frisches Lesen und einen separat bestätigten Kommentar. Zwei zusätzliche Prüfungen mit der ursprünglich gelieferten Controller-HTML-Datei bestanden.

Projektstruktur geprüft. Die Swift-Dateien, Signierung und Codemagic-Konfiguration sind gegenüber 0.1.6 unverändert. Der native Zertifikatstest wurde lokal mangels macOS/Swift übersprungen und bleibt im Codemagic-Testlauf enthalten. Kein Xcode-Build oder echter Controller-Login wurde für dieses Update ausgeführt. Der tatsächliche Erfolg muss am iPhone bestätigt werden.

Originalseiten, Anlagendaten und Sitzungstoken sind nicht im Paket enthalten. Aktive Ausgangsansteuerung ist weiterhin nicht implementiert.
