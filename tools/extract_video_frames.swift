import AVFoundation
import AppKit
import Foundation

guard CommandLine.arguments.count >= 4 else {
    fputs("usage: extract_video_frames <video> <output-dir> <count>\n", stderr)
    exit(1)
}

let videoURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
let frameCount = max(2, Int(CommandLine.arguments[3]) ?? 12)
try FileManager.default.createDirectory(at: outputURL, withIntermediateDirectories: true)

let asset = AVURLAsset(url: videoURL)
let duration = try await asset.load(.duration)
let seconds = CMTimeGetSeconds(duration)
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero

for index in 0..<frameCount {
    let ratio = Double(index) / Double(frameCount - 1)
    let time = CMTime(seconds: seconds * ratio, preferredTimescale: 600)
    let image = try generator.copyCGImage(at: time, actualTime: nil)
    let bitmap = NSBitmapImageRep(cgImage: image)
    guard let data = bitmap.representation(using: .png, properties: [:]) else {
        continue
    }
    let filename = String(format: "frame-%02d-%06.2fs.png", index, seconds * ratio)
    try data.write(to: outputURL.appendingPathComponent(filename))
}

print(String(format: "duration=%.2f frames=%d", seconds, frameCount))
