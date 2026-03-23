package com.visiongenieapp.voice

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.k2fsa.sherpa.onnx.OnlineRecognizer
import com.k2fsa.sherpa.onnx.OnlineRecognizerConfig
import com.k2fsa.sherpa.onnx.OnlineStream
import com.k2fsa.sherpa.onnx.getEndpointConfig
import com.k2fsa.sherpa.onnx.getFeatureConfig
import com.k2fsa.sherpa.onnx.getModelConfig
import java.security.MessageDigest
import kotlin.math.max

class VoiceRecognitionModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  companion object {
    private const val TAG = "VGVoiceRecognition"
    const val NAME = "VoiceRecognition"
    const val EVENT_START = "VoiceRecognition:onStart"
    const val EVENT_END = "VoiceRecognition:onEnd"
    const val EVENT_PARTIAL_RESULTS = "VoiceRecognition:onPartialResults"
    const val EVENT_RESULTS = "VoiceRecognition:onResults"
    const val EVENT_ERROR = "VoiceRecognition:onError"

    private const val SAMPLE_RATE_HZ = 16000
    private const val MODEL_TYPE = 9 // sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23
    private const val MODEL_DIR = "sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23"
    private val REQUIRED_MODEL_FILES =
      mapOf(
        "encoder-epoch-99-avg-1.int8.onnx" to
          "1c556ea57cec304e55ec4b72e52c1cc098bb01476ed7d90f3de939fe126487b1",
        "decoder-epoch-99-avg-1.onnx" to
          "5ee0f03a2768ff1d5c83ef3a493243c7935d316cd41280037b14783a3467cc78",
        "joiner-epoch-99-avg-1.int8.onnx" to
          "a7cf9d82757bdcf786059454495a9ca95e4bd7347f72473fc08d794475c36169",
        "tokens.txt" to
          "8b294db9045d6e5f94647f4c1eec1af4da143a75053c399611444b378ff966ac",
      )
  }

  private val stateLock = Any()
  private var recognizer: OnlineRecognizer? = null
  private var stream: OnlineStream? = null
  private var audioRecord: AudioRecord? = null
  private var recordingThread: Thread? = null
  @Volatile private var isListening: Boolean = false
  @Volatile private var latestRecognizedText: String = ""
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
        locale?.trim()
        synchronized(stateLock) {
          if (isListening) {
            promise.resolve(null)
            return@post
          }
        }

        val localRecognizer = ensureRecognizer()
        releaseStream()
        cleanupAudioRecord()

        val minBuffer = AudioRecord.getMinBufferSize(
          SAMPLE_RATE_HZ,
          AudioFormat.CHANNEL_IN_MONO,
          AudioFormat.ENCODING_PCM_16BIT,
        )
        if (minBuffer <= 0) {
          throw IllegalStateException("麦克风缓冲区初始化失败")
        }

        val localRecord = AudioRecord(
          MediaRecorder.AudioSource.MIC,
          SAMPLE_RATE_HZ,
          AudioFormat.CHANNEL_IN_MONO,
          AudioFormat.ENCODING_PCM_16BIT,
          max(minBuffer * 2, SAMPLE_RATE_HZ / 2),
        )
        if (localRecord.state != AudioRecord.STATE_INITIALIZED) {
          localRecord.release()
          throw IllegalStateException("麦克风初始化失败")
        }

        val localStream = localRecognizer.createStream()
        localRecord.startRecording()
        if (localRecord.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
          localRecord.release()
          localStream.release()
          throw IllegalStateException("麦克风启动失败")
        }

        synchronized(stateLock) {
          audioRecord = localRecord
          stream = localStream
          isListening = true
          latestRecognizedText = ""
          startedAtMs = System.currentTimeMillis()
        }
        startWorkerLoop(localRecognizer, localStream, localRecord)
        emit(EVENT_START)
        promise.resolve(null)
      } catch (error: Throwable) {
        Log.e(TAG, "start failed", error)
        synchronized(stateLock) {
          isListening = false
          latestRecognizedText = ""
          startedAtMs = 0L
        }
        cleanupAudioRecord()
        stopWorkerLoop()
        releaseStream()
        val message = "离线语音启动失败: ${error.message ?: "unknown"}"
        emitError(message)
        promise.reject("E_START", message)
      }
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    Handler(Looper.getMainLooper()).post {
      try {
        val wasListening =
          synchronized(stateLock) {
            val active = isListening
            isListening = false
            active
          }
        if (!wasListening) {
          emit(EVENT_END)
          promise.resolve(null)
          return@post
        }

        cleanupAudioRecord()
        stopWorkerLoop()

        val finalText = buildFinalTranscript()
        val resolvedText =
          if (finalText.isNotBlank()) {
            finalText
          } else {
            latestRecognizedText.trim()
          }
        releaseStream()
        synchronized(stateLock) {
          latestRecognizedText = ""
          startedAtMs = 0L
        }

        if (resolvedText.isNotBlank()) {
          emitSpeechValue(EVENT_RESULTS, resolvedText)
        } else {
          emitError("未识别到有效语音，请重试。")
        }
        emit(EVENT_END)
        promise.resolve(null)
      } catch (error: Throwable) {
        Log.e(TAG, "stop failed", error)
        synchronized(stateLock) {
          isListening = false
          latestRecognizedText = ""
          startedAtMs = 0L
        }
        cleanupAudioRecord()
        stopWorkerLoop()
        releaseStream()
        val message = "离线语音停止失败: ${error.message ?: "unknown"}"
        emitError(message)
        promise.reject("E_STOP", message)
      }
    }
  }

  @ReactMethod
  fun cleanupAudio(uri: String?, promise: Promise) {
    Handler(Looper.getMainLooper()).post {
      // Offline ASR no longer produces temporary audio files in native layer.
      uri?.trim()
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun destroy(promise: Promise) {
    Handler(Looper.getMainLooper()).post {
      try {
        synchronized(stateLock) {
          isListening = false
          latestRecognizedText = ""
          startedAtMs = 0L
        }
        cleanupAudioRecord()
        stopWorkerLoop()
        releaseStream()
        releaseRecognizer()
        promise.resolve(null)
      } catch (error: Throwable) {
        Log.e(TAG, "destroy failed", error)
        promise.reject("E_DESTROY", error.message ?: "destroy failed")
      }
    }
  }

  private fun ensureRecognizer(): OnlineRecognizer {
    recognizer?.let { return it }

    val modelConfig =
      getModelConfig(MODEL_TYPE)
        ?: throw IllegalStateException("离线语音模型配置不存在(type=$MODEL_TYPE)")
    ensureModelAssetsPresent(MODEL_DIR)

    val config =
      OnlineRecognizerConfig(
        featConfig = getFeatureConfig(sampleRate = SAMPLE_RATE_HZ, featureDim = 80),
        modelConfig = modelConfig,
        endpointConfig = getEndpointConfig(),
        enableEndpoint = true,
        decodingMethod = "greedy_search",
        maxActivePaths = 4,
      )

    val localRecognizer = OnlineRecognizer(assetManager = reactContext.assets, config = config)
    recognizer = localRecognizer
    return localRecognizer
  }

  private fun ensureModelAssetsPresent(modelDirName: String) {
    REQUIRED_MODEL_FILES.forEach { (fileName, expectedSha256) ->
      val path = "$modelDirName/$fileName"
      val digest = MessageDigest.getInstance("SHA-256")
      reactContext.assets.open(path).use { stream ->
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        while (true) {
          val size = stream.read(buffer)
          if (size <= 0) {
            break
          }
          digest.update(buffer, 0, size)
        }
      }
      val actualSha256 =
        digest
          .digest()
          .joinToString(separator = "") { byte -> "%02x".format(byte) }
      if (!actualSha256.equals(expectedSha256, ignoreCase = true)) {
        throw IllegalStateException("离线语音模型文件校验失败: $fileName")
      }
    }
  }

  private fun startWorkerLoop(
    localRecognizer: OnlineRecognizer,
    localStream: OnlineStream,
    localAudioRecord: AudioRecord,
  ) {
    val worker =
      Thread(
        {
          val chunkSize = max((SAMPLE_RATE_HZ * 0.1).toInt(), 512)
          val pcmBuffer = ShortArray(chunkSize)
          var lastPartial = ""
          try {
            while (isListening) {
              val readSamples = localAudioRecord.read(pcmBuffer, 0, pcmBuffer.size)
              if (readSamples <= 0) {
                continue
              }
              val floatSamples = FloatArray(readSamples) { idx -> pcmBuffer[idx] / 32768.0f }
              localStream.acceptWaveform(floatSamples, sampleRate = SAMPLE_RATE_HZ)
              while (localRecognizer.isReady(localStream)) {
                localRecognizer.decode(localStream)
              }
              val latestText = localRecognizer.getResult(localStream).text.trim()
              if (latestText.isNotBlank() && latestText != lastPartial) {
                lastPartial = latestText
                latestRecognizedText = latestText
                emitSpeechValue(EVENT_PARTIAL_RESULTS, latestText)
              }
            }
          } catch (error: Throwable) {
            Log.e(TAG, "worker loop interrupted", error)
            if (isListening) {
              emitError("离线语音识别中断: ${error.message ?: "unknown"}")
            }
          }
        },
        "VoiceRecognitionWorker",
      )
    worker.isDaemon = true
    recordingThread = worker
    worker.start()
  }

  private fun stopWorkerLoop() {
    val worker = recordingThread
    recordingThread = null
    if (worker == null) {
      return
    }
    try {
      worker.join(900)
    } catch (_: InterruptedException) {
      Thread.currentThread().interrupt()
    }
    if (worker.isAlive) {
      worker.interrupt()
    }
  }

  private fun cleanupAudioRecord() {
    val localRecord = audioRecord
    audioRecord = null
    if (localRecord == null) {
      return
    }
    try {
      if (localRecord.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
        localRecord.stop()
      }
    } catch (_: Throwable) {
      // ignore
    }
    try {
      localRecord.release()
    } catch (_: Throwable) {
      // ignore
    }
  }

  private fun buildFinalTranscript(): String {
    val localRecognizer = recognizer ?: return ""
    val localStream = stream ?: return ""
    return try {
      localStream.inputFinished()
      while (localRecognizer.isReady(localStream)) {
        localRecognizer.decode(localStream)
      }
      localRecognizer.getResult(localStream).text.trim()
    } catch (_: Throwable) {
      ""
    }
  }

  private fun releaseStream() {
    val localStream = stream
    stream = null
    try {
      localStream?.release()
    } catch (_: Throwable) {
      // ignore
    }
  }

  private fun releaseRecognizer() {
    val localRecognizer = recognizer
    recognizer = null
    try {
      localRecognizer?.release()
    } catch (_: Throwable) {
      // ignore
    }
  }

  private fun emit(eventName: String, payload: Any? = null) {
    if (!reactContext.hasActiveReactInstance()) {
      Log.w(TAG, "skip emit($eventName): inactive react instance")
      return
    }
    try {
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(eventName, payload)
    } catch (error: Throwable) {
      Log.e(TAG, "emit failed: $eventName", error)
    }
  }

  private fun emitSpeechValue(eventName: String, value: String) {
    val map =
      Arguments.createMap().apply {
        putString("value", value)
      }
    emit(eventName, map)
  }

  private fun emitError(message: String) {
    val map =
      Arguments.createMap().apply {
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
