# Noch ausstehender iPhone-Gerätetest

Diese Liste beschreibt ausstehende Abnahmen, keine bereits bestandenen Hardwaretests. Zunächst einen Entwicklungsbuild auf einem vorgesehenen Test-iPhone mit iOS 17 oder neuer verwenden. Erst die reine Anzeige prüfen, anschließend einen ausdrücklich dafür vorgesehenen Prüfpunkt dokumentieren.

| Prüfung | Erwartetes Ergebnis |
|---|---|
| Projekt anlegen, App beenden und neu öffnen | Projekt und Stationskennung bleiben erhalten |
| Account und Passwort bei neuem Projekt / weiterer Station eingeben | Native Felder reagieren ohne Absturz; Zugangsdaten werden pro Station gespeichert |
| Bestehende Station aus 0.1.1 öffnen | Daten bleiben erhalten; Zugangsdaten können einmalig ergänzt werden |
| LOYTEC 8.4.20 anmelden | Automatischer Login lädt die I/O-Testseite; keine Eingabe in der eingebetteten Website nötig |
| 0.1.6 mit gespeicherten Zugangsdaten öffnen | WebKit wird am App-Fenster angebunden; TCP-Porttest und Anmeldephasen laufen durch |
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
| I/O-Seite nach erfolgreicher Anmeldung | Datenpunkte lassen sich auch bei nicht sichtbaren JavaScript-Variablen frisch lesen; Rollenprüfung bleibt wirksam |
| Verzögerter Seitenaufbau | Formularprüfung wartet begrenzt; keine mehrfachen Passwortanfragen |
| Verbindungsdiagnose kopieren | Version, Status, Abbruchgrund, Zugangsdaten-vorhanden-Hinweis und Seitenmerkmale enthalten; Benutzername, Passwort und Tokenwerte fehlen |
| Während der Formular-Wartezeit abbrechen / Dialog schließen | Keine nachträgliche Anmeldung; der abgebrochene Versuch bleibt beendet |
| KI-Modus mit eingerichtetem Server | Beispielablauf in KI_GESPRAECH.md einschließlich Referenzmessung und bestätigtem Kommentar durchläuft alle Schritte |
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
