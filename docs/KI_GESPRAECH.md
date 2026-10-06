# Geführter I/O-Test mit Apple, Google und Sprache

Stand 0.1.9, 5. Oktober 2026. Apple und Google sind neu; die bisherige OpenAI-Anbindung bleibt nutzbar. Die Auswahl steht direkt unter **Prüfen → KI-Anbieter** und in **KI-Verbindung einrichten**. Ein Wechsel beendet das Gespräch, erhält aber Punkt und Prüfentwürfe. Der Gesprächsverlauf wird nicht an den anderen Anbieter übertragen.

| Anbieter | Verarbeitung und Stimme | Voraussetzung |
|---|---|---|
| Apple | Lokales Foundation-Models-Modell, lokale deutsche Spracherkennung und iPhone-Stimme | Unterstütztes iPhone, iOS 26+, aktivierte Apple Intelligence, geladenes Modell; kein KI-Server/API-Schlüssel |
| Google | Gemini Live mit direktem Audio zwischen iPhone und Google | Internet, eigener HTTPS-Zugangsdienst, GEMINI_API_KEY am Server und ausdrückliche Freigabe in der App |
| OpenAI | Bestehendes Realtime-Modul | Internet, eigener HTTPS-Zugangsdienst, OPENAI_API_KEY am Server und separate Freigabe in der App |

Apple verursacht keine KI-API-Aufrufkosten. Google kann ein kostenloses API-Kontingent anbieten; Verfügbarkeit, Kontingent, Abrechnung und Datenbedingungen im eigenen Google-Projekt prüfen. Kein automatisch gebuchter Tarif und kein automatischer Anbieterwechsel. Bei Google/OpenAI werden beim ausdrücklichen Gesprächsstart Audio, Texte, benötigte Punktinformationen und Begriffe übertragen. Controller-Anmeldedaten werden nicht in den KI-Kontext aufgenommen.

## Apple einrichten

1. Apple Intelligence auf einem unterstützten iPhone aktivieren und den Modelldownload abschließen lassen.
2. **Apple · auf dem iPhone → Apple-Verfügbarkeit prüfen** wählen. Die Prüfung startet kein Mikrofon. Bei fehlender Unterstützung wird der Grund angezeigt.
3. Unter **Abgleich → Prüfer** den Namen speichern. Controller verbinden und Stationsidentität bestätigen.
4. **KI-Gespräch starten** wählen, Mikrofon und Spracherkennung erlauben. Lokale deutsche Erkennung muss verfügbar sein; die Online-Freigabe des normalen Befehlsmodus wird hierfür nicht übernommen.

Apple interpretiert jeweils einen Prüfauftrag in eine strukturierte Aktion. Die echten Werte kommen anschließend aus denselben Controllerfunktionen wie bei den anderen Anbietern. Wertansagen, Kandidaten und bestätigte Speicherergebnisse formuliert die App direkt aus den Werkzeugergebnissen. Das lokale Modell bekommt einen begrenzten Kontext mit passenden globalen Begriffen und den letzten beiden Gesprächsschritten. Ganze Projektbestände werden nicht in den Modellkontext geladen.

In diesem Stand sprechen Nutzer und iPhone abwechselnd; während der Ausgabe ist die lokale Erkennung pausiert. Zum Unterbrechen **KI-Gespräch beenden** wählen. Ohne verfügbares Modell oder lokale deutsche Erkennung kann der normale Text-/Befehlsmodus weiterverwendet oder Google ausdrücklich gewählt werden. Ein reiner Apple-KI-Textmodus ohne Sprachberechtigung ist noch nicht vorgesehen.

## Google einrichten

Der mitgelieferte Node-Dienst erteilt kurzlebige Sitzungsfreigaben. Benötigt werden Node.js 22+, ein Gemini-API-Projekt mit Live-Zugriff sowie ein HTTPS-Reverse-Proxy mit gültigem Zertifikat vor dem eigenen Dienst. Ein Server wird durch dieses Update nicht automatisch bereitgestellt.

Beim vorhandenen Dienst `SyncServer/` und `Shared/` aktualisieren, die bisherige Datendatei und `BAC_IO_SYNC_TOKEN` beibehalten und zusätzlich `GEMINI_API_KEY` setzen. Standardmodell ist `gemini-3.8-live`. Ein optionales `BAC_IO_GOOGLE_MODEL` muss zur `v1beta`-Live-API mit Audio und Funktionsaufrufen passen. Kein automatischer Modellwechsel bei Kontingentfehlern.

Lokaler Serverstart unter Windows; die Schlüsseleingaben werden nicht als Klartext in der PowerShell-Historie gespeichert:

```powershell
Set-Location "C:\BACsolution_IO_iPhone_Arbeitsstand"
$bacSyncSecret = Read-Host "Server-Zugangsschluessel (mindestens 32 Zeichen)" -AsSecureString
$bacGoogleSecret = Read-Host "Gemini API-Schluessel" -AsSecureString
$bacSyncPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($bacSyncSecret)
$bacGooglePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($bacGoogleSecret)
try {
    $env:BAC_IO_SYNC_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bacSyncPointer)
    $env:GEMINI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bacGooglePointer)
    node SyncServer/server.mjs
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bacSyncPointer)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bacGooglePointer)
    Remove-Item Env:GEMINI_API_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:BAC_IO_SYNC_TOKEN -ErrorAction SilentlyContinue
}
```

Der Dienst lauscht nur auf `127.0.0.1:8787`. Einen HTTPS-Reverse-Proxy davor einrichten. In der App dessen Basisadresse ohne Pfad eintragen, beispielsweise `https://io.eigene-domain.de`; die Beispieladresse wird nicht bereitgestellt. Der Zugangsschlüssel im iPhone ist `BAC_IO_SYNC_TOKEN`, nicht der Google-API-Schlüssel.

In der App **Google · Gemini Live** und **KI-Gespräch mit Google erlauben** wählen. **Einstellungen speichern und KI-Server prüfen** liest `GET /v1/voice/google/status`. Das prüft eigenen Serverzugang und vorhandene Konfiguration, ohne Mikrofon, Google-Anfrage oder Sitzungsverbrauch. Ein hinterlegter Schlüssel ist noch kein Nachweis seiner Gültigkeit. Erst **KI-Gespräch starten** fordert über `POST /v1/voice/google/session` eine echte Google-Freigabe an.

Der Server verwendet den REST-Endpunkt `v1beta/auth_tokens`, `uses: 1`, 60 Sekunden Startfrist und zehn Minuten Token-Laufzeit. `bidiGenerateContentSetup` und `fieldMask` sperren das Modell gemäß REST-Referenz. Das sind Rohprotokollfelder, nicht die SDK-Felder `liveConnectConstraints.config`. Die App nutzt den festen Google-WebSocket-Endpunkt `BidiGenerateContentConstrained` mit `Authorization: Token …`. Der dauerhafte Schlüssel bleibt am Server. Audio ist PCM mono, Eingang 16 kHz und Ausgabe 24 kHz.

Google-Transkriptfragmente dienen nur der Anzeige. Sie und das Ende einer Modellantwort sind keine Speicherfreigabe. Bei einem Kommentarentwurf stoppt Google-Audio. Die App hält den Funktionsaufruf offen, liest den vollständigen Kommentar lokal vor und verarbeitet danach ausschließlich ein finales lokales Sprachergebnis oder die ausdrückliche Text-/Tastenentscheidung. Erst danach erhält Google das App-Ergebnis. Fehlt lokale Erkennung, stehen Ja/Nein-Schaltflächen bereit. Unterbrechung oder Ablauf lassen den Entwurf zur manuellen Prüfung erhalten.

## Bisherige OpenAI-Anbindung

Unter **OpenAI · Realtime** die eigene Freigabe aktivieren. Dafür am Server `OPENAI_API_KEY` hinterlegen; optional `BAC_IO_VOICE_MODEL`, Standard `gpt-realtime`. Die bisherigen Endpunkte `/v1/voice/status` und `/v1/voice/session` bleiben bestehen. API-Nutzung ist separat vom ChatGPT-Abonnement. Die Freigabe für OpenAI gilt nicht automatisch für Google.

Dauerhafte Schlüssel gehören ausschließlich in die Serverumgebung, weder in Swift-Dateien noch in GitHub, Codemagic oder Chat-Nachrichten. Der Build benötigt keinen KI-Schlüssel. Der Controller muss nicht öffentlich aus dem Internet erreichbar sein; das iPhone braucht bei Cloud-Gesprächen gleichzeitig Controllerzugang und Internet.

## Gemeinsamer Prüfablauf

1. „Wir prüfen die Zulufttemperatur von Anlage zwei eins.“ Suche in tatsächlichen Stationsdaten; bei mehreren Treffern ausdrücklich auswählen.
2. „Beobachte den Wert, ich erwärme den Fühler.“ Abfrage frühestens drei Sekunden nach dem vorigen Vorgang. Numerische Änderungen ab standardmäßig 0,5 in der Punkt-Einheit, binäre Zustandswechsel bei jeder Änderung. Die Schwelle kann genannt werden. Stichproben, keine kontinuierliche Messaufzeichnung.
3. „Mein Messgerät zeigt 26 Grad. Schreib die Abweichung dazu.“ Frisch lesen, gleiche Einheiten prüfen, Controller minus Referenz berechnen. Bestehende Kommentare werden beibehalten und ergänzt. Ohne passende Einheit nachfragen.
4. Die App liest Punktzuordnung und vollständigen Kommentar lokal vor. Das Mikrofon pausiert. Erst danach Ja/Nein sagen oder antippen.
5. „Ja, danach zum nächsten Temperaturfühler.“ Zuerst genau den vorgelesenen Kommentar speichern und separat zurücklesen. Erst ein bestätigtes Ergebnis erlaubt die Fortsetzung.

Zum Korrigieren zuerst Nein wählen, dann den richtigen Referenzwert nennen. Bedingte oder widersprüchliche Zustimmungen speichern nicht. Die Bestätigung verfällt nach fünf Minuten, einem Sitzungsende/Anbieterwechsel oder einer geänderten Zuordnung. Bei Unterbrechung bleibt ein bereits angelegter Entwurf lokal erhalten. Unklare Schreibaufträge werden nicht automatisch wiederholt.

Der Reservefilter gilt auch für KI-Suche und Prüfreihenfolge. Für eine Reserveprüfung das Gespräch beenden und **Reserve ausblenden** ausschalten. Die globale Begriffsliste kann unter **Begriffe** erweitert werden; kein Modelltraining erforderlich. Prüfstatus weiterhin über Oberfläche oder normalen Befehlsmodus setzen. Kein Modell hat ein Werkzeug für direkte Speicherung, Ausgangsansteuerung oder Passwörter.

## Grenzen und Prüfung

- Quellcode und portable Protokolltests vorbereitet; noch kein nativer Build oder Live-Gespräch dieser Version. Foundation-Models-Makros, Apple-Verfügbarkeit, Headset-Audio und die echte Google-Verbindung sind im Codemagic-/Gerätetest zu prüfen.
- Zehn Minuten je App-Gesprächsabschnitt; bei Google/OpenAI höchstens zwölf neue Sitzungsfreigaben pro Anbieter, Serverprozess und Stunde. Keine zugesicherte Geldobergrenze; Provider-Abrechnung/Kontingente separat verwalten. Kein automatischer Wiederanlauf.
- Bei Apple kann das lokale Modell komplexe Aufträge unvollständig verstehen. Kurze Schritte nennen und Rückfragen beantworten.
- App geöffnet lassen. Sperren, App-Wechsel, Anruf oder Headset-Trennung beendet/pausiert das Gespräch. Kein Hintergrundgespräch; keine Audioaufzeichnung durch die App.
- Prüfergebnisse nutzen die lokale Historie und den manuellen Serverabgleich. Die PC-Erweiterung ist noch nicht angeschlossen. Kein globales vollständiges Gesprächsprotokoll.

Gerätetest: [GERAETETEST.md](GERAETETEST.md). Prüfstand: [PRUEFSTAND.md](PRUEFSTAND.md).

## Offizielle Quellen

Abruf 5. Oktober 2026:

- [Apple Foundation Models](https://developer.apple.com/documentation/foundationmodels)
- [Strukturierte Apple-Modellantworten](https://developer.apple.com/documentation/foundationmodels/generating-swift-data-structures-with-guided-generation)
- [Apple-Modellverfügbarkeit](https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel/availability-swift.property)
- [Sprachen und Lokalisierung](https://developer.apple.com/documentation/foundationmodels/supporting-languages-and-locales-with-foundation-models)
- [Gemini Live über WebSocket](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket)
- [Kurzlebige Google-Tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens)
- [Rohprotokoll und AuthToken-Schema](https://ai.google.dev/api/live)
- [Gemini-Preise und Kontingente](https://ai.google.dev/gemini-api/docs/pricing)
- [OpenAI Realtime](https://developers.openai.com/api/docs/guides/realtime)
