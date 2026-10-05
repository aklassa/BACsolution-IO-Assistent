# Globale Begriffsliste – Auswahl und Quellen

Recherchestand: 05.10.2026. Unveröffentlichter Arbeitsstand auf Basis der Software 0.4.0. Die Liste umfasst 58 bearbeitbare Grunddefinitionen, davon 52 neu gegenüber dem bereitgestellten Paket. Neue Softwareversionen und Updatepakete werden nur auf ausdrücklichen Auftrag des Benutzers veröffentlicht.

## Auswahl

Die Vorgaben verbinden gebräuchliche Fachkürzel mit lesbaren Bedeutungen. Herstellerunterlagen belegen die Fachbegriffe und viele Kürzel. Schreibvarianten mit „Temp.“, getrennten Wörtern, Umlautumschreibungen und gesprochenen Buchstaben wurden für die Suche ergänzt; sie sind keine Festlegung eines herstellerübergreifenden Datenpunktschlüssels. Der Originalname des Datenpunktes bleibt erhalten.

| Bereich | Ergänzungen |
| --- | --- |
| Luftarten und Lüftung | ZUL → Zuluft; ABL → Abluft; AUL → Außenluft; FOL → Fortluft; RLT → Raumlufttechnik |
| Rückgewinnung und Luftverteilung | WRG → Wärmerückgewinnung; KRG → Kälterückgewinnung; VSR → Volumenstromregler; BSK → Brandschutzklappe |
| Temperaturen | Zulufttemp., Ablufttemp., Außenlufttemp., Fortlufttemp., Außentemp., Vorlauftemp., Rücklauftemp., Warmwassertemp. und Speichertemp. jeweils zur ausgeschriebenen Temperaturgröße |
| Heizung und Kälte | VL → Vorlauf; RL → Rücklauf; WW → Warmwasser; FBH → Fußbodenheizung; WP → Wärmepumpe; KM → Kältemaschine; RKW → Rückkühlwerk; PWT → Plattenwärmetauscher |
| Zähler | WMZ → Wärmemengenzähler; WZ → Wasserzähler |
| Aggregate und Schutzfunktionen | FU → Frequenzumrichter; Heizkr. → Heizkreis; Kühlkr. → Kühlkreis; Umwälzp. → Umwälzpumpe; Zirk.p. → Zirkulationspumpe; Motorsch. → Motorschutz; Frostsch. → Frostschutz; STB → Sicherheitstemperaturbegrenzer; STW → Sicherheitstemperaturwächter |
| Messgrößen | Diff.druck → Differenzdruck; Vol.strom → Volumenstrom; rel. Feuchte → relative Luftfeuchtigkeit; abs. Feuchte → absolute Luftfeuchtigkeit; CO2 → Kohlendioxid; VOC → flüchtige organische Verbindungen |
| Regelung und Meldungen | SW → Sollwert; Istw. → Istwert; Stellw. → Stellwert; Rückm. → Rückmeldung; Betriebsstd. → Betriebsstunden |
| Systeme | GA → Gebäudeautomation; GLT → Gebäudeleittechnik; SPS → speicherprogrammierbare Steuerung; MSR → Messen Steuern Regeln |

Die sechs bestehenden Definitionen Raumtemp., Y, FG, SM, BM und Temp. bleiben erhalten. Alle Vorgaben erscheinen in der Einstellungsliste und sind bearbeitbar. Bereits vorhandene eigene Definitionen desselben Kürzels haben Vorrang; entfernte Vorgaben bleiben entfernt.

## Abgrenzungen

Die Liste setzt keine Signalpolaritäten fest und bewertet keine Messwerte. Ein Frostschutz- oder Störkontakt wird durch den Begriff nicht automatisch als aktiv oder inaktiv eingestuft. CO2 und VOC sind getrennte Messgrößen; relative und absolute Feuchte werden ebenso getrennt behandelt. Ein Messwert wird nicht mit dem Sensor, einem Thermostat oder einem Sollwert gleichgesetzt.

Diese Kürzel werden bewusst nicht zusätzlich global vorbelegt:

| Kürzel | Grund |
| --- | --- |
| HK | Wird im Heizungsumfeld sowohl für Heizkreis als auch für Heizkörper verwendet. |
| KVS | TROX verwendet es für Kreislaufverbundsysteme und für konstanten Volumenstrom; eine globale Gleichsetzung wäre uneindeutig. |
| RM | Kann in Datenpunktlisten Rückmeldung oder Rauchmelder meinen. |
| AL | Kann je nach Plan Außenluft oder Abluft bezeichnen; verwendet werden die längeren Kürzel AUL und ABL. |
| KW | Ohne Anlagenbezug ist der gemeinte Wasserkreislauf beziehungsweise Messgrößenbezug nicht eindeutig. |
| DP | Kann Datenpunkt oder Differenzdruck meinen. |
| RT, RF | Projektspezifische Kürzel; RT kann beispielsweise Raumtemperatur oder Raumthermostat bezeichnen. Vorhandene eigene Definitionen bleiben möglich. |

Auch einzelne Buchstaben und allgemeine Wörter wie „zu“ oder „ab“ werden nicht neu zu Fachbegriffen umgedeutet. VSR bezeichnet den Regler; die spezifischen Betriebsweisen VAV und CAV werden nicht pauschal mit jedem VSR gleichgesetzt.

## Hersteller- und Fachquellen

1. [SEW – Temperaturänderungsgrad](https://www.sew-kempen.de/toolsundwissen/temperaturaenderungsgrad/): explizite Zuordnung von AUL, ZUL, FOL und ABL sowie Verwendung von WRG.
2. [SEW – Abkürzungsverzeichnis](https://www.sew-kempen.de/toolsundwissen/abkuerzungsverzeichnis/): unter anderem GLT, SPS, MSR, SW, KM, KRG, PWT, RKW, WP, WMZ und WZ. Die eigene Liste übernimmt eine Auswahl von Fachzuordnungen und keine Produkt- oder herstellerspezifischen Bezeichnungen.
3. [SAUTER – flexotron800, Benutzerhandbuch Lüftung](https://www.sauter-controls.com/wp-content/uploads/ImportPDM/797441.pdf): Temperaturmessgrößen, Feuchte, Volumenstrom, Differenzdruck, Pumpen, Motorschutz, Frostschutz, Soll- und Istwerte sowie CO2/VOC. Druckseiten 27–30, 43–74, 93–107 und 144–153 sind besonders relevant.
4. [Siemens – RVP360, Basisdokumentation](https://cache.industry.siemens.com/dl/files/924/109788924/att_1045682/v1/A6V10331099.pdf): Heizkreis, Vorlauf-, Rücklauf-, Außen- und Speichertemperaturen sowie Regelgrößen.
5. [TROX – Planungshandbuch RLT](https://www.trox.de/downloads/bb58453e061a1c4b/DM_2018_04_air_handling_units_DE_de.pdf): Raumlufttechnik, Rückgewinnung und Kreislaufverbundsysteme, insbesondere Druckseite 41. [TROX – EN](https://www.trox.de/kvs-volumenstromregler/en-d3ac2f6f5779e207) belegt die andere Verwendung von KVS für konstante Volumenströme.
6. [TROX – Übersicht Steuerung Brandschutzklappen](https://cdn.trox.de/4175f020abe15d86/b00d998a833b/BSK-Codes_V10_ab-250101.pdf): BSK. [ABB – FBVi](https://new.abb.com/low-voltage/de/produkte/gebaeudeautomation/produktsortiment/cylon/produkte/fbvi): VSR und zugehörige Mess- und Regelgrößen.
7. [SAUTER – Universalthermostat TUC](https://www.sauter-controls.com/produkt/universalthermostat/): klare Trennung von STB und STW. [BITZER – Betrieb mit Frequenzumrichter](https://www.bitzer.de/shared_media/html/st-420/de-DE/222107531222172939.html): FU.
8. [Vaillant – Planungsbeispiel Brennwertgeräte](https://kontakt.vaillant.de/downloads-1/planungsinformationen-1/brennwert-2/0020239042-int-berechnungsbeispiel-brennwert-042016-721964.pdf): FBH und VL/RL, Druckseite 15. [Viessmann – Vitosol Montageanleitung](https://community.viessmann.de/viessmann/attachments/viessmann/customers-solar/4320/1/5585094VMA00003_1.pdf): ausdrückliche Zuordnung von Vorlauf und Rücklauf, Druckseite 65.
9. [Belimo – Applikationen Luftaufbereitungsanlagen](https://www.belimo.com.cn/mam/europe/technical-documentation/technical-leaflets/belimo_applications/belimo_air-handling-units_application-brochure_de-ch.pdf): relative und absolute Feuchte, Druck und Volumenstrom sowie getrennte CO2- und VOC-Messung, Druckseite 47.
10. [SAUTER – Kanaltransmitter CO2 und Temperatur](https://www.sauter-controls.at/produkt/kanaltransmitter-co2-temp/): Kohlendioxid. [DGUV/IFA – Flüchtige organische Verbindungen](https://www.dguv.org/ifa/praxishilfen/innenraumarbeitsplaetze/chemische-einwirkungen/fluechtige-organische-verbindungen-voc/index.jsp): VOC und englische Langform.

## Umsetzung und Prüfung

Die Suchvarianten stehen direkt bei den Definitionen in `language.js`. Die globale Liste gilt weiterhin für alle Projekte und Controller desselben Browserprofils. Die Einstellungen, der JSON-Import und der Export akzeptieren die Schreibweisen CO2 und CO₂, während Klemmen- und Anlagenkennungen keine Begriffsdefinitionen werden können.

Weitere Bezeichnungen werden in Eingabe und Übersicht tabellarisch untereinander dargestellt. Jede Eingabezeile enthält ein Textfeld und eine Schaltfläche zum Entfernen. Neue Zeilen werden einzeln hinzugefügt; gespeichert wird weiterhin eine Liste von Zeichenfolgen. Bestehende Einträge und Importdateien benötigen keine Umwandlung. Leere Zeilen werden beim Speichern ausgelassen.

50 automatisierte Tests bestanden. Neue Prüffälle decken ähnliche Messgrößen, zusammengesetzte Namen, Umlaute beim Vorlesen, CO2 gegenüber Anlagenkennungen, das einmalige Fortschreiben des Katalogstands und den Erhalt eigener Änderungen ab. Kein Live-Controller-, Browser- oder Headsettest in dieser Umgebung. Das zuvor bereitgestellte Paket und seine Versionsnummer wurden nicht ersetzt.
