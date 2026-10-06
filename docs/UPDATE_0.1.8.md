# Update 0.1.8: Reservefilter und KI-Einrichtung

Anmeldung und Datenpunktanzeige wurden vom Nutzer mit 0.1.7 bestätigt. Dieses kumulative Quellcode-Update kann über 0.1.1 bis 0.1.7 kopiert werden. Die Anmeldebrücke bleibt unverändert.

## Reservepunkte ausblenden

Unter **Prüfen → Datenpunkte** gibt es den Schalter **Reserve ausblenden** und den Zähler **sichtbare Punkte von Gesamtzahl**. Der Filter ist zunächst aktiviert und merkt sich die gewählte Einstellung für alle Stationen auf diesem iPhone.

Als Reserve gelten eindeutige Bezeichnungen in Name oder Beschreibung: **Reserve, RES, Spare, Unused, unbelegt, unbenutzt, nicht belegt, nicht benutzt, nicht verwendet, not used**. Groß-/Kleinschreibung, AKS-Trennzeichen und angehängte Nummern wie `RES01` werden berücksichtigt. Zusammengesetzte Namen wie `Reservepumpe`, `Druckreserve` und `Resetsignal` bleiben sichtbar. Nullwerte, Offline-Zustände und nicht getestete Punkte sind kein Reservekennzeichen.

Der Filter gilt auch für die lokale Sprachsuche, **Weiter/Zurück** sowie KI-Suche und **nächster Datenpunkt**. Die Controller-Reihenfolge bleibt erhalten. Bereits ausgewählte Punkte und ihre Prüfentwürfe bleiben sichtbar und gespeichert. Zum Ändern des Filters ein laufendes KI-Gespräch zuerst beenden. Beim Ausschalten werden alle Punkte wieder angezeigt.

## KI-Gespräch über die OpenAI-API

Der vorhandene Gesprächsmodus kann Datenpunkte suchen, aktuelle Werte vorlesen, Änderungen beobachten und Referenzwerte vergleichen. Kommentare werden vollständig vorgelesen und erst nach Bestätigung gespeichert und zurückgelesen.

Neu ist der direkte Zugang **Prüfen → KI-Verbindung einrichten**. In den Einstellungen die Adresse und den Zugangsschlüssel des eigenen HTTPS-Dienstes hinterlegen und **Einstellungen speichern und KI-Server prüfen** wählen. Die App unterscheidet fehlende Konfiguration, falschen Server-Zugangsschlüssel und einen fehlenden bzw. älteren Serverendpunkt.

Die Statusprüfung startet weder Mikrofon noch KI-Sitzung und sendet keine Datenpunkte. Sie bestätigt, ob der Server erreichbar und ein API-Schlüssel hinterlegt ist. Die tatsächliche OpenAI-Verbindung wird erst mit **KI-Gespräch starten** hergestellt.

Für die Nutzung werden ein eigener OpenAI-API-Zugang und ein erreichbarer HTTPS-Dienst benötigt. Ein ChatGPT-Abonnement ersetzt die separat abgerechnete API nicht. Der OpenAI-API-Schlüssel bleibt auf dem Server; in die App kommt der Zugangsschlüssel des eigenen Dienstes. Einrichtung: `docs/KI_GESPRAECH.md`. In dieser Bearbeitung wurden kein Server bereitgestellt und keine API-Anfragen mit einem echten Schlüssel ausgeführt.

## Update einspielen

1. ZIP entpacken und die enthaltenen Dateien und Unterordner nach `C:\BACsolution_IO_iPhone_Arbeitsstand` kopieren. Vorhandene Dateien ersetzen.
2. PowerShell-Befehle nacheinander ausführen. Bei einem Fehler zunächst diesen beheben:

```powershell
Set-Location "C:\BACsolution_IO_iPhone_Arbeitsstand"
git add .
git commit -m "Reservefilter und KI-Einrichtung 0.1.8"
git push
```

3. In Codemagic auf `main` den bestehenden Workflow **BACsolution IO - internes TestFlight** (`ios-testflight-internal`) starten.
4. Über TestFlight installieren und unter **Abgleich → App** Version **0.1.8** prüfen. Die Buildnummer setzt Codemagic.
5. Station öffnen, Reservefilter ein-/ausschalten und einen bekannten Wert lesen. Projekt und Zugangsdaten bleiben erhalten.
6. Wenn bereits ein Abgleich-/KI-Dienst betrieben wird: auch dessen `SyncServer/`- und `Shared/`-Dateien aktualisieren und mit der vorhandenen Konfiguration neu starten. Der neue Statusendpunkt gehört zur Serveränderung, nicht allein zur iPhone-App.

## Prüfung

108 portable Tests bestanden. Neue Fälle prüfen Reservebezeichnungen, Gegenbeispiele, Filter in beiden Navigationsrichtungen, eine ausgeblendete aktuelle Auswahl und KI-Suchfilter. Der neue Serverstatus wurde über lokales HTTP mit gültiger/fehlender Authentifizierung, fehlendem Schema und fehlender API-Konfiguration geprüft. Die Statusprüfung erzeugt keine OpenAI-Anfragen und verbraucht keine Sitzungsfreigaben.

Projektstruktur sowie Syntax von 18 App-Swift-Dateien und einer Swift-Testdatei geprüft. Der native Zertifikatstest benötigt macOS und wurde lokal übersprungen; er bleibt im Codemagic-Workflow enthalten. Ein echter Swift-Typecheck, Xcode-Build, Filtertest am iPhone und Live-KI-Gespräch stehen für 0.1.8 aus. Es wurde nichts hochgeladen oder veröffentlicht.

Quellen zur KI-Anbindung: [OpenAI Client Secrets](https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create), [Realtime API](https://developers.openai.com/api/docs/guides/realtime), [separate API-Abrechnung](https://learn.chatgpt.com/docs/pricing).
