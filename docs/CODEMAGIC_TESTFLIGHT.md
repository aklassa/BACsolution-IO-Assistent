# Vom Windows-PC zu TestFlight

Stand: 5. Oktober 2026. Zwei manuell gestartete Codemagic-Workflows sind vorbereitet. Es wurde noch kein Codemagic-Build gestartet und nichts zu Apple hochgeladen. Benötigt wird ein aktiver Apple-Developer-Zugang. Die App ist ein natives SwiftUI-Projekt und wird in Codemagic als iOS-Projekt mit `codemagic.yaml` eingerichtet.

## 1. Quellcode nach GitHub

Ein eigenes privates Repository, beispielsweise `BACsolution-IO-Assistent`, verwenden. Den **Inhalt** des entpackten Projektordners hochladen. Im Hauptverzeichnis müssen `codemagic.yaml`, `package.json`, `App`, `Resources`, `scripts` und `BACsolution.xcodeproj` liegen. Nicht nur die ZIP-Datei hochladen. Das BACtab-M-BUS-Projekt ist eine separate Anwendung.

## 2. Codemagic verbinden und zunächst kompilieren

Unter [Codemagic](https://codemagic.io/) das Repository verbinden. YAML-Konfiguration verwenden. Über **Start new build** zunächst **BACsolution IO - iPhone Build pruefen** (`ios-check`) starten. Dieser Workflow benötigt keine Apple-Signierung und prüft den tatsächlichen Swift-/SDK-Build. Bei einem Fehler das Log `ios-check.log` auswerten, bevor der TestFlight-Workflow gestartet wird.

## 3. Apple-App und Signierung einrichten

In [Apple Developer](https://developer.apple.com/account/) eine explizite App-ID registrieren:

| Feld | Vorbereiteter Wert |
|---|---|
| App-Name | BACsolution IO-Assistent |
| Bundle-ID | `de.bacsolution.io.assistent.dev` |
| Plattform | iOS |
| Version | `0.1.6` |

In [App Store Connect](https://appstoreconnect.apple.com/) eine neue App mit genau dieser Bundle-ID anlegen. Das ist erforderlich, bevor die erste Binärdatei zugeordnet werden kann. Für einen anderen Bezeichner `scripts/xcode_project.py` und `codemagic.yaml` gemeinsam anpassen, danach `npm run prepare` ausführen.

App-Store-Connect-API-Zugang in Codemagic unter **Team settings → Team integrations → Developer Portal** einrichten. Der Integrationsname in dieser Konfiguration lautet **BACsolution Apple**. Ein bereits vorhandener passender Zugang kann verwendet werden; dann den Namen in der YAML-Datei angleichen. Neue Team-API-Schlüssel werden in App Store Connect unter **Users and Access → Integrations → App Store Connect API** erzeugt; Codemagic verlangt für Uploads die Rolle **App Manager**. `.p8`-Datei, Key ID und Issuer ID ausschließlich in der Codemagic-Integration hinterlegen.

Unter **Code signing identities** ein **Apple Distribution**-Zertifikat erstellen oder ein vorhandenes mit passendem privaten Schlüssel verwenden. Ein zugehöriges **App Store**-Provisioning-Profil für die Bundle-ID hinterlegen beziehungsweise über die verbundene Integration abrufen. TestFlight benötigt eine App-Store-Distributionssignierung, kein Entwicklungsprofil. Es sind keine iPhone-UDIDs in dieser Konfiguration vorgesehen.

## 4. TestFlight-Build starten

Workflow **BACsolution IO - internes TestFlight** (`ios-testflight-internal`) manuell starten. Er prüft die Logik, setzt eine neue Buildnummer, verwendet die hinterlegten Signierungsdateien, erstellt die IPA und lädt sie zu App Store Connect hoch.

Die Buildnummer basiert auf `PROJECT_BUILD_NUMBER`, dem anwendungsweiten Codemagic-Zähler. Bei einer neu angelegten Codemagic-App für eine bereits bestehende Apple-App gegebenenfalls `BAC_IO_BUILD_OFFSET` so erhöhen, dass die nächste Nummer über bisherigen Builds liegt. Das Skript verändert nur den CI-Arbeitsstand, nicht die im Repository gespeicherte Marketingversion.

Die Testversion zeigt Version und Buildnummer unter **Abgleich → App**. Bei einer Fehlermeldung diese beiden Angaben und den betroffenen Arbeitsschritt nennen. Die lokale Buildnummer `1` ist ein Ausgangswert; Codemagic ersetzt sie beim signierten Build durch seinen eigenen Zähler.

Der Workflow verwendet das aktuelle stabile Xcode-Image und prüft mindestens iOS-SDK 26. Das Deployment-Ziel der App bleibt iOS 17. Ein undurchsichtiges I/O-Testicon ist als Asset enthalten.

Der Export setzt `testFlightInternalTestingOnly: true`. `submit_to_testflight: false` verhindert die Einreichung zur Beta-Review für externe Tests; der IPA-Upload findet trotzdem statt. `submit_to_app_store: false` verhindert die App-Store-Einreichung. Es gibt keine automatischen Git-Push-Auslöser und keine automatische Einladung zusätzlicher Tester.

## 5. Auf dem iPhone installieren

Nach Apples Verarbeitung unter **App Store Connect → App → TestFlight → Internal Testing** eine interne Gruppe anlegen und den eigenen berechtigten App-Store-Connect-Benutzer hinzufügen. Den hochgeladenen Build der Gruppe zuordnen. Eventuell angeforderte Angaben, beispielsweise zur Export-Compliance, im Apple-Portal für die tatsächliche App beantworten. Anschließend die App über **TestFlight** auf dem iPhone installieren.

Die interne Gruppe darf nur berechtigte App-Store-Connect-Benutzer enthalten. Ein als „Internal Only“ markierter Build kann nicht für externe Tester oder Kunden freigegeben werden. Für den ersten LOYTEC-Test wird noch kein zentraler Abgleichserver benötigt; das iPhone muss den Controller im Anlagennetz erreichen.

## Nachweise und Grenzen

Konfiguration, Projektstruktur und lokale Logik sind geprüft. Signatur, IPA-Export, Apple-Verarbeitung und tatsächliche Installation können erst durch den ersten Codemagic-Lauf bestätigt werden. Falls ein Lauf scheitert, das betreffende Build-Log zur Korrektur bereitstellen; API-Schlüssel und Zertifikate gehören nicht in den Chat oder ins Repository.

Offizielle Grundlagen:

- [Codemagic: Native iOS](https://docs.codemagic.io/yaml-quick-start/building-a-native-ios-app/)
- [Codemagic: TestFlight-/App-Store-Upload](https://docs.codemagic.io/yaml-publishing/app-store-connect/)
- [Codemagic: Buildnummern](https://docs.codemagic.io/knowledge-codemagic/build-versioning/)
- [Apple: interne Tester](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers)
- [Apple: aktuelle SDK-Mindestanforderungen](https://developer.apple.com/news/upcoming-requirements/)
