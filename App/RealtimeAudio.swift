import AVFoundation

// Native PCM transport; the controller browser never receives microphone access.
@MainActor final class RealtimeAudio {
    private var engine = AVAudioEngine()
    private var player = AVAudioPlayerNode()
    private var tapped = false
    private var itemID: String?
    private var itemStart: AVAudioFramePosition = 0
    private var scheduledFrames: AVAudioFramePosition = 0
    private var completedFrames: AVAudioFramePosition = 0
    private var playbackID = UUID()
    private var bufferGeneration = UUID()
    private(set) var queuedBuffers = 0
    var onPCM: ((Data) -> Void)?
    var onError: ((String) -> Void)?
    private let playbackFormat = AVAudioFormat(standardFormatWithSampleRate: 24_000, channels: 1)!

    func start() throws {
        stop()
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .defaultToSpeaker])
        try session.setActive(true)
        engine = AVAudioEngine(); player = AVAudioPlayerNode()
        try engine.inputNode.setVoiceProcessingEnabled(true)
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: playbackFormat)
        let input = engine.inputNode, source = input.outputFormat(forBus: 0)
        guard source.sampleRate > 0, source.channelCount > 0,
              let target = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 24_000, channels: 1, interleaved: false),
              let converter = AVAudioConverter(from: source, to: target) else { throw AppFailure("Mikrofonformat nicht verfügbar.") }
        let captureID = UUID(); playbackID = captureID
        input.installTap(onBus: 0, bufferSize: 2048, format: source) { [weak self] buffer, _ in
            let capacity = AVAudioFrameCount(ceil(Double(buffer.frameLength) * 24_000 / source.sampleRate) + 32)
            guard let converted = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }
            var supplied = false, error: NSError?
            converter.convert(to: converted, error: &error) { _, status in
                if supplied { status.pointee = .noDataNow; return nil }
                supplied = true; status.pointee = .haveData; return buffer
            }
            guard error == nil, let samples = converted.int16ChannelData?[0] else {
                Task { @MainActor in
                    guard let self, self.playbackID == captureID else { return }
                    self.onError?("Mikrofon konnte nicht verarbeitet werden.")
                }; return
            }
            let data = Data(bytes: samples, count: Int(converted.frameLength) * 2)
            Task { @MainActor in
                guard let self, self.playbackID == captureID, self.engine.isRunning, !data.isEmpty else { return }
                self.onPCM?(data)
            }
        }
        tapped = true
        engine.prepare(); try engine.start(); player.play()
    }

    private var sampleTime: AVAudioFramePosition {
        guard let time = player.lastRenderTime, let position = player.playerTime(forNodeTime: time) else { return 0 }
        return position.sampleTime
    }
    func play(_ data: Data, item: String) throws {
        guard engine.isRunning, !data.isEmpty, data.count % 2 == 0, data.count <= 240_000 else { throw AppFailure("Ungültige KI-Audiodaten.") }
        if itemID != item {
            guard queuedBuffers == 0 else { throw AppFailure("Überlappende KI-Antworten. Sitzung bitte erneut starten.") }
            itemID = item; itemStart = sampleTime; scheduledFrames = 0; completedFrames = 0
        }
        let count = data.count / 2
        guard scheduledFrames - completedFrames + Int64(count) < 1_080_000 else { throw AppFailure("KI-Sprachausgabe zu lang. Sitzung bitte erneut starten.") }
        guard let buffer = AVAudioPCMBuffer(pcmFormat: playbackFormat, frameCapacity: AVAudioFrameCount(count)),
              let output = buffer.floatChannelData?[0] else { throw AppFailure("Sprachausgabe nicht verfügbar.") }
        buffer.frameLength = AVAudioFrameCount(count)
        data.withUnsafeBytes { raw in
            let bytes = raw.bindMemory(to: UInt8.self)
            for index in 0..<count {
                let value = Int16(bitPattern: UInt16(bytes[index * 2]) | (UInt16(bytes[index * 2 + 1]) << 8))
                output[index] = Float(value) / 32768
            }
        }
        scheduledFrames += Int64(count); queuedBuffers += 1
        let playback = bufferGeneration
        player.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.bufferGeneration == playback else { return }
                self.completedFrames += Int64(count); self.queuedBuffers = max(0, self.queuedBuffers - 1)
            }
        }
        if !player.isPlaying { player.play() }
    }
    func interrupt() -> (String, Int)? {
        bufferGeneration = UUID()
        let played = min(scheduledFrames, max(completedFrames, sampleTime - itemStart))
        let result = queuedBuffers > 0 ? itemID.map { ($0, max(0, Int(played * 1000 / 24_000))) } : nil
        player.stop(); if engine.isRunning { player.play() }
        // Capture callbacks also use this generation, so do not change it here.
        itemID = nil; itemStart = 0; scheduledFrames = 0; completedFrames = 0; queuedBuffers = 0
        return result
    }
    func stop() {
        playbackID = UUID(); bufferGeneration = UUID(); player.stop(); engine.stop()
        if tapped { engine.inputNode.removeTap(onBus: 0); tapped = false }
        itemID = nil; scheduledFrames = 0; completedFrames = 0; queuedBuffers = 0
    }
}
