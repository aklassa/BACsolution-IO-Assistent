# Update 0.1.5: Anmeldeprüfung und vollständige Diagnose

Unveröffentlichter Quellcode für den nächsten internen TestFlight-Build. Das Update enthält die Änderungen seit 0.1.1 und kann über 0.1.1 bis 0.1.4 kopiert werden. Projekte, gespeicherte Zugangsdaten und Zertifikatsfreigaben verwenden das bisherige Format.

## Was der bisherige Log belegt

Der Gerätelog aus 0.1.4 (9) bestätigt einen erreichbaren TCP-Port, HTTP 200 und eine geladene Controller-Seite. Danach endet die Verbindung in der Phase „Anmeldeseite prüfen“, bevor der protokollierte Anmeldeauftrag beginnt. Der Grund wird in 0.1.4 beim Beenden nicht in die kopierte Diagnose übernommen. Das ist ein bestätigter Fehler im Diagnosecode. Welche Bedingung die Anmeldung auf dem konkreten Controller abbricht, lässt sich aus diesem Log noch nicht feststellen.

## Änderungen

- Ein Abbruch zeigt direkt im Verbindungsdialog einen deutlich gekennzeichneten Hinweis mit Fehlertext, Diagnosecode und „Diagnose kopieren“.
- Der kopierte Bericht enthält immer den letzten Status sowie den Abbruchgrund. Er zeigt, ob für genau diese Station und Controller-Adresse Zugangsdaten im Schlüsselbund vorhanden sind.
- Die Seitenprüfung meldet ausschließlich feste Ja/Nein-Merkmale: Formular und Eingabefelder vorhanden, richtige Formularzuordnung, POST-Methode, LOYTEC-Merkmale, Sitzungstoken vorhanden und notwendige Passwortbestätigung. Skript- und Ressourcenfehler werden gezählt; feste Kategorien kennzeichnen den ersten Fehler und betroffene bekannte Skripte. Feldinhalte, Accountname, Passwort, Tokenwerte, URLs der Ressourcen, HTML und rohe JavaScript-Fehlermeldungen werden nicht aufgenommen.
- Fehlt das Formular nach dem Laden noch vollständig, prüft die App den Seitenaufbau für drei Sekunden erneut. Diese Wiederholungen lesen nur die Seite. Es bleibt bei höchstens einem Passwort-Anmeldeauftrag pro ausdrücklich gestartetem Verbindungsversuch.
- Ein vollständig erkanntes LOYTEC-Formular kann auch ohne den alten globalen `LoginPage`-Konstruktor verwendet werden, wenn Controller-Metadaten, Formularcontainer und Sitzungstoken es zusätzlich bestätigen. Die POST-Methode wird am echten Formularattribut gelesen, damit ein gleichnamiges Formularelement sie nicht verdeckt.
- Abgebrochene Versuche ignorieren verspätete Ladeereignisse. Technische WebKit-Fehler erhalten feste Codes, ohne Inhalte aus der Controller-Seite in den Bericht zu übernehmen.

Die zusätzlichen Formularfälle sind mit simulierten Seiten geprüft. Sie sind mögliche Fehlerquellen, keine nachgewiesene Ursache des gemeldeten Gerätelogs. Ein erfolgreicher Login auf dem Controller ist für dieses Update noch nicht bestätigt.

## Einspielen

1. ZIP entpacken. Die enthaltenen Dateien und Unterordner nach `C:\BACsolution_IO_iPhone_Arbeitsstand` kopieren und vorhandene Dateien ersetzen.
2. In PowerShell nacheinander ausführen. Bei einem Git-Fehler vor dem nächsten Befehl den Fehler beheben:

```powershell
Set-Location "C:\BACsolution_IO_iPhone_Arbeitsstand"
git add .
git commit -m "Anmeldepruefung und vollstaendige Diagnose 0.1.5"
git push
```

3. In Codemagic auf Branch `main` den bestehenden Workflow **BACsolution IO - internes TestFlight** starten (`ios-testflight-internal`). Er verwendet die bestehende Signierung und vergibt die Buildnummer automatisch.
4. Den neuen Build über TestFlight installieren. In der App unter **Abgleich → App** muss **0.1.5** stehen.

## Erneut prüfen

Die bestehende Station öffnen und einen Verbindungsversuch starten. Bei Erfolg erscheint „Angemeldet. I/O-Testseite bereit.“ Bei einem Abbruch **Diagnose kopieren** direkt unter dem Fehlerhinweis antippen und den vollständigen Text senden. Der Abbruchgrund ist in diesem Text enthalten; eine zusätzliche Fehlermeldung muss nicht gesucht werden.

## Prüfstand

89 portable Tests bestanden, keine Fehler. Ein nativer Swift-Zertifikatstest wird mangels macOS lokal übersprungen und läuft in Codemagic. Projektstruktur und Syntax aller 18 App-Swift-Dateien sowie einer Swift-Testdatei geprüft. Kein lokaler Swift-Typecheck oder Xcode-Build, kein Live-Test am Controller. Upload, Buildstart und Veröffentlichung wurden nicht ausgeführt.
