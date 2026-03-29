import Foundation
import Photos
import React

@objc(FileTransferModule)
class FileTransferModule: NSObject {
  @objc
  func saveRemoteFile(
    _ input: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let rawUrl = input["url"] as? String, let url = URL(string: rawUrl), !rawUrl.isEmpty else {
      reject("file_transfer_missing_url", "url is required", nil)
      return
    }

    let target = (input["target"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? "downloads"
    let mimeType = detectMimeType(
      explicitMimeType: input["mimeType"] as? String,
      explicitFileName: input["fileName"] as? String,
      remoteUrl: url
    )
    let fileName = ensureFileName(
      explicitFileName: input["fileName"] as? String,
      mimeType: mimeType,
      remoteUrl: url
    )

    let task = URLSession.shared.downloadTask(with: url) { tempUrl, _, error in
      if let error {
        reject("file_transfer_failed", error.localizedDescription, error)
        return
      }
      guard let tempUrl else {
        reject("file_transfer_failed", "download completed without a file", nil)
        return
      }

      do {
        if target == "photos", mimeType.hasPrefix("image/") {
          self.saveImageToPhotos(tempUrl: tempUrl, fileName: fileName) { result in
            switch result {
            case .success(let savedUri):
              resolve([
                "uri": savedUri.absoluteString,
                "savedTo": "photos",
                "fileName": fileName,
              ])
            case .failure(let error):
              reject("file_transfer_failed", error.localizedDescription, error)
            }
          }
          return
        }

        let destination = try self.saveToDocuments(tempUrl: tempUrl, fileName: fileName)
        resolve([
          "uri": destination.absoluteString,
          "savedTo": "documents",
          "fileName": fileName,
        ])
      } catch {
        reject("file_transfer_failed", error.localizedDescription, error)
      }
    }
    task.resume()
  }

  private func saveImageToPhotos(tempUrl: URL, fileName: String, completion: @escaping (Result<URL, Error>) -> Void) {
    PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
      guard status == .authorized || status == .limited else {
        completion(.failure(NSError(domain: "FileTransferModule", code: 1, userInfo: [
          NSLocalizedDescriptionKey: "photo_library_write_not_authorized",
        ])))
        return
      }

      var localIdentifier = ""
      PHPhotoLibrary.shared().performChanges({
        let request = PHAssetCreationRequest.forAsset()
        request.addResource(with: .photo, fileURL: tempUrl, options: nil)
        localIdentifier = request.placeholderForCreatedAsset?.localIdentifier ?? ""
      }) { success, error in
        if let error {
          completion(.failure(error))
          return
        }
        if success {
          completion(.success(URL(string: "ph://\(localIdentifier)") ?? tempUrl))
        } else {
          completion(.failure(NSError(domain: "FileTransferModule", code: 2, userInfo: [
            NSLocalizedDescriptionKey: "photo_save_failed",
          ])))
        }
      }
    }
  }

  private func saveToDocuments(tempUrl: URL, fileName: String) throws -> URL {
    let documentsDirectory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
    let visionDirectory = documentsDirectory.appendingPathComponent("VisionGenie", isDirectory: true)
    if !FileManager.default.fileExists(atPath: visionDirectory.path) {
      try FileManager.default.createDirectory(at: visionDirectory, withIntermediateDirectories: true)
    }
    let destination = visionDirectory.appendingPathComponent(fileName)
    if FileManager.default.fileExists(atPath: destination.path) {
      try FileManager.default.removeItem(at: destination)
    }
    try FileManager.default.moveItem(at: tempUrl, to: destination)
    return destination
  }

  private func detectMimeType(explicitMimeType: String?, explicitFileName: String?, remoteUrl: URL) -> String {
    let explicit = explicitMimeType?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !explicit.isEmpty {
      return explicit
    }
    let fileName = explicitFileName?.isEmpty == false ? explicitFileName! : remoteUrl.lastPathComponent
    let ext = URL(fileURLWithPath: fileName).pathExtension.lowercased()
    switch ext {
    case "jpg", "jpeg":
      return "image/jpeg"
    case "png":
      return "image/png"
    case "glb":
      return "model/gltf-binary"
    case "gltf":
      return "model/gltf+json"
    case "obj":
      return "text/plain"
    case "mp4":
      return "video/mp4"
    default:
      return "application/octet-stream"
    }
  }

  private func ensureFileName(explicitFileName: String?, mimeType: String, remoteUrl: URL) -> String {
    let trimmed = explicitFileName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !trimmed.isEmpty {
      return trimmed
    }
    let urlName = remoteUrl.lastPathComponent.trimmingCharacters(in: .whitespacesAndNewlines)
    if !urlName.isEmpty {
      return urlName
    }
    let ext: String
    switch mimeType {
    case "image/jpeg":
      ext = "jpg"
    case "image/png":
      ext = "png"
    case "model/gltf-binary":
      ext = "glb"
    case "model/gltf+json":
      ext = "gltf"
    default:
      ext = "bin"
    }
    return "visiongenie_\(Int(Date().timeIntervalSince1970)).\(ext)"
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }
}
