# Update 0.1.3: Anmeldung und geführter KI-Test

Enthält alle Änderungen seit 0.1.1, einschließlich der nativen Zugangsdaten aus 0.1.2. Auf beide Stände anwendbar. Projekte, Zugangsdaten und Entwürfe behalten ihr Format. Die App nicht deinstallieren.

1. ZIP entpacken und die enthaltenen Dateien/Ordner nach `C:\BACsolution_IO_iPhone_Arbeitsstand` kopieren. Vorhandene Dateien ersetzen.
2. In PowerShell ausführen:

```powershell
Set-Location "C:\BACsolution_IO_iPhone_Arbeitsstand"
git add .
git commit -m "Login-Fortschritt und gefuehrter KI-Test 0.1.3"
git push
```

3. In Codemagic den bisherigen manuellen Workflow **BACsolution IO – internes TestFlight** auf `main` starten. `codemagic.yaml`, Apple-Integration und Signierung bleiben unverändert. CI setzt die Buildnummer.
4. Nach Verarbeitung in App Store Connect den neuen internen TestFlight-Build installieren. Unter **Abgleich → App** muss Version **0.1.3** stehen.

## Zuerst Anmeldung prüfen

Station mit gespeicherten Zugangsdaten öffnen. Die Verbindung zeigt Seite laden, Anmeldestatus prüfen, Zugangsdaten anmelden und I/O-Testseite laden. Nach Erfolg **Identität bestätigt · Lesen** wählen.

Die Controller-Webseite bleibt ohne Eingabefläche. Ihre JavaScript-Ausführung wird bei geöffneter App ausdrücklich aktiv gehalten. Nach spätestens 30 Sekunden endet ein erfolgloser Versuch mit der erreichten Phase. Ein Versuch kann abgebrochen werden. Keine automatischen Passwort-Wiederholungen.

Bei erneutem Stillstand vollständige Meldung und App-Version festhalten. Controller-Adresse zusätzlich in Safari auf demselben iPhone prüfen. Keine Passwörter in Feedback schreiben.

## KI-Modus

Der Login-Fix benötigt keinen KI-Server. Für **KI-Gespräch starten** ist die Einrichtung aus `KI_GESPRAECH.md` erforderlich. Codemagic baut die App, betreibt aber keinen dauerhaften KI-Server.

Die KI-Funktionen sind im Quellcode integriert, jedoch noch nicht mit einem echten API-Konto und iPhone durchgetestet. Dies ist ein interner Teststand.
