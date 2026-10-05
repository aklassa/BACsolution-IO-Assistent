# Geführter I/O-Test mit Sprache

## Enthaltener Ablauf

1. Controller verbinden, Stationsidentität bestätigen, Prüfername speichern.
2. Unter **Abgleich & Einstellungen** HTTPS-Adresse und Zugangsschlüssel des eigenen Abgleich-/KI-Dienstes speichern.
3. **KI-Gespräch mit OpenAI erlauben** aktivieren. Die Freigabe allein startet keine Übertragung.
4. Unter **Prüfen** auf **KI-Gespräch starten** tippen. App geöffnet lassen, Headset verwenden.
5. „Wir prüfen die Zulufttemperatur von Anlage zwei eins.“ Die KI sucht in wirklichen Stationsdaten. Mehrere Treffer werden zur Auswahl angeboten.
6. „Beobachte den Wert, ich erwärme den Fühler.“ Abfrage frühestens drei Sekunden nach dem vorigen Vorgang. Numerische Änderungen ab standardmäßig 0,5 in der Punkt-Einheit, binäre Zustandswechsel bei jeder Änderung. Die Schwelle kann im Gespräch genannt werden. Stichproben, keine kontinuierliche Messaufzeichnung.
7. „Mein Messgerät zeigt 26 Grad. Schreib die Abweichung dazu.“ Die App liest frisch, vergleicht nur gleiche Einheiten und berechnet Controller minus Referenz. Bestehende Kommentare werden beibehalten und ergänzt. Ohne passende Einheit wird nachgefragt.
8. Punktzuordnung und vollständiger Kommentar werden mit der lokalen iPhone-Stimme vorgelesen. In diesem Abschnitt pausiert das Mikrofon. Danach „Ja“ oder „Nein“ sagen.
9. „Ja, danach zum nächsten Temperaturfühler.“ Zuerst wird genau der vorgelesene Kommentar gespeichert und zurückgelesen. Erst eine erfolgreiche Bestätigung erlaubt die Fortsetzung. Ein offener/unklarer Prüfentwurf verhindert den Wechsel über `next_point`.

Zum Korrigieren zuerst „Nein“ sagen, dann den richtigen Referenzwert nennen. Bedingte oder widersprüchliche Zustimmungen speichern nicht. Die Freigabe verfällt nach fünf Minuten, einem Sitzungsende oder einer geänderten Zuordnung. Bei Unterbrechung bleibt ein angelegter Entwurf lokal erhalten und kann am Bildschirm geprüft werden.

## Server einrichten

`SyncServer/server.mjs` übernimmt zusätzlich die Freigabe kurzlebiger KI-Sitzungen. Benötigt werden Node.js 22 oder neuer, ein OpenAI-API-Projekt mit Realtime-Zugriff und ein HTTPS-Zugang mit gültigem Zertifikat. Noch kein Server eingerichtet. Ein ChatGPT-Gespräch ist nicht die API-Verbindung dieser App.

Lokaler Serverstart unter Windows:

```powershell
Set-Location "C:\BACsolution_IO_iPhone_Arbeitsstand"
$bacSyncSecret = Read-Host "Zugangsschluessel (mindestens 32 Zeichen)" -AsSecureString
$bacOpenAISecret = Read-Host "OpenAI API-Schluessel" -AsSecureString
$bacSyncPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($bacSyncSecret)
$bacAIPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($bacOpenAISecret)
try {
    $env:BAC_IO_SYNC_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bacSyncPointer)
    $env:OPENAI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bacAIPointer)
    node SyncServer/server.mjs
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bacSyncPointer)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bacAIPointer)
    Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:BAC_IO_SYNC_TOKEN -ErrorAction SilentlyContinue
}
```

Der Dienst lauscht nur auf `127.0.0.1:8787`. Für das iPhone muss ein HTTPS-Reverse-Proxy auf dem Server vorgeschaltet werden. In der App dessen Basisadresse ohne Pfad eintragen, z.B. `https://io.eigene-domain.de` – diese Beispieladresse wird nicht automatisch bereitgestellt. Bei einem vorhandenen Abgleichdienst denselben Zugangsschlüssel und dieselbe Datendatei beibehalten.

`OPENAI_API_KEY` ausschließlich in die Serverumgebung setzen. Weder in Swift, GitHub noch in Codemagic eintragen; Codemagic benötigt ihn zum Bauen nicht. Die App erhält nach Prüfung ihres Zugangsschlüssels ein kurzlebiges `ek_`-Token. Tokens nicht protokollieren. Audio geht direkt vom iPhone an OpenAI, Controller-Zugriffe bleiben lokal. Der Controller benötigt keinen öffentlichen Internetzugang.

Optional: `BAC_IO_VOICE_MODEL` legt das serverseitige Realtime-Modell fest; Standard `gpt-realtime`. Ein anderes Modell muss das verwendete GA-Realtime-Protokoll, Audio und Werkzeuge unterstützen und im API-Projekt freigegeben sein.

## Grenzen dieses Teststands

- Noch kein Live-Test mit kostenpflichtiger KI-Verbindung und kein nativer Build für 0.1.3. Portable Tests simulieren den API-Dienst.
- Internet und gleichzeitige Controller-Erreichbarkeit erforderlich. Keine automatische neue Sitzung oder Schreibwiederholung nach Abbruch. Lokale Sprach-/Texteingabe bleibt nutzbar.
- Zehn Minuten je App-Testabschnitt, höchstens zwölf Sitzungsfreigaben je Serverprozess/Stunde. Diese Grenzen sind keine garantierte Geldobergrenze. Abrechnung und Projektlimits im API-Konto gesondert verwalten.
- Sprach- und KI-Fehler sind möglich. Punktname, Einheit und Referenz werden vor einer Kommentar-Speicherung vorgelesen und angezeigt.
- Prüfstatus weiterhin über Oberfläche/lokalen Befehlsmodus setzen. Die KI hat keinen direkten Speicher-, Schalt-, Modus- oder Passwortzugriff.
- Globale Begriffe werden bereitgestellt; Pflege im Bereich **Begriffe**, ohne Modelltraining.
- App-Wechsel, Sperren, Anruf oder Headset-Trennung pausiert/beendet die Sitzung. Kein Hintergrundgespräch. Die App speichert keine Audiodateien.
- Prüfergebnisse verwenden die vorhandene lokale Historie und den manuellen Abgleich. Die PC-Erweiterung ist noch nicht verdrahtet. Kein zentral gespeichertes vollständiges Gesprächsprotokoll.
- Native PCM-Audioübertragung über WebSocket. OpenAI empfiehlt WebRTC für mobile Verbindungen; dieses wäre eine spätere Transportverbesserung nach dem tatsächlichen Headset-/Netztest.

## Gerätetest

Beispielablauf mit einem bekannten Testeingang vollständig durchführen. Zusätzlich doppelte Namen, Anlage 2.1/2.10, „nicht speichern“, geänderte Einheit, parallele Änderungen am Controller-Kommentar, WLAN-Ausfall während Lesen/Speichern, Headset-Trennung und Unterbrechung während KI-Ausgabe prüfen. Gespeicherten Kommentar in der LOYTEC-Weboberfläche vergleichen.

## Offizielle Quellen (5. Oktober 2026)

- [OpenAI Realtime](https://developers.openai.com/api/docs/guides/realtime)
- [Gespräche, Audio und Unterbrechungen](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [WebSocket und kurzlebige Tokens](https://developers.openai.com/api/docs/guides/voice-websockets?voice-api=realtime)
- [Client Secrets](https://developers.openai.com/api/reference/typescript/resources/realtime/subresources/client_secrets)
- [Apple Voice Processing](https://developer.apple.com/documentation/avfaudio/avaudioionode/setvoiceprocessingenabled(_:))
