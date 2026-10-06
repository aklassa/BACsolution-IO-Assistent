# iPhone-Geräteprüfungen

Der Nutzer hat Anmeldung und Datenpunktanzeige mit 0.1.7 bestätigt. Die nachfolgende Liste enthält die darüber hinausgehenden Prüfungen und erneute Kontrollen für 0.1.9. Zunächst die reine Anzeige prüfen, anschließend einen ausdrücklich dafür vorgesehenen Prüfpunkt dokumentieren. Filter- und KI-Funktionen wurden noch nicht auf einem iPhone abgenommen.

| Prüfung | Erwartetes Ergebnis |
|---|---|
| Projekt anlegen, App beenden und neu öffnen | Projekt und Stationskennung bleiben erhalten |
| Account und Passwort bei neuem Projekt / weiterer Station eingeben | Native Felder reagieren ohne Absturz; Zugangsdaten werden pro Station gespeichert |
| Bestehende Station aus 0.1.1 öffnen | Daten bleiben erhalten; Zugangsdaten können einmalig ergänzt werden |
| LOYTEC 8.4.20 anmelden | Automatischer Login lädt die I/O-Testseite; keine Eingabe in der eingebetteten Website nötig |
| 0.1.9 mit gespeicherten Zugangsdaten öffnen | Anmeldung und Anzeige funktionieren weiterhin mit dem bereits erfolgreichen Loginverfahren |
| HTTP-Adresse öffnen | Der konfigurierte HTTP-Port wird verwendet; keine selbständige Umstellung auf HTTPS |
| HTTPS mit nicht bestätigtem Zertifikat öffnen | Zertifikatskarte vor dem Login; kein Passwortversand vor Freigabe |
| SHA-256-Fingerabdruck am Controller bzw. geprüftem PC vergleichen und freigeben | Nur die ausgewählte Station mit genau diesem Zertifikat kann sich anmelden |
| Gleiche Station erneut öffnen | Freigabe aus dem iPhone-Schlüsselbund wird anhand des exakten Zertifikats geprüft |
| Geändertes Zertifikat / andere Station / anderer HTTPS-Port | Keine stille Übernahme der Freigabe; erneute Prüfung erforderlich |
| Zertifikatsprüfung abbrechen oder Freigabe entfernen | Verbindung bleibt beendet; keine automatische Anmeldung |
| Controller-TCP-Port unerreichbar | Spätestens nach 10 Sekunden verständlicher Port-/Netzwerkhinweis |
| Controller-Port offen, HTTP-Seite oder Anmeldung hängt | Gesamtversuch endet spätestens nach 30 Sekunden mit Phase |
| Lokales Netzwerk verweigern und danach in iOS erlauben | Hinweis erscheint; ein ausdrücklich neu gestarteter Versuch kann fortfahren |
| Abbruch bei der Anmeldeprüfung | Fehlermeldung und Diagnosecode direkt unter Verbindung; Kopieren ohne Aufklappen der Diagnose möglich |
| Anmeldeformular vorhanden, LOYTEC-Variablen nicht sichtbar | Metadaten und Sitzungstoken werden aus der geladenen Seite erkannt; Diagnose zeigt baseFromHTML/ csrfFromHTML; genau ein Anmeldeauftrag |
| Vollständiges Anmeldeformular mit Sitzungstoken, aber ohne Gerätekennung wie im Log 0.1.6 (11) | Auch bei controllerBrand=nein und baseFromHTML=nein folgt login-form-ready und Einmalige Anmeldung über /webui/login; kein Abbruch nur wegen fehlender Metadaten |
| Anmeldung beantwortet, aber I/O-Seite noch nicht bestätigt | Keine Freigabe von Datenpunkten; erst gültige authentifizierte I/O-Metadaten bestätigen die Verbindung |
| I/O-Seite nach erfolgreicher Anmeldung | Datenpunkte lassen sich auch bei nicht sichtbaren JavaScript-Variablen frisch lesen; Rollenprüfung bleibt wirksam |
| Verzögerter Seitenaufbau | Formularprüfung wartet begrenzt; keine mehrfachen Passwortanfragen |
| Verbindungsdiagnose kopieren | Version, Status, Abbruchgrund, Zugangsdaten-vorhanden-Hinweis und Seitenmerkmale enthalten; Benutzername, Passwort und Tokenwerte fehlen |
| Während der Formular-Wartezeit abbrechen / Dialog schließen | Keine nachträgliche Anmeldung; der abgebrochene Versuch bleibt beendet |
| KI-Modus mit eingerichtetem Server | Beispielablauf in KI_GESPRAECH.md einschließlich Referenzmessung und bestätigtem Kommentar durchläuft alle Schritte |
| KI-Verbindung einrichten, Serveradresse und Server-Zugangsschlüssel speichern | Zugang ist unter Prüfen direkt erreichbar; derselbe Dienst wird für KI und Abgleich verwendet |
| KI-Server prüfen, noch kein API-Schlüssel am Server | Verständlicher Hinweis auf fehlende API-Konfiguration; Mikrofon bleibt aus, keine KI-Sitzung startet |
| KI-Server mit hinterlegtem API-Schlüssel prüfen | Erreichbarkeit und Modell werden angezeigt; Hinweis, dass der gewählte Cloud-Anbieter erst beim Gesprächsstart geprüft wird |
| Falscher Server-Zugangsschlüssel, älterer Server, ungültiger OpenAI-Zugang | Hinweise unterscheiden Server-Anmeldung, fehlenden Endpunkt und OpenAI-Zugang; keine automatische Gesprächswiederholung |
| KI fragt nach Speicherung | Mikrofon erst nach vollständigem Vorlesen aktiv; nur eindeutige abschließende Zustimmung speichert |
| „Ja, aber nicht speichern“ / falsche Einheit / parallele Kommentaränderung | Keine ungefragte oder widersprüchliche Speicherung |
| App vollständig beenden, öffnen und Station erneut verbinden | Gespeicherte Zugangsdaten werden wiederverwendet |
| Zugangsdaten ändern | Neuer Account / neues Passwort werden gespeichert; frische Controller-Sitzung wird aufgebaut |
| Absichtlich falsches Passwort an einem freigegebenen Testkonto | Verständliche Ablehnung; pro Verbindungsauftrag nur ein Versuch, keine automatische Wiederholung |
| Andere Station bzw. geänderte Controller-Adresse, Protokoll oder Port | Alte Zugangsdaten und Sitzungscookies werden nicht übernommen |
| Netzwerkabbruch während Anmeldung, anschließend Dialog schließen | Wartestatus endet; keine verspätete Erfolgsmeldung und keine automatische Wiederholung |
| Projekt-/Abgleichdaten prüfen | Account, Passwort und Sitzungstoken sind nicht enthalten |
| Falsche oder abgelaufene Anmeldung | Kein gelesener Wert wird als aktuell ausgegeben |
| Stationskennung bestätigen | Auswahl der realen Station bleibt bewusst nachvollziehbar |
| Bekannten Eingang und Ausgang lesen | Adresse einschließlich Objekttyp stimmt; gleicher Objektindex verwechselt keine Kanäle |
| Reserve ausblenden ein-/ausschalten | Eindeutige Reservepunkte verschwinden/erscheinen; Zähler zeigt sichtbare und gesamte Datenpunkte |
| RES01, Reserve, Spare, Unused bzw. Nicht belegt im Namen oder Beschreibung | Ein- und Ausgänge werden als Reserve erkannt; Reservepumpe, Freigabe, Nullwerte und nicht getestete Punkte bleiben sichtbar |
| App-Neustart oder andere Station | Gewählte Reservefilter-Einstellung bleibt erhalten; Daten aller Punkte sind weiter vorhanden |
| Einen Reservepunkt mit Entwurf wählen, dann ausblenden | Auswahl und Entwurf bleiben sichtbar, nur die Listenzeile wird ausgeblendet |
| Weiter, Zurück, Sprachsuche und KI: nächster Temperaturfühler | Reservefilter gilt überall; tatsächliche Controller-Reihenfolge bleibt erhalten |
| Benannten Wert trotz anderer markierter Zeile anfragen | Angefragter Punkt wird frisch gelesen |
| Anlage 2.1 / 2.10 und doppelte Namen | Keine stille Verwechslung; bei Mehrdeutigkeit nummerierte Auswahl |
| Raumtemp., Y, FG, SM, BM und eigene Begriffe | Suche und Vorlesen verwenden das globale Verzeichnis |
| Digitalwert OPEN / CLOSED | „Offen“ / „geschlossen“, ohne erfundene Störungsinterpretation |
| Falsch verstandener Befehl | Vorschlag oder Rückfrage; kein ungefragtes Speichern |
| Kommentar diktieren | Freier Text wird vollständig vorgemerkt, nicht als weiterer Befehl interpretiert |
| App-Neustart mit Prüfentwurf | Entwurf bleibt lokal erhalten |
| Kommentar und Ergebnis speichern | Nur Testkommentar / Prüfstatus geändert; separate Rücklesung bestätigt |
| Controllerdatum vergleichen | Datum stammt vom Controller |
| Kommentar erfolgreich, Status unterbrochen | Teilerfolg erhalten, Rest bleibt prüfpflichtig |
| WLAN während Speicherung trennen | Kein automatischer Wiederholungsauftrag; Entwurf als unbestätigt markiert |
| Prüfstatus parallel in LOYTEC-Oberfläche ändern | Konflikt stoppt den veralteten Entwurf |
| Headset verbinden, Wert vorlesen und Befehl sprechen | Ausgabe und Mikrofoneingang verwenden die gewünschte Route |
| Headset während Sitzung trennen / Anruf | Sprachsitzung pausiert, kein unbemerktes Weiterhören |
| App sperren oder wechseln | Sitzung stoppt; Fortsetzung wird bewusst gestartet |
| Offline-Erkennung ohne Netz | Nur bei lokal unterstütztem Deutsch; andernfalls verständliche Meldung / Texteingabe |
| Online-Erkennung deaktiviert | Keine Ausweichanfrage an Online-Spracherkennung |
| Server nicht eingerichtet / Internet getrennt | Lokale Prüfung bleibt möglich, Abgleichstatus bleibt offen |
| Zwei Clients ändern dieselbe Projekt-/Begriffsrevision | Konflikt mit beiden Ständen sichtbar |
| Abgleichantwort unterbrechen und erneut abgleichen | Keine doppelten Prüfeinträge oder zusätzlichen Revisionen |
| PC-Integration ergänzen | Gleiches Projekt, gleiche Station, gleiche Begriffe und Prüfhistorie werden übernommen |

Die tatsächliche Controller-Erreichbarkeit im Anlagen-WLAN, Zertifikate, iOS-Berechtigungen und die Headset-Route lassen sich durch Quellcodeprüfungen nicht bestätigen.

## Neue Anbieter in 0.1.9

| Test | Erwartung |
|---|---|
| Apple-Verfügbarkeit prüfen, Apple Intelligence aus / Modell lädt / ungeeignetes iPhone | Konkreter Grund, kein Mikrofon, kein Wechsel in die Cloud |
| Apple ohne Serveradresse und ohne API-Schlüssel | Start bei verfügbarer lokaler KI und deutscher Erkennung; tatsächliche Punkte suchen/lesen |
| Apple auf älterem iOS, normaler Befehlsmodus | App bleibt nutzbar, Apple-KI meldet Mindestanforderung |
| Apple: Synonyme, Anlage 2.1/2.10, mehrere Treffer | Relevante globale Begriffe nutzen; keine erfundenen Werte; Rückfrage vor Auswahl |
| Apple: viele Gesprächsschritte | Begrenzter Kontext, weiterhin frische Werte; neue Gespräche nach zehn Minuten ausdrücklich starten |
| Google: OpenAI-Freigabe vorhanden, Google-Freigabe aus | Keine Google-Sitzung; eigene Freigabe erforderlich |
| Google: fehlender/ungültiger Schlüssel oder erschöpftes Kontingent | Verständlicher Hinweis; kein Fallback, keine wiederholten automatischen Sitzungen |
| Google: freier Dialog über Headset | 16-kHz-Eingang, 24-kHz-Ausgabe, verständliches Deutsch, Unterbrechen testen |
| Google: Kommentarvorlesen, währenddessen Ja sagen | Mikrofon pausiert; keine Speicherung durch Cloud-Transkriptfragment |
| Google: lokale deutsche Bestätigung nicht verfügbar | Kommentar anhören; Ja/Nein per Schaltfläche oder Text möglich |
| Beide: Ja, nicht speichern / Ja wenn es passt | Keine Speicherung; eindeutige Entscheidung erforderlich |
| Anbieterwechsel beim Verbindungsaufbau, während Antwort oder Kommentarvorlesen | Alte Aufgaben stoppen, keine verspätete Speicherung; Punkt und Entwurf erhalten |
| Anbieterwechsel während bereits laufender Speicherung | Auswahl gesperrt; Ergebnis/Unsicherheit wie bisher verarbeiten |
| App neu öffnen | Gewählter Anbieter gespeichert, kein automatischer Gesprächsstart |
| Netzabbruch oder Headset-Trennung im Kommentarablauf | Sitzung endet; Entwurf am Bildschirm prüfen, keine automatische Schreibwiederholung |
