package com.visiongenieapp

import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

class FileTransferModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "FileTransferModule"

  @ReactMethod
  fun saveRemoteFile(input: ReadableMap, promise: Promise) {
    Thread {
      try {
        val url = input.getString("url")?.trim().orEmpty()
        if (url.isBlank()) {
          promise.reject("file_transfer_missing_url", "url is required")
          return@Thread
        }
        val target = input.getString("target")?.trim()?.lowercase().orEmpty().ifBlank { "downloads" }
        val mimeType = detectMimeType(input.getString("mimeType"), input.getString("fileName"), url)
        val fileName = ensureFileName(
          input.getString("fileName"),
          mimeType,
          url,
        )
        val savedUri =
          if (target == "photos" && mimeType.startsWith("image/")) {
            saveToPhotos(url, fileName, mimeType)
          } else {
            saveToDownloads(url, fileName, mimeType)
          }
        val result = Arguments.createMap().apply {
          putString("uri", savedUri.toString())
          putString("savedTo", if (target == "photos" && mimeType.startsWith("image/")) "photos" else "downloads")
          putString("fileName", fileName)
        }
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("file_transfer_failed", error)
      }
    }.start()
  }

  private fun saveToPhotos(url: String, fileName: String, mimeType: String): Uri {
    val resolver = reactApplicationContext.contentResolver
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val values =
        ContentValues().apply {
          put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
          put(MediaStore.Images.Media.MIME_TYPE, mimeType)
          put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/VisionGenie")
          put(MediaStore.Images.Media.IS_PENDING, 1)
        }
      val uri =
        resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
          ?: throw IllegalStateException("Unable to create MediaStore item")
      resolver.openOutputStream(uri)?.use { output ->
        downloadToStream(url, output)
      } ?: throw IllegalStateException("Unable to open photo output stream")
      values.clear()
      values.put(MediaStore.Images.Media.IS_PENDING, 0)
      resolver.update(uri, values, null, null)
      return uri
    }

    val directory = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "VisionGenie")
    if (!directory.exists()) {
      directory.mkdirs()
    }
    val outputFile = File(directory, fileName)
    FileOutputStream(outputFile).use { output ->
      downloadToStream(url, output)
    }
    return Uri.fromFile(outputFile)
  }

  private fun saveToDownloads(url: String, fileName: String, mimeType: String): Uri {
    val resolver = reactApplicationContext.contentResolver
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val values =
        ContentValues().apply {
          put(MediaStore.Downloads.DISPLAY_NAME, fileName)
          put(MediaStore.Downloads.MIME_TYPE, mimeType)
          put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/VisionGenie")
          put(MediaStore.Downloads.IS_PENDING, 1)
        }
      val uri =
        resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
          ?: throw IllegalStateException("Unable to create Downloads item")
      resolver.openOutputStream(uri)?.use { output ->
        downloadToStream(url, output)
      } ?: throw IllegalStateException("Unable to open downloads output stream")
      values.clear()
      values.put(MediaStore.Downloads.IS_PENDING, 0)
      resolver.update(uri, values, null, null)
      return uri
    }

    val directory = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "VisionGenie")
    if (!directory.exists()) {
      directory.mkdirs()
    }
    val outputFile = File(directory, fileName)
    FileOutputStream(outputFile).use { output ->
      downloadToStream(url, output)
    }
    return Uri.fromFile(outputFile)
  }

  private fun downloadToStream(url: String, output: java.io.OutputStream) {
    val connection = URL(url).openConnection() as HttpURLConnection
    connection.connectTimeout = 15000
    connection.readTimeout = 30000
    connection.instanceFollowRedirects = true
    connection.requestMethod = "GET"
    connection.connect()
    if (connection.responseCode !in 200..299) {
      throw IllegalStateException("Download failed with HTTP ${connection.responseCode}")
    }
    connection.inputStream.use { input ->
      input.copyTo(output)
    }
    connection.disconnect()
  }

  private fun detectMimeType(explicitMimeType: String?, explicitFileName: String?, url: String): String {
    val explicit = explicitMimeType?.trim().orEmpty()
    if (explicit.isNotBlank()) {
      return explicit
    }
    val extension =
      MimeTypeMap.getFileExtensionFromUrl(explicitFileName ?: url)?.lowercase().orEmpty()
    return MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension) ?: "application/octet-stream"
  }

  private fun ensureFileName(explicitFileName: String?, mimeType: String, url: String): String {
    val trimmed = explicitFileName?.trim().orEmpty()
    if (trimmed.isNotBlank()) {
      return trimmed
    }
    val urlName = Uri.parse(url).lastPathSegment?.substringAfterLast('/')?.trim().orEmpty()
    if (urlName.isNotBlank()) {
      return urlName
    }
    val extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType) ?: "bin"
    return "visiongenie_${System.currentTimeMillis()}.$extension"
  }
}
