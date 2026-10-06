# Update 0.1.9 – Apple-KI und Google Gemini Live

Unveröffentlichter Quellcode für das bestehende Projekt `aklassa/BACsolution-IO-Assistent`. Kein Build gestartet, keine IPA hochgeladen. Codemagic vergibt beim manuellen Build die neue Buildnummer.

## Dateien übernehmen und bauen

1. Den Inhalt von `BACsolution_IO_Update_0.1.9.zip` direkt über `C:\BACsolution_IO_iPhone_Arbeitsstand` kopieren und vorhandene Dateien ersetzen. `App`, `Shared`, `SyncServer`, `Resources`, `scripts` und `BACsolution.xcodeproj` müssen im bisherigen Projektverzeichnis liegen. Das ZIP enthält die kumulierten Änderungen seit 0.1.1, einschließlich der erfolgreichen Login-Korrektur und des Reservefilters.
2. In PowerShell ausführen:

```powershell
Set-Location "C:\BACsolution_IO_iPhone_Arbeitsstand"
git add .
git commit -m "Apple-KI und Google Gemini Live 0.1.9"
git push
```

3. In Codemagic auf `main` zunächst **BACsolution IO - iPhone Build pruefen** starten. Apple-KI benötigt Xcode 26+ und iOS-SDK 26+; `xcode: latest` ist bereits eingestellt. Nach erfolgreichem Build **BACsolution IO - internes TestFlight** starten. Bestehende Signierung und Bundle-ID beibehalten.
4. Nach Verarbeitung bei Apple den Build der internen Testgruppe zuweisen und installieren. Unter **Abgleich → App** Version **0.1.9** prüfen.

## Auf dem iPhone umschalten

Unter **Prüfen → Gemeinsam mit KI prüfen → KI-Anbieter** zwischen **Apple · auf dem iPhone** und **Google · Gemini Live** wählen. Die bisherige OpenAI-Anbindung bleibt eine weitere Option. Dieselbe Auswahl steht in **KI-Verbindung einrichten**; sie wird geräteweit gespeichert.

Ein Wechsel beendet Gespräch und Beobachtung. Der gewählte Punkt und angelegte Prüfentwürfe bleiben erhalten. Eine offene sprachliche Speicherfreigabe wird ungültig; den Entwurf anschließend am Bildschirm prüfen. Während eines Controller-Schreibvorgangs ist die Auswahl gesperrt. Kein automatischer Anbieterwechsel und keine automatische neue Cloud-Sitzung.

## Apple starten

1. Auf einem unterstützten iPhone Apple Intelligence aktivieren und das lokale Modell laden lassen.
2. **Apple-Verfügbarkeit prüfen** wählen. Die App unterscheidet ungeeignetes Gerät, deaktivierte Apple Intelligence und noch nicht bereitstehendes Modell. iOS allein genügt nicht; die Hardware muss unterstützt sein.
3. Controller verbinden, Stationsidentität bestätigen, Prüfernamen speichern und **KI-Gespräch starten** wählen. Mikrofon und lokale deutsche Spracherkennung freigeben.

Apple-KI benötigt keinen API-Schlüssel und keinen KI-Server. Auftrag und passende Begriffe werden lokal mit Foundation Models ausgewertet. Die App sucht/liest anschließend die echten Controllerdaten und spricht diese mit der iPhone-Stimme. In diesem Stand abwechselnd sprechen und zuhören. Ohne lokale deutsche Erkennung bleibt die normale Texteingabe außerhalb des KI-Gesprächs nutzbar.

## Google starten

Ein eigener erreichbarer HTTPS-Dienst und dessen Google-Zugang müssen eingerichtet werden; das ZIP stellt keinen Server bereit.

1. Beim vorhandenen Abgleich-/KI-Server auch `SyncServer/` und `Shared/` aktualisieren. Datendatei und bisherigen Server-Zugangsschlüssel beibehalten.
2. `GEMINI_API_KEY` ausschließlich in der Serverumgebung setzen. Standardmodell: `gemini-3.8-live`; optional über `BAC_IO_GOOGLE_MODEL` ändern, sofern das Modell das verwendete Live-Protokoll unterstützt. Dienst neu starten.
3. Auf dem iPhone **Google · Gemini Live** wählen, Serveradresse und Server-Zugangsschlüssel speichern, **KI-Gespräch mit Google erlauben** aktivieren und **Einstellungen speichern und KI-Server prüfen** wählen.
4. Unter **Prüfen** das KI-Gespräch ausdrücklich starten. Das iPhone benötigt gleichzeitig Internet und Zugriff auf den Controller.

Der dauerhafte Google-Schlüssel gehört weder in GitHub noch in Codemagic oder in die App. Die App erhält ein kurzlebiges Einmal-Token. Ein kostenloses Kontingent hängt vom Google-Projekt und Modell ab; kein unbegrenzt kostenloser Betrieb zugesagt. Serverstart: [KI_GESPRAECH.md](KI_GESPRAECH.md).

## Gezielt prüfen

- „Wert von Zulufttemperatur Anlage zwei eins.“ Beide Anbieter müssen echte Punkte suchen und bei mehreren Treffern nachfragen.
- „Beobachte den Wert, ich erwärme den Fühler.“ Änderungen sollen mit aktuellen Controllerwerten angesagt werden.
- „Mein Messgerät zeigt 26 Grad. Schreib die Abweichung dazu.“ Vollständigen Entwurf anhören, dann Ja/Nein sagen oder antippen; Kommentar in der LOYTEC-Oberfläche vergleichen.
- Wechsel Apple → Google → Apple, auch während einer Antwort und des Vorlesens. Kein alter Auftrag darf nach dem Wechsel speichern; lokale Entwürfe bleiben erhalten.
- Google: während des lokalen Vorlesens „Ja, nicht speichern“ sprechen. Keine vorzeitige Speicherung. Nach vollständigem Vorlesen bewusst entscheiden.
- Fehlende Apple-Verfügbarkeit, fehlender Google-Schlüssel, erschöpftes Kontingent, Headset-Trennung und WLAN-Ausfall prüfen. Keine automatische Wiederholung einer Speicherung.

Die portable Prüfung ersetzt keinen Xcode-/Gerätetest. Apple- und Google-Audiobetrieb wurden hier nicht live ausgeführt. Details: [PRUEFSTAND.md](PRUEFSTAND.md).
