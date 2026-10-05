# Update 0.1.6: LOYTEC-Anmeldung aus den geladenen Seitendaten

Unveröffentlichter Quellcode für den nächsten internen TestFlight-Build. Das kumulative Update kann über 0.1.1 bis 0.1.5 kopiert werden. Projekt-, Schlüsselbund- und Zertifikatsformate bleiben erhalten.

## Befund aus 0.1.5 (10)

Der Controller ist erreichbar und liefert HTTP 200. Zugangsdaten, Loginformular und beide Eingabefelder sind vorhanden. Der Abbruch entsteht, weil die bisherige Prüfung die LOYTEC-JavaScript-Variablen für Gerätekennung und Sitzungstoken nicht erreicht. Der genaue Grund für deren fehlende Sichtbarkeit auf dem iPhone ist durch den Log nicht belegt. Ein abgewiesenes Passwort wurde noch nicht beobachtet; der Anmeldeauftrag beginnt gar nicht.

## Korrektur

Die native Brücke liest Gerätemetadaten und Sitzungstoken jetzt zusätzlich aus der bereits geladenen Controller-Seite: aus den JSON-Literalen der LOYTEC-Konfiguration und dem versteckten `CSRFToken`-Formularfeld. Diese Datenquellen sind im ursprünglich gelieferten Firmware-8.4.20-Quellcode vorhanden. Die App führt dafür keinen ausgelesenen JavaScript-Text aus.

Dieselbe Auswertung wird nach der Anmeldung für das Lesen und die bestätigten Prüfkommentare verwendet. Die feste Controller-Adresse, die bekannte Formularstruktur, eindeutige Sitzungsdaten und die Rollenprüfung bleiben Voraussetzung. Es gibt höchstens einen Passwort-Anmeldeauftrag pro ausdrücklich gestartetem Versuch. In der Diagnose erscheinen zusätzlich `baseFromHTML` und `csrfFromHTML`; die Werte des Tokens und der Zugangsdaten bleiben ausgeschlossen.

Die Transport-Skripte sind ausdrücklich dem WebKit-Seitenkontext zugeordnet. Der bisherige Initialisierer verwendet laut Apple bereits denselben Standard; die explizite Angabe allein wird daher nicht als Ursache oder Lösung behauptet.

Zusätzlich ist die Angabe `ITSAppUsesNonExemptEncryption=false` für künftige Builds hinterlegt. Der aktuelle App-Code verwendet Apples Systemfunktionen für HTTPS, Schlüsselbund und Zertifikatsfingerabdrücke. Der bereits hochgeladene Build 10 bleibt unverändert; seine Compliance-Angaben werden weiterhin in App Store Connect bestätigt.

## Einspielen

1. ZIP entpacken und die enthaltenen Dateien und Unterordner nach `C:\BACsolution_IO_iPhone_Arbeitsstand` kopieren. Vorhandene Dateien ersetzen.
2. In PowerShell nacheinander ausführen. Bei einem Fehler den nächsten Befehl erst nach dessen Behebung ausführen:

```powershell
Set-Location "C:\BACsolution_IO_iPhone_Arbeitsstand"
git add .
git commit -m "Controller-Anmeldung aus Seitendaten 0.1.6"
git push
```

3. In Codemagic auf `main` den bestehenden Workflow **BACsolution IO - internes TestFlight** starten (`ios-testflight-internal`). Die Buildnummer wird automatisch vergeben.
4. Über TestFlight installieren und unter **Abgleich → App** die Version **0.1.6** prüfen.
5. Die bestehende Station öffnen und einmal verbinden. Bei einem erneuten Abbruch **Diagnose kopieren** antippen und den vollständigen Text senden.

## Verifikation und Grenzen

96 portable Tests bestanden, zusätzlich zwei Prüfungen mit der ursprünglich gelieferten Controller-HTML-Datei. Der Fehlerzustand aus 0.1.5 wurde in einer isolierten JavaScript-Testumgebung nachgestellt; 0.1.6 erkennt dort dieselbe Seite. Simulierte Anmeldung, I/O-Lesen und Kommentar-Readback funktionieren ohne LOYTEC-Globals. Gegenfälle prüfen fehlende und widersprüchliche Token, fremde Controller-Adressen, unbekannte Rollen, nicht ausführbare Konfigurationstexte und das Verbot aktiver Ausgangsschreibbefehle.

Projektstruktur und Syntax aller 18 App-Swift-Dateien sowie einer Swift-Testdatei geprüft. Der native Zertifikatstest benötigt macOS und läuft in Codemagic; lokal übersprungen. Kein Swift-Typecheck, Xcode-Build oder tatsächlicher Controller-Login für dieses Update ausgeführt. Upload und Buildstart übernimmt der Nutzer.

Originalseiten mit Sitzungsdaten sind nicht im Paket enthalten.

## Quellen

- Vom Nutzer bereitgestellter LOYTEC-Code: `base.js` (LoginPage, CSRFToken-Felder, LBase-Rollen), `liob_host.js` und I/O-Test-HTML, Firmware 8.4.20.
- [Apple: JavaScript-Aufruf und Content World](https://developer.apple.com/documentation/webkit/wkwebview/callasyncjavascript(_:arguments:in:contentworld:)).
- [Apple: Standardkontext eines User Scripts](https://developer.apple.com/documentation/webkit/wkuserscript/init(source:injectiontime:formainframeonly:)).
- [Apple: Verschlüsselung innerhalb des Betriebssystems](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption/).
- [Apple: ITSAppUsesNonExemptEncryption](https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption).
