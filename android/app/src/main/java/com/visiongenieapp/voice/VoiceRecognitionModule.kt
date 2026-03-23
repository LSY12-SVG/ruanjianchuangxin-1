package com.visiongenieapp.voice

import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.util.UUID

class VoiceRecognitionModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  companion object {
    const val NAME = "VoiceRecognition"
    const val EVENT_START = "VoiceRecognition:onStart"
    const val EVENT_END = "VoiceRecognition:onEnd"
    const val EVENT_AUDIO_READY = "VoiceRecognition:onAudioReady"
    const val EVENT_ERROR = "VoiceRecognition:onError"
  }

  private var mediaRecorder: MediaRecorder? = null
  private var outputFile: File? = null
  private var isListening: Boolean = false
  private var startedAtMs: Long = 0L

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = NAME

  // Required by NativeEventEmitter in recent React Native versions.
  @ReactMethod
  fun addListener(eventName: String) {
    // no-op
  }

  // Required by NativeEventEmitter in recent React Native versions.
  @ReactMethod
  fun removeListeners(count: Int) {
    // no-op
  }

  @ReactMethod
  fun start(locale: String?, promise: Promise) {
    Handler(Looper.getMainLooper()).post {
      try {
        if (!locale.isNullOrBlank()) {
          // Locale is currently unused on native recorder path, but kept for API compatibility.
          locale.trim()
        }
        if (isListening) {
          promise.resolve(null)
          return@post
        }
        cleanupOutputFile()

        val audioDir = File(reactContext.cacheDir, "voice-recordings")
        if (!audioDir.exists()) {
          audioDir.mkdirs()
        }
        val audioFile = File(
          audioDir,
          "voice-${System.currentTimeMillis()}-${UUID.randomUUID()}.m4a",
        )

        val recorder =
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(reactContext)
          } else {
            MediaRecorder()
          }
        recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
        recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        recorder.setAudioChannels(1)
        recorder.setAudioSamplingRate(16000)
        recorder.setAudioEncodingBitRate(64000)
        recorder.setOutputFile(audioFile.absolutePath)
        recorder.prepare()
        recorder.start()

        mediaRecorder = recorder
        outputFile = audioFile
        startedAtMs = System.currentTimeMillis()
        isListening = true
        emit(EVENT_START, null)
        promise.resolve(null)
      } catch (error: Exception) {
        cleanupRecorder()
        cleanupOutputFile()
        isListening = false
        startedAtMs = 0L
        val message = "录音启动失败: ${error.message ?: "unknown"}"
        emitError(message)
        promise.reject("E_START", message)
      }
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    Handler(Looper.getMainLooper()).post {
      try {
        if (!isListening) {
          emit(EVENT_END, null)
          promise.resolve(null)
          return@post
        }

        var stopFailed = false
        try {
          mediaRecorder?.stop()
        } catch (_: RuntimeException) {
          stopFailed = true
        } finally {
          cleanupRecorder()
        }

        isListening = false
        val durationMs = (System.currentTimeMillis() - startedAtMs).coerceAtLeast(0L)
        startedAtMs = 0L
        val file = outputFile

        if (stopFailed || file == null || !file.exists() || file.length() <= 0L) {
          cleanupOutputFile()
          emitError("未识别到有效语音，请重试。")
          emit(EVENT_END, null)
          promise.resolve(null)
          return@post
        }

        val payload = Arguments.createMap().apply {
          putString("uri", toFileUri(file))
          putString("mimeType", "audio/mp4")
          putDouble("durationMs", durationMs.toDouble())
          putDouble("fileSize", file.length().toDouble())
        }
        emit(EVENT_AUDIO_READY, payload)
        emit(EVENT_END, null)
        promise.resolve(null)
      } catch (error: Exception) {
        isListening = false
        startedAtMs = 0L
        val message = "录音停止失败: ${error.message ?: "unknown"}"
        emitError(message)
        promise.reject("E_STOP", message)
      }
    }
  }

  @ReactMethod
  fun cleanupAudio(uri: String?, promise: Promise) {
    Handler(Looper.getMainLooper()).post {
      try {
        val file = resolveFileFromUri(uri)
        if (file != null && file.exists()) {
          file.delete()
        }
        if (outputFile?.absolutePath == file?.absolutePath) {
          outputFile = null
        }
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("E_CLEANUP_AUDIO", error.message ?: "cleanup failed")
      }
    }
  }

  @ReactMethod
  fun destroy(promise: Promise) {
    Handler(Looper.getMainLooper()).post {
      try {
        if (isListening) {
          try {
            mediaRecorder?.stop()
          } catch (_: RuntimeException) {
            // ignore
          }
        }
        cleanupRecorder()
        cleanupOutputFile()
        isListening = false
        startedAtMs = 0L
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("E_DESTROY", error.message ?: "destroy failed")
      }
    }
  }

  private fun cleanupRecorder() {
    try {
      mediaRecorder?.reset()
    } catch (_: Exception) {
      // ignore
    }
    try {
      mediaRecorder?.release()
    } catch (_: Exception) {
      // ignore
    }
    mediaRecorder = null
  }

  private fun cleanupOutputFile() {
    try {
      outputFile?.let { file ->
        if (file.exists()) {
          file.delete()
        }
      }
    } catch (_: Exception) {
      // ignore
    }
    outputFile = null
  }

  private fun toFileUri(file: File): String =
    "file://${file.absolutePath.replace("\\", "/")}"

  private fun resolveFileFromUri(uri: String?): File? {
    if (uri.isNullOrBlank()) {
      return null
    }
    val normalized = if (uri.startsWith("file://")) uri.removePrefix("file://") else uri
    if (normalized.isBlank()) {
      return null
    }
    return File(normalized)
  }

  private fun emit(eventName: String, payload: Any? = null) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, payload)
  }

  private fun emitError(message: String) {
    val map = Arguments.createMap().apply {
      putString("message", message)
    }
    emit(EVENT_ERROR, map)
  }

  override fun onActivityResult(
    activity: android.app.Activity,
    requestCode: Int,
    resultCode: Int,
    data: android.content.Intent?,
  ) {
    // no-op
  }

  override fun onNewIntent(intent: android.content.Intent) {
    // no-op
  }
}
