// Answerline macOS system-audio helper.
//
// The implementation follows Apple's CoreAudio Process Tap contract. It is a
// separate process so the Electron main process stays JS-only while the tap
// and aggregate-device lifetime remain explicit and easy to tear down.
//
// CoreAudio Process Tap became usable for this purpose on macOS 14.4. It
// captures outgoing audio without creating a ScreenCaptureKit display stream,
// so starting Answerline does not start screen sharing.
//
// The tap/aggregate-device plumbing is adapted from OpenWhispr's
// `resources/macos-audio-tap.swift` (MIT, Copyright (c) 2024 OpenWhispr Team):
// https://github.com/OpenWhispr/openwhispr
//
// MIT License
// Copyright (c) 2024 OpenWhispr Team
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import AVFoundation
import AudioToolbox
import CoreAudio
import Foundation

@available(macOS 14.4, *)
struct Config {
    let sampleRate: Double
    let chunkMilliseconds: Int
}

@available(macOS 14.4, *)
final class AudioTapCapture {
    private let config: Config
    private let targetFormat: AVAudioFormat
    private let chunkBytes: Int
    private let ioQueue = DispatchQueue(label: "local.answerline.audio-tap")
    private let outputQueue = DispatchQueue(label: "local.answerline.audio-tap-output")
    private let outputLock = NSLock()
    private let maxQueuedOutputBytes = 16_000 * 2 * 2

    private var tapID: AudioObjectID = 0
    private var aggregateDeviceID: AudioObjectID = 0
    private var ioProcID: AudioDeviceIOProcID?
    private var converter: AVAudioConverter?
    private var sourceFormat: AVAudioFormat?
    private var pendingPCM = Data()
    private var outputChunks: [Data] = []
    private var queuedOutputBytes = 0
    private var outputDrainScheduled = false
    private var droppedOutputBytes = 0
    private var stopping = false

    init(config: Config) {
        self.config = config
        self.targetFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: config.sampleRate,
            channels: 1,
            interleaved: true
        )!
        self.chunkBytes = max(2, Int(config.sampleRate * Double(config.chunkMilliseconds) / 1000.0) * 2)
    }

    func start() throws {
        ioQueue.sync {
            stopping = false
            pendingPCM.removeAll(keepingCapacity: false)
        }
        let tapDescription = CATapDescription()
        tapDescription.name = "answerline-audio-tap"
        tapDescription.uuid = UUID()
        tapDescription.processes = []
        tapDescription.isMono = true
        tapDescription.isExclusive = true
        tapDescription.isMixdown = true
        tapDescription.isPrivate = true
        tapDescription.muteBehavior = .unmuted

        var newTapID = AudioObjectID()
        var status = AudioHardwareCreateProcessTap(tapDescription, &newTapID)
        guard status == noErr else {
            throw makeError("Не удалось создать CoreAudio Tap", status: status, operation: "create_process_tap")
        }
        tapID = newTapID

        let tapUID = try getTapUID()
        try createAggregateDevice(tapUID: tapUID)
        try waitForAggregateDeviceReady()
        try configureConverter()
        try registerIOProc()

        status = AudioDeviceStart(aggregateDeviceID, ioProcID)
        guard status == noErr else {
            throw makeError("Не удалось запустить агрегированное аудиоустройство", status: status, operation: "start_device")
        }

        emit(event: [
            "type": "start",
            "sampleRate": Int(config.sampleRate),
            "channels": 1,
            "bitsPerChannel": 16,
        ])
    }

    func stop() {
        let shouldStop = ioQueue.sync { () -> Bool in
            if stopping { return false }
            stopping = true
            return true
        }
        if !shouldStop { return }

        if aggregateDeviceID != 0 {
            AudioDeviceStop(aggregateDeviceID, ioProcID)
        }

        // AudioDeviceStop does not guarantee that an already queued callback has
        // finished. Drain the IO queue before touching its buffers or destroying
        // the aggregate device.
        ioQueue.sync {
            flushPendingPCM()
            pendingPCM.removeAll(keepingCapacity: false)
        }
        if let ioProcID {
            AudioDeviceDestroyIOProcID(aggregateDeviceID, ioProcID)
            self.ioProcID = nil
        }
        if aggregateDeviceID != 0 {
            AudioHardwareDestroyAggregateDevice(aggregateDeviceID)
            aggregateDeviceID = 0
        }
        if tapID != 0 {
            AudioHardwareDestroyProcessTap(tapID)
            tapID = 0
        }

        let droppedBytes = outputQueue.sync { () -> Int in
            drainOutput()
            outputLock.lock()
            let dropped = droppedOutputBytes
            droppedOutputBytes = 0
            outputLock.unlock()
            return dropped
        }
        if droppedBytes > 0 {
            emit(event: ["type": "error", "code": "output_overrun", "message": "Аудиопотребитель не успевал читать системный звук; часть PCM отброшена", "droppedBytes": droppedBytes])
        }
        emit(event: ["type": "stop"])
    }

    private func createAggregateDevice(tapUID: String) throws {
        let description: [String: Any] = [
            kAudioAggregateDeviceNameKey: "Answerline Audio Tap",
            kAudioAggregateDeviceUIDKey: "local.answerline.audio-tap.\(UUID().uuidString)",
            kAudioAggregateDeviceSubDeviceListKey: [],
            kAudioAggregateDeviceTapListKey: [[kAudioSubTapUIDKey: tapUID]],
            kAudioAggregateDeviceTapAutoStartKey: false,
            kAudioAggregateDeviceIsPrivateKey: true,
            kAudioAggregateDeviceIsStackedKey: false,
        ]

        var deviceID = AudioObjectID()
        let status = AudioHardwareCreateAggregateDevice(description as CFDictionary, &deviceID)
        guard status == noErr else {
            throw makeError("Не удалось создать приватное аудиоустройство", status: status, operation: "create_aggregate_device")
        }
        aggregateDeviceID = deviceID
    }

    private func waitForAggregateDeviceReady() throws {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceIsAlive,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )

        for _ in 0..<20 {
            var isAlive: UInt32 = 0
            var dataSize = UInt32(MemoryLayout<UInt32>.size)
            let status = AudioObjectGetPropertyData(
                aggregateDeviceID,
                &address,
                0,
                nil,
                &dataSize,
                &isAlive
            )
            if status == noErr, isAlive != 0 { return }
            Thread.sleep(forTimeInterval: 0.1)
        }

        throw makeError("Агрегированное аудиоустройство не стало доступным", operation: "wait_for_device")
    }

    private func configureConverter() throws {
        var asbd = AudioStreamBasicDescription()
        var dataSize = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioTapPropertyFormat,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )

        let status = AudioObjectGetPropertyData(tapID, &address, 0, nil, &dataSize, &asbd)
        guard status == noErr else {
            throw makeError("Не удалось прочитать формат CoreAudio Tap", status: status, operation: "get_tap_format")
        }
        guard let sourceFormat = AVAudioFormat(streamDescription: &asbd) else {
            throw makeError("Не удалось создать исходный аудиоформат", operation: "source_format")
        }
        guard let converter = AVAudioConverter(from: sourceFormat, to: targetFormat) else {
            throw makeError("Не удалось создать ресемплер аудио", operation: "create_converter")
        }

        self.sourceFormat = sourceFormat
        self.converter = converter
    }

    private func registerIOProc() throws {
        guard let sourceFormat, let converter else {
            throw makeError("Аудиоконвертер не настроен", operation: "register_ioproc")
        }

        var procID: AudioDeviceIOProcID?
        let status = AudioDeviceCreateIOProcIDWithBlock(
            &procID,
            aggregateDeviceID,
            ioQueue
        ) { [weak self] _, inputData, _, _, _ in
            guard let self, !self.stopping else { return }
            self.processInput(inputData, sourceFormat: sourceFormat, converter: converter)
        }

        guard status == noErr, let procID else {
            throw makeError("Не удалось зарегистрировать аудиоколбэк", status: status, operation: "create_ioproc")
        }
        ioProcID = procID
    }

    private func processInput(
        _ inputData: UnsafePointer<AudioBufferList>,
        sourceFormat: AVAudioFormat,
        converter: AVAudioConverter
    ) {
        let inputBufferList = UnsafeMutablePointer(mutating: inputData)
        guard let sourceBuffer = AVAudioPCMBuffer(
            pcmFormat: sourceFormat,
            bufferListNoCopy: inputBufferList,
            deallocator: nil
        ) else { return }

        let sourceRate = max(sourceFormat.sampleRate, 1)
        let targetCapacity = AVAudioFrameCount(
            ceil(Double(sourceBuffer.frameLength) * targetFormat.sampleRate / sourceRate)
        ) + 32
        guard let outputBuffer = AVAudioPCMBuffer(
            pcmFormat: targetFormat,
            frameCapacity: max(targetCapacity, 32)
        ) else { return }

        var didProvideInput = false
        var error: NSError?
        let status = converter.convert(to: outputBuffer, error: &error) { _, outStatus in
            if didProvideInput {
                outStatus.pointee = .noDataNow
                return nil
            }
            didProvideInput = true
            outStatus.pointee = .haveData
            return sourceBuffer
        }

        if let error {
            emit(event: ["type": "error", "code": "convert_failed", "message": error.localizedDescription])
            return
        }
        guard status == .haveData || status == .inputRanDry else { return }

        let audioBuffer = outputBuffer.audioBufferList.pointee.mBuffers
        guard let data = audioBuffer.mData, audioBuffer.mDataByteSize > 0 else { return }
        pendingPCM.append(data.assumingMemoryBound(to: UInt8.self), count: Int(audioBuffer.mDataByteSize))
        flushFullChunks()
    }

    private func flushFullChunks() {
        while pendingPCM.count >= chunkBytes {
            enqueueOutput(Data(pendingPCM.prefix(chunkBytes)))
            pendingPCM.removeSubrange(0..<chunkBytes)
        }
    }

    private func flushPendingPCM() {
        guard !pendingPCM.isEmpty else { return }
        enqueueOutput(Data(pendingPCM))
    }

    /**
     * The CoreAudio callback must never block on a pipe. Keep at most two seconds
     * of output queued and drop newest chunks if the consumer is stalled.
     */
    private func enqueueOutput(_ data: Data) {
        guard !data.isEmpty else { return }
        var scheduleDrain = false
        outputLock.lock()
        if queuedOutputBytes + data.count > maxQueuedOutputBytes {
            droppedOutputBytes += data.count
        } else {
            outputChunks.append(data)
            queuedOutputBytes += data.count
            if !outputDrainScheduled {
                outputDrainScheduled = true
                scheduleDrain = true
            }
        }
        outputLock.unlock()

        if scheduleDrain {
            outputQueue.async { [weak self] in self?.drainOutput() }
        }
    }

    private func drainOutput() {
        while true {
            outputLock.lock()
            guard !outputChunks.isEmpty else {
                outputDrainScheduled = false
                outputLock.unlock()
                return
            }
            let chunk = outputChunks.removeFirst()
            queuedOutputBytes -= chunk.count
            outputLock.unlock()

            chunk.withUnsafeBytes { rawBuffer in
                guard let baseAddress = rawBuffer.baseAddress else { return }
                writeAll(fd: STDOUT_FILENO, buffer: baseAddress, count: rawBuffer.count)
            }
        }
    }

    private func getTapUID() throws -> String {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioTapPropertyUID,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        // The HAL writes an unmanaged, retained CFString pointer into this
        // storage. Using CFString directly has the wrong ABI shape on arm64 and
        // produces the opaque '!obj' (bad object) status even after a tap was
        // created successfully. On some macOS releases the object is registered
        // a few milliseconds after creation, so retry a transient bad-object
        // response before reporting a real failure.
        var lastStatus: OSStatus = kAudioHardwareBadObjectError
        for _ in 0..<20 {
            var unmanagedUID: Unmanaged<CFString>?
            var dataSize = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
            let status = withUnsafeMutablePointer(to: &unmanagedUID) { pointer in
                AudioObjectGetPropertyData(tapID, &address, 0, nil, &dataSize, pointer)
            }
            if status == noErr, let unmanagedUID { return unmanagedUID.takeRetainedValue() as String }
            lastStatus = status
            Thread.sleep(forTimeInterval: 0.05)
        }
        throw makeError("Не удалось получить идентификатор CoreAudio Tap", status: lastStatus, operation: "get_tap_uid")
    }
}

@available(macOS 14.4, *)
func parseConfig() -> Config {
    var sampleRate = 16_000.0
    var chunkMilliseconds = 100
    let args = Array(CommandLine.arguments.dropFirst())
    var index = 0

    while index < args.count {
        switch args[index] {
        case "--sample-rate":
            if index + 1 < args.count, let value = Double(args[index + 1]), value > 0 { sampleRate = value }
            index += 2
        case "--chunk-ms":
            if index + 1 < args.count, let value = Int(args[index + 1]), value > 0 { chunkMilliseconds = value }
            index += 2
        default:
            index += 1
        }
    }
    return Config(sampleRate: sampleRate, chunkMilliseconds: chunkMilliseconds)
}

func emit(event: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(event), let data = try? JSONSerialization.data(withJSONObject: event) else { return }
    FileHandle.standardError.write(data)
    FileHandle.standardError.write(Data([0x0a]))
}

func writeAll(fd: Int32, buffer: UnsafeRawPointer, count: Int) {
    var written = 0
    while written < count {
        let result = Darwin.write(fd, buffer.advanced(by: written), count - written)
        if result <= 0 { break }
        written += result
    }
}

func makeError(_ message: String, status: OSStatus? = nil, operation: String, code: String? = nil) -> NSError {
    var userInfo: [String: Any] = [NSLocalizedDescriptionKey: message]
    userInfo["AudioTapErrorCode"] = code ?? inferErrorCode(status: status, operation: operation)
    userInfo["AudioTapOperation"] = operation
    if let status {
        userInfo["AudioTapStatus"] = Int(status)
        userInfo["NSLocalizedFailureReasonErrorKey"] = "\(message): \(Int(status))"
    }
    return NSError(domain: "WisperSoloAudioTap", code: Int(status ?? -1), userInfo: userInfo)
}

func inferErrorCode(status: OSStatus?, operation: String) -> String {
    status == kAudioHardwareIllegalOperationError ? "permission_denied" : operation
}

if #available(macOS 14.4, *) {
    let capture = AudioTapCapture(config: parseConfig())
    var signalSources: [DispatchSourceSignal] = []

    func stopAndExit(_ code: Int32) -> Never {
        capture.stop()
        exit(code)
    }

    signal(SIGINT, SIG_IGN)
    signal(SIGTERM, SIG_IGN)
    for signalValue in [SIGINT, SIGTERM] {
        let source = DispatchSource.makeSignalSource(signal: signalValue, queue: .main)
        source.setEventHandler { stopAndExit(0) }
        source.resume()
        signalSources.append(source)
    }

    do {
        try capture.start()
        dispatchMain()
    } catch {
        let nsError = error as NSError
        emit(event: [
            "type": "error",
            "code": nsError.userInfo["AudioTapErrorCode"] as? String ?? "start_failed",
            "message": nsError.localizedDescription,
            "operation": nsError.userInfo["AudioTapOperation"] as? String ?? "start",
            "status": nsError.userInfo["AudioTapStatus"] as? Int ?? nsError.code,
        ])
        capture.stop()
        exit(1)
    }
} else {
    emit(event: ["type": "error", "code": "unsupported_os", "message": "macOS 14.4 or later is required"])
    exit(1)
}
