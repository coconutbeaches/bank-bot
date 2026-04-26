import Foundation
import Vision
import ImageIO

enum OcrError: Error {
  case invalidArguments
  case imageLoadFailed
}

func loadImage(at path: String) throws -> CGImage {
  let url = URL(fileURLWithPath: path)
  guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
        let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    throw OcrError.imageLoadFailed
  }
  return image
}

func recognizeText(in image: CGImage) throws -> String {
  var recognizedText = ""
  var requestError: Error?

  let request = VNRecognizeTextRequest { request, error in
    requestError = error
    guard let observations = request.results as? [VNRecognizedTextObservation] else {
      return
    }
    let lines = observations.compactMap { $0.topCandidates(1).first?.string }
    recognizedText = lines.joined(separator: "\n")
  }

  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = false
  request.recognitionLanguages = ["th-TH", "en-US"]

  let handler = VNImageRequestHandler(cgImage: image, options: [:])
  try handler.perform([request])

  if let requestError {
    throw requestError
  }

  return recognizedText
}

do {
  guard CommandLine.arguments.count >= 2 else {
    throw OcrError.invalidArguments
  }

  let image = try loadImage(at: CommandLine.arguments[1])
  let text = try recognizeText(in: image)
  FileHandle.standardOutput.write(Data(text.utf8))
} catch {
  FileHandle.standardError.write(Data("\(error)\n".utf8))
  exit(1)
}
