package com.visiongenieapp.colorengine

import android.content.ContentValues
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import org.json.JSONArray
import org.json.JSONObject

class ProColorEngineModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    init {
      System.loadLibrary("procolorengine")
    }

    private const val LOCAL_MASK_UNIFORM_SIZE = 24
    private const val HSL_UNIFORM_SIZE = 24
    private const val CURVE_UNIFORM_SIZE = 20
    private const val WHEEL_UNIFORM_SIZE = 9
    private const val LUT_META_SIZE = 9
  }

  override fun getName(): String = "ProColorEngine"

  @ReactMethod
  fun getCapabilities(promise: Promise) {
    try {
      val snapshot = EngineCapability.snapshot(reactApplicationContext)
      val result = Arguments.createMap().apply {
        putString("platform", "android")
        putBoolean("supportsNativePro", snapshot.supportsNativePro)
        putDouble("recommendedPreviewScale", snapshot.recommendedPreviewScale)
        putString("recommendedExportFormat", snapshot.recommendedExportFormat)
        putInt("maxPreviewDimension", snapshot.maxPreviewDimension)
        putString("fallbackReason", snapshot.fallbackReason)
        putString("workingSpace", snapshot.workingSpace)
      }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("pro_engine_capability_error", error)
    }
  }

  @ReactMethod
  fun decodeSource(uri: String, maxDimension: Int, promise: Promise) {
    try {
      val stagedFile = stageSource(uri)
      if (isHeifSource(uri, stagedFile.absolutePath)) {
        val heifPreview = decodeHeifPreview(uri, stagedFile, maxDimension)
        val result = Arguments.createMap().apply {
          putInt("width", heifPreview.width)
          putInt("height", heifPreview.height)
          putString("previewBase64", heifPreview.previewBase64)
          putString("nativeSourcePath", stagedFile.absolutePath)
          putInt("bitDepthHint", 8)
          putString("workingSpace", "linear_srgb")
          putString("sourceType", "bitmap")
        }
        promise.resolve(result)
        return
      }

      val nativeJson = nativeDecodeSource(
        stagedFile.absolutePath,
        maxDimension,
        reactApplicationContext.cacheDir.absolutePath,
      )
      val payload = JSONObject(nativeJson)
      val previewPath = payload.optString("previewPath")
      if (previewPath.isNullOrBlank()) {
        promise.reject("decode_source_failed", "native decode returned empty preview path")
        return
      }

      val previewFile = File(previewPath)
      val previewBytes = previewFile.readBytes()
      val result = Arguments.createMap().apply {
        putInt("width", payload.optInt("width"))
        putInt("height", payload.optInt("height"))
        putString("previewBase64", Base64.encodeToString(previewBytes, Base64.NO_WRAP))
        putString("nativeSourcePath", payload.optString("nativeSourcePath", stagedFile.absolutePath))
        putInt("bitDepthHint", payload.optInt("bitDepthHint", 8))
        putString("workingSpace", payload.optString("workingSpace", "linear_srgb"))
        putString("sourceType", payload.optString("sourceType", "raw"))
      }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("decode_source_failed", error)
    }
  }

  @ReactMethod
  fun exportImage(request: ReadableMap, promise: Promise) {
    try {
      val sourceUri = request.getString("sourceUri")
      if (sourceUri.isNullOrBlank()) {
        promise.reject("export_source_missing", "sourceUri is required")
        return
      }

      val nativeSourcePath =
        request.getString("nativeSourcePath")?.takeIf { it.isNotBlank() }
          ?: stageSource(sourceUri).absolutePath
      val resolvedSourcePath =
        if (isHeifSource(sourceUri, nativeSourcePath)) {
          convertHeifToPngSource(sourceUri, nativeSourcePath).absolutePath
        } else {
          nativeSourcePath
        }
      val format = request.getString("format") ?: "png16"
      val bitDepth = request.getInt("bitDepth")
      val iccProfile = request.getString("iccProfile") ?: "display_p3"
      val quality = request.getDouble("quality")
      val workingSpace = request.getString("workingSpace") ?: "linear_prophoto"
      val isRawSource = if (request.hasKey("isRawSource")) request.getBoolean("isRawSource") else false

      val exportDir = File(reactApplicationContext.cacheDir, "exports").apply { mkdirs() }
      val extension =
        when (format) {
          "jpeg" -> "jpg"
          "tiff16" -> "tiff"
          else -> "png"
        }
      val outputFile = File(exportDir, "visiongenie_${System.currentTimeMillis()}.$extension")

      val paramsMap = request.getMap("params")
      val localMasksArray = request.getArray("localMasks")
      val lutMap = request.getMap("lut")
      val lutDataMap = request.getMap("lutData")
      val nativeJson = nativeExportImage(
        resolvedSourcePath,
        outputFile.absolutePath,
        format,
        bitDepth,
        iccProfile,
        quality,
        workingSpace,
        flattenBasicAndColorBalance(paramsMap),
        flattenCurves(paramsMap),
        flattenWheels(paramsMap),
        flattenHsl(request.getMap("hsl")),
        flattenLutMeta(lutMap, lutDataMap),
        flattenLutData(lutMap, lutDataMap),
        flattenLocalMasks(localMasksArray),
        isRawSource,
      )

      val payload = JSONObject(nativeJson)
      val warnings = payload.optJSONArray("warnings") ?: JSONArray()
      val warningsArray = Arguments.createArray()
      for (index in 0 until warnings.length()) {
        warningsArray.pushString(warnings.optString(index))
      }
      val payloadGraphHash = payload.optString("graphHash")
      val resolvedGraphHash =
        if (payloadGraphHash.isNotBlank()) payloadGraphHash else request.getString("graphHash")

      val result = Arguments.createMap().apply {
        putString("uri", payload.optString("uri", outputFile.absolutePath))
        putInt("width", payload.optInt("width"))
        putInt("height", payload.optInt("height"))
        putInt("fileSize", payload.optInt("fileSize"))
        putString("format", payload.optString("format", format))
        putInt("bitDepth", payload.optInt("bitDepth", bitDepth))
        putInt("effectiveBitDepth", payload.optInt("effectiveBitDepth", bitDepth))
        putString("iccProfile", payload.optString("iccProfile", iccProfile))
        putString("graphHash", resolvedGraphHash)
        putBoolean("gamutMappingApplied", payload.optBoolean("gamutMappingApplied", false))
        putBoolean("toneMapApplied", payload.optBoolean("toneMapApplied", false))
        putArray("warnings", warningsArray)
      }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("export_image_failed", error)
    }
  }

  @ReactMethod
  fun saveToGallery(request: ReadableMap, promise: Promise) {
    var insertedUri: Uri? = null
    try {
      val sourceUri = request.getString("sourceUri")?.takeIf { it.isNotBlank() }
      if (sourceUri.isNullOrBlank()) {
        promise.reject("save_to_gallery_missing_source", "sourceUri is required")
        return
      }

      val mimeType = request.getString("mimeType")?.takeIf { it.isNotBlank() } ?: detectMimeType(sourceUri)
      val extension = detectExtension(mimeType)
      val albumName = request.getString("albumName")?.takeIf { it.isNotBlank() } ?: "VisionGenie"
      val displayName = ensureExtension(
        request.getString("displayName")?.takeIf { it.isNotBlank() }
          ?: "visiongenie_${System.currentTimeMillis()}.$extension",
        extension,
      )

      val resolver = reactApplicationContext.contentResolver
      val collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI
      val nowSeconds = System.currentTimeMillis() / 1000
      val values = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, displayName)
        put(MediaStore.Images.Media.MIME_TYPE, mimeType)
        put(MediaStore.Images.Media.DATE_ADDED, nowSeconds)
        put(MediaStore.Images.Media.DATE_MODIFIED, nowSeconds)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          put(
            MediaStore.Images.Media.RELATIVE_PATH,
            "${Environment.DIRECTORY_PICTURES}/$albumName",
          )
          put(MediaStore.Images.Media.IS_PENDING, 1)
        } else {
          val legacyDir =
            File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), albumName)
          if (!legacyDir.exists()) {
            legacyDir.mkdirs()
          }
          put(MediaStore.Images.Media.DATA, File(legacyDir, displayName).absolutePath)
        }
      }

      insertedUri = resolver.insert(collection, values)
      if (insertedUri == null) {
        throw IllegalStateException("Unable to create MediaStore item")
      }

      openSourceInputStream(sourceUri).use { input ->
        resolver.openOutputStream(insertedUri, "w").use { output ->
          requireNotNull(output) { "Unable to open output stream: $insertedUri" }
          input.copyTo(output)
        }
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val pendingClear = ContentValues().apply {
          put(MediaStore.Images.Media.IS_PENDING, 0)
        }
        resolver.update(insertedUri, pendingClear, null, null)
      }

      val fileSize =
        resolver.openFileDescriptor(insertedUri, "r")?.use { descriptor ->
          val statSize = descriptor.statSize
          if (statSize > 0) statSize.toInt() else 0
        } ?: 0

      val relativePath =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          "${Environment.DIRECTORY_PICTURES}/$albumName"
        } else {
          null
        }

      val result = Arguments.createMap().apply {
        putString("uri", insertedUri.toString())
        putString("displayName", displayName)
        putString("mimeType", mimeType)
        putInt("fileSize", fileSize)
        putString("relativePath", relativePath)
      }
      promise.resolve(result)
    } catch (error: Exception) {
      insertedUri?.let { uri ->
        reactApplicationContext.contentResolver.delete(uri, null, null)
      }
      promise.reject("save_to_gallery_failed", error)
    }
  }

  private fun stageSource(uriString: String): File {
    val directPath = uriString.removePrefix("file://")
    val directFile = File(directPath)
    if (directFile.exists()) {
      return directFile
    }

    val sourceUri = Uri.parse(uriString)
    val extension =
      sourceUri.lastPathSegment?.substringAfterLast('.', "")
        ?.takeIf { it.isNotBlank() }
        ?.let { ".$it" }
        ?: ".bin"
    val stagingDir = File(reactApplicationContext.cacheDir, "native_source").apply { mkdirs() }
    val targetFile = File(stagingDir, "src_${sourceUri.hashCode()}$extension")
    reactApplicationContext.contentResolver.openInputStream(sourceUri).use { input ->
      requireNotNull(input) { "Unable to open source uri: $uriString" }
      FileOutputStream(targetFile).use { output ->
        input.copyTo(output)
      }
    }
    return targetFile
  }

  private data class HeifPreviewPayload(
    val width: Int,
    val height: Int,
    val previewBase64: String,
  )

  private fun isHeifSource(uriString: String, filePath: String?): Boolean {
    val uri = Uri.parse(uriString)
    val mime = reactApplicationContext.contentResolver.getType(uri)?.lowercase() ?: ""
    if (mime.contains("heic") || mime.contains("heif")) {
      return true
    }

    val uriText = uriString.lowercase()
    if (uriText.endsWith(".heic") || uriText.endsWith(".heif")) {
      return true
    }

    val lowerPath = filePath?.lowercase() ?: ""
    return lowerPath.endsWith(".heic") || lowerPath.endsWith(".heif")
  }

  private fun decodeHeifPreview(
    uriString: String,
    stagedFile: File,
    maxDimension: Int,
  ): HeifPreviewPayload {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
      throw IllegalStateException("HEIF decode requires Android 9+ ImageDecoder")
    }

    val source = createImageDecoderSource(uriString, stagedFile)
    val bitmap = ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
      val sourceWidth = info.size.width
      val sourceHeight = info.size.height
      val longEdge = maxOf(sourceWidth, sourceHeight)
      if (longEdge > maxDimension && maxDimension > 0) {
        val scale = maxDimension.toFloat() / longEdge.toFloat()
        val targetWidth = maxOf(1, (sourceWidth * scale).toInt())
        val targetHeight = maxOf(1, (sourceHeight * scale).toInt())
        decoder.setTargetSize(targetWidth, targetHeight)
      }
      decoder.isMutableRequired = false
      decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
    }

    val width = bitmap.width
    val height = bitmap.height
    val bytes = compressBitmapToPngBytes(bitmap)
    bitmap.recycle()
    return HeifPreviewPayload(
      width = width,
      height = height,
      previewBase64 = Base64.encodeToString(bytes, Base64.NO_WRAP),
    )
  }

  private fun convertHeifToPngSource(uriString: String, fallbackPath: String): File {
    val cacheDir = File(reactApplicationContext.cacheDir, "heif_source").apply { mkdirs() }
    val convertedFile = File(cacheDir, "heif_${uriString.hashCode()}.png")
    if (convertedFile.exists()) {
      return convertedFile
    }

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
      throw IllegalStateException("HEIF source conversion requires Android 9+ ImageDecoder")
    }

    val source = createImageDecoderSource(uriString, File(fallbackPath))
    val bitmap = ImageDecoder.decodeBitmap(source) { decoder, _, _ ->
      decoder.isMutableRequired = false
      decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
    }

    FileOutputStream(convertedFile).use { output ->
      if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) {
        bitmap.recycle()
        throw IllegalStateException("HEIF to PNG conversion failed")
      }
    }
    bitmap.recycle()
    return convertedFile
  }

  private fun createImageDecoderSource(uriString: String, stagedFile: File): ImageDecoder.Source {
    val uri = Uri.parse(uriString)
    return if (uri.scheme == "content") {
      ImageDecoder.createSource(reactApplicationContext.contentResolver, uri)
    } else {
      val file =
        if (uri.scheme == "file") File(uri.path ?: stagedFile.absolutePath) else stagedFile
      ImageDecoder.createSource(file)
    }
  }

  private fun compressBitmapToPngBytes(bitmap: Bitmap): ByteArray {
    val outFile = File(reactApplicationContext.cacheDir, "preview_${System.currentTimeMillis()}.png")
    FileOutputStream(outFile).use { output ->
      if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) {
        throw IllegalStateException("Bitmap to PNG encode failed")
      }
    }
    val bytes = outFile.readBytes()
    outFile.delete()
    return bytes
  }

  private fun openSourceInputStream(uriString: String): InputStream {
    val directFile = File(uriString.removePrefix("file://"))
    if (directFile.exists()) {
      return directFile.inputStream()
    }

    val uri = Uri.parse(uriString)
    if (uri.scheme == "content") {
      return reactApplicationContext.contentResolver.openInputStream(uri)
        ?: throw IllegalStateException("Unable to open source uri: $uriString")
    }

    if (uri.scheme == "file") {
      val file = File(uri.path ?: "")
      if (file.exists()) {
        return file.inputStream()
      }
    }

    return reactApplicationContext.contentResolver.openInputStream(uri)
      ?: throw IllegalStateException("Unable to open source uri: $uriString")
  }

  private fun detectMimeType(uriString: String): String {
    val uri = Uri.parse(uriString)
    val contentMime = reactApplicationContext.contentResolver.getType(uri)?.lowercase()
    if (!contentMime.isNullOrBlank()) {
      return contentMime
    }

    val lower = uriString.lowercase()
    return when {
      lower.endsWith(".png") -> "image/png"
      lower.endsWith(".tif") || lower.endsWith(".tiff") -> "image/tiff"
      else -> "image/jpeg"
    }
  }

  private fun detectExtension(mimeType: String): String =
    when (mimeType.lowercase()) {
      "image/png" -> "png"
      "image/tiff" -> "tiff"
      "image/heif",
      "image/heic",
      "image/jpeg",
      "image/jpg",
      -> "jpg"
      else -> "jpg"
    }

  private fun ensureExtension(fileName: String, extension: String): String {
    val lower = fileName.lowercase()
    return if (lower.endsWith(".$extension")) fileName else "$fileName.$extension"
  }

  private fun flattenBasicAndColorBalance(paramsMap: ReadableMap?): DoubleArray {
    val basic = paramsMap?.getMap("basic")
    val color = paramsMap?.getMap("colorBalance")
    return doubleArrayOf(
      basic?.getDoubleOrZero("exposure") ?: 0.0,
      basic?.getDoubleOrZero("contrast") ?: 0.0,
      basic?.getDoubleOrZero("brightness") ?: 0.0,
      basic?.getDoubleOrZero("highlights") ?: 0.0,
      basic?.getDoubleOrZero("shadows") ?: 0.0,
      basic?.getDoubleOrZero("whites") ?: 0.0,
      basic?.getDoubleOrZero("blacks") ?: 0.0,
      color?.getDoubleOrZero("temperature") ?: 0.0,
      color?.getDoubleOrZero("tint") ?: 0.0,
      color?.getDoubleOrZero("saturation") ?: 0.0,
      color?.getDoubleOrZero("vibrance") ?: 0.0,
      color?.getDoubleOrZero("redBalance") ?: 0.0,
      color?.getDoubleOrZero("greenBalance") ?: 0.0,
      color?.getDoubleOrZero("blueBalance") ?: 0.0,
    )
  }

  private fun flattenCurves(paramsMap: ReadableMap?): DoubleArray {
    val curves = paramsMap?.getMap("pro")?.getMap("curves")
    val orderedKeys = listOf("master", "r", "g", "b")
    val result = DoubleArray(CURVE_UNIFORM_SIZE)
    var offset = 0
    orderedKeys.forEach { key ->
      val curve = curves?.getArray(key)
      for (index in 0 until 5) {
        result[offset + index] = curve?.optDouble(index) ?: if (index == 0) 0.0 else if (index == 4) 1.0 else index * 0.25
      }
      offset += 5
    }
    return result
  }

  private fun flattenWheels(paramsMap: ReadableMap?): DoubleArray {
    val wheels = paramsMap?.getMap("pro")?.getMap("wheels")
    val orderedKeys = listOf("shadows", "midtones", "highlights")
    val result = DoubleArray(WHEEL_UNIFORM_SIZE)
    var offset = 0
    orderedKeys.forEach { key ->
      val wheel = wheels?.getMap(key)
      result[offset] = wheel?.getDoubleOrZero("hue") ?: 0.0
      result[offset + 1] = wheel?.getDoubleOrZero("sat") ?: 0.0
      result[offset + 2] = wheel?.getDoubleOrZero("luma") ?: 0.0
      offset += 3
    }
    return result
  }

  private fun flattenHsl(hslMap: ReadableMap?): DoubleArray {
    val orderedKeys = listOf("red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta")
    val result = DoubleArray(HSL_UNIFORM_SIZE)
    var offset = 0
    orderedKeys.forEach { key ->
      val band = hslMap?.getMap(key)
      result[offset] = band?.getDoubleOrZero("hue") ?: 0.0
      result[offset + 1] = band?.getDoubleOrZero("saturation") ?: 0.0
      result[offset + 2] = band?.getDoubleOrZero("luminance") ?: 0.0
      offset += 3
    }
    return result
  }

  private fun flattenLocalMasks(localMasks: ReadableArray?): DoubleArray {
    val slots = listOf("subject", "sky", "skin", "background")
    val result = DoubleArray(LOCAL_MASK_UNIFORM_SIZE)

    for (slotIndex in slots.indices) {
      var bestStrength = -1.0
      var bestMask: ReadableMap? = null
      for (index in 0 until (localMasks?.size() ?: 0)) {
        val mask = localMasks?.getMap(index) ?: continue
        if (!mask.getBooleanOrDefault("enabled", true)) {
          continue
        }
        if (mask.getString("type") != slots[slotIndex]) {
          continue
        }
        val score = mask.getDoubleOrZero("strength") * mask.getDoubleOrZero("confidence")
        if (score > bestStrength) {
          bestStrength = score
          bestMask = mask
        }
      }

      val offset = slotIndex * 6
      val adjustments = bestMask?.getMap("adjustments")
      result[offset] = bestStrength.coerceAtLeast(0.0)
      result[offset + 1] = adjustments?.getDoubleOrZero("exposure") ?: 0.0
      result[offset + 2] = adjustments?.getDoubleOrZero("temperature") ?: 0.0
      result[offset + 3] = adjustments?.getDoubleOrZero("saturation") ?: 0.0
      result[offset + 4] = adjustments?.getDoubleOrZero("clarity") ?: 0.0
      result[offset + 5] = adjustments?.getDoubleOrZero("denoise") ?: 0.0
    }

    return result
  }

  private fun flattenLutMeta(lutMap: ReadableMap?, lutDataMap: ReadableMap?): DoubleArray {
    val result = DoubleArray(LUT_META_SIZE)
    val enabled = lutMap?.getBooleanOrDefault("enabled", false) ?: false
    result[0] = if (enabled) 1.0 else 0.0
    result[1] = if (enabled) lutMap?.getDoubleOrZero("strength") ?: 0.0 else 0.0
    result[2] = lutDataMap?.getIntOrDefault("size", 0)?.toDouble() ?: 0.0

    val domainMin = lutDataMap?.getArray("domainMin")
    val domainMax = lutDataMap?.getArray("domainMax")
    result[3] = domainMin?.optDouble(0) ?: 0.0
    result[4] = domainMin?.optDouble(1) ?: 0.0
    result[5] = domainMin?.optDouble(2) ?: 0.0
    result[6] = domainMax?.optDouble(0) ?: 1.0
    result[7] = domainMax?.optDouble(1) ?: 1.0
    result[8] = domainMax?.optDouble(2) ?: 1.0
    return result
  }

  private fun flattenLutData(lutMap: ReadableMap?, lutDataMap: ReadableMap?): DoubleArray {
    val enabled = lutMap?.getBooleanOrDefault("enabled", false) ?: false
    if (!enabled) {
      return DoubleArray(0)
    }

    val size = lutDataMap?.getIntOrDefault("size", 0) ?: 0
    if (size < 2) {
      return DoubleArray(0)
    }

    val expected = size * size * size * 3
    if (expected <= 0) {
      return DoubleArray(0)
    }

    val data = lutDataMap?.getArray("data") ?: return DoubleArray(0)
    if (data.size() < expected) {
      return DoubleArray(0)
    }

    val result = DoubleArray(expected)
    for (index in 0 until expected) {
      result[index] = data.optDouble(index)
    }
    return result
  }

  private fun ReadableMap.getDoubleOrZero(key: String): Double =
    if (hasKey(key) && !isNull(key)) getDouble(key) else 0.0

  private fun ReadableMap.getIntOrDefault(key: String, defaultValue: Int): Int =
    if (hasKey(key) && !isNull(key)) getInt(key) else defaultValue

  private fun ReadableMap.getBooleanOrDefault(key: String, defaultValue: Boolean): Boolean =
    if (hasKey(key) && !isNull(key)) getBoolean(key) else defaultValue

  private fun ReadableArray.optDouble(index: Int): Double =
    if (index < size()) getDouble(index) else 0.0

  private external fun nativeDecodeSource(
    sourcePath: String,
    maxDimension: Int,
    cacheDir: String,
  ): String

  private external fun nativeExportImage(
    sourcePath: String,
    outputPath: String,
    format: String,
    bitDepth: Int,
    iccProfile: String,
    quality: Double,
    workingSpace: String,
    basicAndColor: DoubleArray,
    curves: DoubleArray,
    wheels: DoubleArray,
    hsl: DoubleArray,
    lutMeta: DoubleArray,
    lutData: DoubleArray,
    localMasks: DoubleArray,
    isRawSource: Boolean,
  ): String
}
