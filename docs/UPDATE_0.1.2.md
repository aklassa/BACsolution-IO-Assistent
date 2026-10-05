# Update 0.1.2 – Controller-Zugangsdaten

## Änderungen

- Account und Passwort werden beim Anlegen eines Projekts mit erster Station und beim Ergänzen weiterer Stationen abgefragt.
- Speicherung im Schlüsselbund dieses iPhones, getrennt nach Station und genauer Controller-Adresse. Passwörter werden nicht in Projektdateien oder zum Abgleichserver geschrieben.
- Bereits vorhandene Projekte bleiben verwendbar. Beim Öffnen einer Station können Zugangsdaten einmalig ergänzt und später geändert werden.
- Automatische Anmeldung mit gespeicherten Zugangsdaten über die LOYTEC-8.4.20-Schnittstelle; anschließend Laden der I/O-Testseite.
- Die Webseite dient ausschließlich als Transport. Die bisher abstürzenden Web-Eingabefelder werden nicht mehr angezeigt oder angetippt.
- Fehler und Wartezeit bei der Anmeldung werden begrenzt. Kein automatisches Wiederholen abgewiesener Anmeldeversuche; Hinweise zu einer erforderlichen Passwortänderung werden nicht automatisch bestätigt.

Der ursprüngliche Absturz ist ohne Geräteprotokoll nicht abschließend diagnostiziert. Der neue Anmeldeweg muss auf dem betroffenen iPhone geprüft werden. Es wurde keine neue Version veröffentlicht oder hochgeladen.

## Windows-Projekt aktualisieren

Die ZIP-Datei `BACsolution_IO_Update_0.1.2.zip` enthält nur geänderte/neue Projektdateien mit ihren Unterordnern. Vor dem Entpacken bei eigenen Änderungen eine Sicherung des bisherigen Projektordners erstellen. Die Dateien in `C:\BACsolution_IO_iPhone_Arbeitsstand` entpacken und die betroffenen Dateien ersetzen. Die vorhandene `codemagic.yaml`, Signierungsdateien und Git-Einstellungen gehören nicht zu diesem Update.

Danach in PowerShell:

```powershell
Set-Location "C:\BACsolution_IO_iPhone_Arbeitsstand"
git diff --stat
git add App/ControllerCredentials.swift App/LoytecSession.swift App/ProjectViews.swift Shared/login.js Resources/ControllerLogin.js Resources/Info.plist scripts/bundle.mjs Tests/login.test.mjs BACsolution.xcodeproj/project.pbxproj README.md docs/GERAETETEST.md docs/PRUEFSTAND.md docs/UPDATE_0.1.2.md
git commit -m "Controller-Zugangsdaten und native Anmeldung 0.1.2"
git push
```

In Codemagic einen neuen Build des Branches `main` mit dem vorhandenen Workflow **BACsolution IO - internes TestFlight** starten. Codemagic erzeugt die Ressourcen erneut und vergibt die nächste Buildnummer. Nach erfolgreichem Upload und Verarbeitung durch Apple den Build der internen Testgruppe zuordnen und die App über TestFlight aktualisieren.

## Kurzer iPhone-Test

1. Eine bereits angelegte Station öffnen. Account und Passwort in den nativen Feldern eingeben und **Speichern und verbinden** wählen.
2. Erfolgreiche Anmeldung abwarten, Stationskennung am Gerät vergleichen und **Identität bestätigt · Lesen** wählen.
3. App vollständig schließen und erneut öffnen. Dieselbe Station wählen; Account und Passwort sollen nicht erneut eingegeben werden müssen.
4. Unter **Zugangsdaten ändern** prüfen, dass beide Eingabefelder ohne Absturz bedienbar sind.
5. Ein neues Projekt bzw. eine weitere Station anlegen und prüfen, dass die Zugangsdaten bereits dort erfasst werden.

Die Zugangsdaten gelten für dieses iPhone. Auf einem anderen Gerät werden sie einmalig erneut eingegeben. Eine durch Abgleich geänderte Controller-Adresse übernimmt das vorherige Passwort nicht automatisch.

## Technische Grundlage

Der Login verwendet den in der bereitgestellten LOYTEC-Datei `base.js`, Klasse `LoginPage`, nachvollzogenen POST `/webui/login` mit `X-Create-Session: 1`, aktuellem CSRF-Token und Cookie-Sitzung. Keine Original-Controller-Datei und keine echten Zugangsdaten sind Bestandteil des Updates.

- [Apple: gerätegebundener Schlüsselbund, Zugriff nur bei entsperrtem Gerät](https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly)
- [Apple: strukturierte JavaScript-Argumente für WKWebView](https://developer.apple.com/documentation/webkit/wkwebview/callasyncjavascript(_:arguments:in:contentworld:))
