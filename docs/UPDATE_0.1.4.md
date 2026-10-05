# Update 0.1.4: Controller-Verbindung und HTTPS-Zertifikate

Unveröffentlichter Quellcode für den nächsten internen Test. Das Update enthält alle Änderungen seit 0.1.1 und kann über 0.1.1, 0.1.2 oder 0.1.3 kopiert werden. Projekte, Zugangsdaten und Entwürfe bleiben im bisherigen Format. App nicht deinstallieren.

## Installieren und bauen

1. ZIP entpacken und die enthaltenen Dateien und Unterordner nach `C:\BACsolution_IO_iPhone_Arbeitsstand` kopieren. Vorhandene Dateien ersetzen.
2. In PowerShell nacheinander ausführen:

```powershell
Set-Location "C:\BACsolution_IO_iPhone_Arbeitsstand"
git add .
git commit -m "Controller-Verbindung und Zertifikatsfreigabe 0.1.4"
git push
```

3. In Codemagic auf `main` den bisherigen Workflow **BACsolution IO - internes TestFlight** starten. Apple-Integration, Bundle-ID und Signierung bleiben unverändert. Die Buildnummer setzt Codemagic.
4. Den neuen internen TestFlight-Build installieren. Unter **Abgleich → App** muss **0.1.4** stehen. Die Verbindungsdiagnose zeigt zusätzlich die Buildnummer.

## HTTPS zuerst prüfen

Das gemeldete HTTPS-Problem betrifft ein von iOS nicht bestätigtes Zertifikat. Dafür zeigt die App jetzt die genaue Adresse, den Zertifikatsnamen und den SHA-256-Fingerabdruck an. Vor der Freigabe werden keine Anmeldedaten gesendet.

Den Fingerabdruck mit dem Zertifikat am Controller bzw. mit der Zertifikatsanzeige auf einem bereits geprüften PC vergleichen. Erst danach **Fingerabdruck am Controller geprüft** aktivieren und **Zertifikat speichern und verbinden** wählen. Die gespeicherten Zugangsdaten werden anschließend verwendet. Ein geändertes Zertifikat muss erneut geprüft werden.

Die Freigabe gilt nur für die gewählte Station, HTTPS-Adresse einschließlich Port und das konkrete Zertifikat auf diesem iPhone. Sie kann unter **Gespeichertes Controller-Zertifikat** entfernt werden. Sie gilt nicht für andere Controller, den Abgleichserver oder den KI-Dienst.

## HTTP und Diagnose

Der bisherige HTTP-Screenshot zeigt nur den Stillstand beim Laden; die Ursache ist noch offen. Der Transport erhält nun eine reguläre Anbindung an das App-Fenster. Die vorhandene native Eingabe bleibt erhalten, Browser-Fokus und Browser-Texteingabe sind unterbunden. HTTP wird ausdrücklich als HTTP angefragt. Eine vom Controller erzwungene Weiterleitung zu einer anderen Adresse oder zu HTTPS wird gemeldet.

Vor jedem Versuch wird ausschließlich der konfigurierte TCP-Port geprüft. Meldet die App **Port antwortet nicht**, HTTP-/HTTPS-Port, Adresse und WLAN/VPN prüfen. Falls nötig, unter **iPhone-Einstellungen → Datenschutz & Sicherheit → Lokales Netzwerk** den Zugriff für BACsolution I/O erlauben und neu verbinden. Ein Porttest sendet keine Zugangsdaten und ändert keine Controllerwerte.

Falls die Anmeldung weiter scheitert: im Verbindungsdialog **Verbindungsdiagnose → Diagnose kopieren** wählen und den Text zusammen mit der sichtbaren Fehlermeldung senden. Die Diagnose enthält die Controller-Adresse und technische Ereignisse, keine Passwörter oder Sitzungstoken. Über **Controller in Safari prüfen** lässt sich derselbe I/O-Pfad auf dem iPhone gegenprüfen.

## Prüfung und Grenzen

82 portable Tests bestanden; Projektstruktur und Swift-Syntax geprüft. Der native Zertifikatstest mit 16 Fällen läuft zusätzlich in Codemagic; im hiesigen Linux-Arbeitsbereich ist er übersprungen. Xcode-Build, tatsächlicher HTTPS-Handshake und Controller-Login auf dem iPhone stehen noch aus. Das Update benötigt keinen KI-Server. Es wurde weder hochgeladen noch veröffentlicht.
