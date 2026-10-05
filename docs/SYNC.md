# Gemeinsamer Speicher – vorbereitete Schnittstelle

Es wird nichts bereitgestellt oder veröffentlicht. Der Referenzdienst dient der Entwicklung und einem kontrollierten Pilotbetrieb mit einem gemeinsamen Arbeitsbereich. Für einen späteren Mehrbenutzerbetrieb fehlen individuelle Konten, Rollen, Tokenverwaltung, Betriebsüberwachung und ein abgestimmtes Sicherungskonzept. Die bestehende PC-Erweiterung ist noch nicht angeschlossen.

## Start für Entwicklung

Node.js 22 oder neuer. Im Terminal einen eigenen langen zufälligen Schlüssel als `BAC_IO_SYNC_TOKEN` setzen; er ist nicht im Quellcode hinterlegt. Danach:

```sh
node SyncServer/server.mjs
```

Optionale Umgebungsvariablen:

| Name | Standard | Bedeutung |
|---|---|---|
| `BAC_IO_SYNC_TOKEN` | keiner | Erforderlicher Zugangsschlüssel, mindestens 32 Zeichen |
| `BAC_IO_PORT` | `8787` | Port auf `127.0.0.1` |
| `BAC_IO_DATA_FILE` | `./var/workspace.json` | Persistente Datei; nicht ins Quellcode-Repository übernehmen |

Ein Serverprozess besitzt diese Datei. Mehrere Prozesse oder Serverinstanzen dürfen sie nicht gleichzeitig verändern. Änderungen werden innerhalb eines Prozesses serialisiert und über eine temporäre Datei ersetzt. Die Datei enthält Historie und Wiederholungsbelege und muss vollständig gesichert werden. Unlesbare Daten werden nicht durch eine leere Datenbank ersetzt.

Für den Zugriff vom iPhone einen HTTPS-Reverse-Proxy mit gültigem Zertifikat vor den Dienst setzen. Die App akzeptiert für den gemeinsamen Speicher ausschließlich HTTPS, keine Zugangsdaten in URLs und keine Weiterleitungen. Den Schlüssel in den App-Einstellungen hinterlegen; er liegt im iOS-Schlüsselbund. Der Referenzdienst stellt keine Oberfläche und keinen offenen CORS-Zugriff bereit. Für einen zukünftigen Browser-Erweiterungsclient sind gezielte Host-Berechtigungen nötig.

## API

Bei jeder Anfrage:

```http
Authorization: Bearer <eigener Schlüssel>
X-BACsolution-Schema: 1
Content-Type: application/json
```

| Methode / Pfad | Zweck | Antwort |
|---|---|---|
| `GET /v1/state` | Gemeinsamen Stand lesen | `{workspaceID, documents, results}` |
| `POST /v1/documents` | Projekt oder globale Begriffsliste mit Revisionsprüfung schreiben | Bestätigtes Dokument oder HTTP 409 mit `current` |
| `POST /v1/results` | Bestätigten Prüfeintrag ergänzen | Eintrag mit `serverStoredAt` |

Ein Dokumentauftrag enthält `id` (einmalige Änderungs-ID), `documentID`, `kind`, `baseRevision` und `payload`. `payload` ist ein JSON-String. Das Format ist in `App/Models.swift` und in der Servervalidierung definiert; Beispiele werden in `Tests/sync.test.mjs` ausgeführt. Ein bestätigtes Dokument enthält `id` (Dokument-ID), `kind`, `revision` und `payload`.

Projekte heißen `project:<Projekt-ID>`. Stationen haben eine unveränderliche ID plus Stationskennung und Konfigurationsstand. Die globale Begriffsliste heißt `vocabulary:global` und verwendet das vorhandene Exportformat `bacsolution-io-vocabulary`, Version 1. Zusätzliche Bezeichnungen sind Arrays, keine durch Semikolon getrennten Zeichenketten. Die App überträgt eigene Begriffsdefinitionen und Deaktivierungen; identische Standardbegriffe werden von den Clients mitgeliefert.

Ein Prüfeintrag enthält unter anderem eigene ID, Projekt-/Stations-ID, Stationskennung, Konfigurationsstand, Punktsnapshot, bestätigtes Feld, Prüfer, Geräte-ID, Erfassungszeit und Controller-Testdatum. Zulässige Felder sind ausschließlich `testState` und `testComment`. Der Server speichert die vom Client dokumentierte Bestätigung; er verbindet sich selbst nie zum Controller. `recordedAt` ist die Clientzeit, `point.testDate` das vom Controller gelesene Datum und `serverStoredAt` der Zeitpunkt der zentralen Ablage. Diese Zeiten sind nicht austauschbar.

## Wiederholungen und Konflikte

- Jeder Dokumentauftrag bleibt mit gleicher Änderungs-ID und gleichem Inhalt lokal erhalten, bis die Bestätigung gespeichert ist. Eine identische Wiederholung liefert die ursprüngliche Bestätigung und erhöht die Revision nicht erneut.
- Eine ID mit anderem Inhalt wird abgewiesen. Gleichzeitige Bearbeitung einer Dokumentrevision liefert einen Konflikt; die App zeigt beide Inhalte. Eigener Stand und gemeinsamer Stand werden nicht stillschweigend zusammengeführt.
- Offline-Folgeänderungen werden in ihrer ursprünglichen Reihenfolge übertragen. Bei einem Konflikt bleiben spätere Änderungen desselben Dokuments zurückgestellt.
- Prüfeinträge bilden eine ergänzende Historie. Gleiche ID und gleicher Inhalt sind wiederholbar; Änderungen an einem vorhandenen Eintrag werden abgelehnt. Nachträglich übertragene Offline-Ergebnisse bleiben ihrem damaligen bekannten Konfigurationsstand zugeordnet.
- Controller-Schreibaufträge landen **nicht** in dieser Warteschlange. Ein unterbrochener Schreibauftrag muss lokal durch erneutes Lesen und manuelle Prüfung geklärt werden. Ein Serverabgleich löst nie einen Ausgangs- oder Controller-Schreibvorgang aus.
- `workspaceID` bindet die App nach dem ersten Abgleich an einen gemeinsamen Speicher. Eine versehentlich eingetragene Adresse eines anderen Speichers stoppt den Upload. Ein Hostwechsel bei gleicher Speicheridentität bleibt möglich.

Dieser erste Dienst liefert den gesamten Stand. Große Bestände, automatische Synchronisierung, Paginierung, serverseitige Suche und eine Datenbankmigration werden vor einem breiteren Einsatz ergänzt. Bis dahin ist der Umfang auf einen überschaubaren Pilotbestand auszulegen.
