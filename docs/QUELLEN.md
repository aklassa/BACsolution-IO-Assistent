# Technische Grundlagen

Native APIs anhand offizieller Apple-Dokumentation vorbereitet:

- [WKWebView.callAsyncJavaScript](https://developer.apple.com/documentation/webkit/wkwebview/callasyncjavascript(_:arguments:in:contentworld:)) – strukturierte Argumente, asynchrone Ausführung innerhalb der authentifizierten Seite.
- [JavaScriptCore](https://developer.apple.com/documentation/javascriptcore) – lokale Wiederverwendung der bestehenden Such- und Begriffsregeln.
- [Speech](https://developer.apple.com/documentation/speech) – deutsche Spracherkennung.
- [requiresOnDeviceRecognition](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition) und [supportsOnDeviceRecognition](https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition) – lokale Erkennung nur auf unterstützten Geräten.
- [AVSpeechSynthesizer](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer) – native Sprachausgabe.
- [AVAudioSession.allowBluetooth](https://developer.apple.com/documentation/avfaudio/avaudiosession/categoryoptions-swift.struct/allowbluetooth) – HFP-Route für den unterstützten iOS-Bereich; bei einer späteren Mindestversion die aktuelle HFP-Option prüfen.
- [NSAllowsArbitraryLoadsInWebContent](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowsarbitraryloadsinwebcontent) – HTTP-Kompatibilität der Controller-Webansicht, ohne globale HTTP-Freigabe für den Abgleichclient. Navigation ist auf den ausgewählten Controller beschränkt; Zertifikatsfehler werden nicht umgangen.

Das LOYTEC-Protokoll wurde aus dem zuvor bereitgestellten Browser-I/O-Test der Firmware 8.4.20 übernommen. Es ist kein vorausgesetztes offizielles LOYTEC-SDK. Zugangsdaten und ursprüngliche HTML-Seiten sind nicht Bestandteil dieses Pakets. Belegquellen und Ausschlüsse der Gebäudeautomationsbegriffe stehen in `Shared/BEGRIFFE_QUELLEN.md`.
