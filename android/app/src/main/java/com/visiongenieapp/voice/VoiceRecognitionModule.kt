package com.visiongenieapp.voice

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.modules.core.DeviceEventManagerModule

class VoiceRecognitionModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), RecognitionListener, ActivityEventListener {

  companion object {
    const val NAME = "VoiceRecognition"
    const val EVENT_START = "VoiceRecognition:onStart"
    const val EVENT_END = "VoiceRecognition:onEnd"
    const val EVENT_PARTIAL_RESULTS = "VoiceRecognition:onPartialResults"
    const val EVENT_RESULTS = "VoiceRecognition:onResults"
    const val EVENT_ERROR = "VoiceRecognition:onError"
    private const val REQUEST_CODE_RECOGNIZE = 22041
  }

  private var speechRecognizer: SpeechRecognizer? = null
  private var currentLocale: String = "zh-CN"
  private var usingActivityFallback: Boolean = false
  private var retriedWithActivityFallback: Boolean = false

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
    currentLocale = if (locale.isNullOrBlank()) "zh-CN" else locale
    retriedWithActivityFallback = false
    
    android.util.Log.d("VoiceRecognitionModule", "start() called with locale: $currentLocale")
    
    Handler(Looper.getMainLooper()).post {
      try {
        android.util.Log.d("VoiceRecognitionModule", "Checking speech recognition availability...")
        
        if (canUseSpeechRecognizer()) {
          android.util.Log.d("VoiceRecognitionModule", "Using SpeechRecognizer API")
          ensureRecognizer()
          val intent = createRecognitionIntent()
          usingActivityFallback = false
          speechRecognizer?.startListening(intent)
          android.util.Log.d("VoiceRecognitionModule", "SpeechRecognizer started successfully")
          promise.resolve(null)
          return@post
        }

        if (canLaunchRecognitionActivity()) {
          android.util.Log.d("VoiceRecognitionModule", "Using Activity fallback")
          if (!launchActivityFallback()) {
            val errorMsg = "当前页面不可用，无法打开系统语音识别"
            android.util.Log.e("VoiceRecognitionModule", errorMsg)
            emitError(errorMsg)
            promise.reject("E_NO_ACTIVITY", errorMsg)
            return@post
          }
          android.util.Log.d("VoiceRecognitionModule", "Recognition activity launched")
          promise.resolve(null)
          return@post
        }

        val errorMsg = "No speech recognition service available on device"
        android.util.Log.e("VoiceRecognitionModule", errorMsg)
        emitError(errorMsg)
        promise.reject("E_UNAVAILABLE", errorMsg)
      } catch (error: Exception) {
        val errorMsg = "start failed: ${error.message ?: "Unknown error"}"
        android.util.Log.e("VoiceRecognitionModule", errorMsg, error)
        emitError(errorMsg)
        promise.reject("E_START", errorMsg)
      }
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    Handler(Looper.getMainLooper()).post {
      try {
        if (usingActivityFallback) {
          emit(EVENT_END, null)
        } else {
          speechRecognizer?.stopListening()
        }
        promise.resolve(null)
      } catch (error: Exception) {
        emitError(error.message ?: "stop failed")
        promise.reject("E_STOP", error)
      }
    }
  }

  @ReactMethod
  fun destroy(promise: Promise) {
    Handler(Looper.getMainLooper()).post {
      try {
        speechRecognizer?.destroy()
        speechRecognizer = null
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("E_DESTROY", error)
      }
    }
  }

  private fun ensureRecognizer() {
    if (speechRecognizer == null) {
      val explicitService = resolveSpeechServiceComponent()
      speechRecognizer = if (explicitService != null) {
        SpeechRecognizer.createSpeechRecognizer(reactContext, explicitService)
      } else {
        SpeechRecognizer.createSpeechRecognizer(reactContext)
      }
      if (speechRecognizer != null) {
        speechRecognizer?.setRecognitionListener(this)
        android.util.Log.d("VoiceRecognitionModule", "SpeechRecognizer initialized successfully")
      } else {
        android.util.Log.e("VoiceRecognitionModule", "Failed to initialize SpeechRecognizer")
        throw Exception("Failed to initialize SpeechRecognizer")
      }
    }
  }

  private fun resolveSpeechServiceComponent(): ComponentName? {
    val raw = Settings.Secure.getString(
      reactContext.contentResolver,
      "voice_recognition_service",
    ) ?: return null

    return ComponentName.unflattenFromString(raw)
  }

  private fun canUseSpeechRecognizer(): Boolean {
    if (SpeechRecognizer.isRecognitionAvailable(reactContext)) {
      android.util.Log.d("VoiceRecognitionModule", "SpeechRecognizer.isRecognitionAvailable() = true")
      return true
    }
    val explicitService = resolveSpeechServiceComponent()
    if (explicitService != null) {
      android.util.Log.d("VoiceRecognitionModule", "Using explicit speech service: $explicitService")
      return true
    }
    android.util.Log.w("VoiceRecognitionModule", "SpeechRecognizer not available, no explicit service configured")
    return false
  }

  private fun createRecognitionIntent(): Intent {
    return Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, currentLocale)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
      // Prefer on-device recognition to reduce dependency on unstable network.
      putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
    }
  }

  private fun canLaunchRecognitionActivity(): Boolean {
    val handlers = reactContext.packageManager.queryIntentActivities(createRecognitionIntent(), 0)
    val canLaunch = handlers.isNotEmpty()
    
    android.util.Log.d("VoiceRecognitionModule", "canLaunchRecognitionActivity() = $canLaunch, found ${handlers.size} handlers")
    
    return canLaunch
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

  private fun toWritableArray(values: List<String>): WritableArray {
    val array = Arguments.createArray()
    values.forEach { value -> array.pushString(value) }
    return array
  }

  override fun onReadyForSpeech(params: Bundle?) {
    emit(EVENT_START, null)
  }

  override fun onBeginningOfSpeech() {}

  override fun onRmsChanged(rmsdB: Float) {}

  override fun onBufferReceived(buffer: ByteArray?) {}

  override fun onEndOfSpeech() {
    emit(EVENT_END, null)
  }

  override fun onError(error: Int) {
    if (
      (error == SpeechRecognizer.ERROR_NETWORK ||
        error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT) &&
      !usingActivityFallback &&
      !retriedWithActivityFallback &&
      canLaunchRecognitionActivity()
    ) {
      retriedWithActivityFallback = true
      emitError("语音网络不稳定，正在切换系统识别重试")
      if (launchActivityFallback()) {
        return
      }
    }

    val message = when (error) {
      SpeechRecognizer.ERROR_CLIENT -> "语音识别异常（客户端）"
      SpeechRecognizer.ERROR_AUDIO -> "语音识别异常（麦克风音频）"
      SpeechRecognizer.ERROR_NETWORK ->
        "语音识别网络不可用，请检查设备网络，或在系统中启用离线语音包后重试"
      SpeechRecognizer.ERROR_NETWORK_TIMEOUT ->
        "语音识别网络超时，请检查设备网络，或在系统中启用离线语音包后重试"
      SpeechRecognizer.ERROR_NO_MATCH -> "未识别到有效语音，请再说一次"
      SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "语音识别正在忙，请稍后再试"
      SpeechRecognizer.ERROR_SERVER -> "语音识别服务暂不可用，请稍后重试"
      SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "长时间未检测到语音，请重试"
      else -> "语音识别异常（错误码: $error）"
    }
    emitError(message)
  }

  private fun launchActivityFallback(): Boolean {
    val activity = reactContext.currentActivity ?: return false
    return try {
      usingActivityFallback = true
      emit(EVENT_START, null)
      activity.startActivityForResult(createRecognitionIntent(), REQUEST_CODE_RECOGNIZE)
      true
    } catch (_: Exception) {
      usingActivityFallback = false
      false
    }
  }

  override fun onResults(results: Bundle?) {
    val texts = results
      ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
      ?.filterNotNull()
      ?: emptyList()
    val map = Arguments.createMap().apply {
      putArray("value", toWritableArray(texts))
    }
    emit(EVENT_RESULTS, map)
  }

  override fun onPartialResults(partialResults: Bundle?) {
    val texts = partialResults
      ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
      ?.filterNotNull()
      ?: emptyList()
    val map = Arguments.createMap().apply {
      putArray("value", toWritableArray(texts))
    }
    emit(EVENT_PARTIAL_RESULTS, map)
  }

  override fun onEvent(eventType: Int, params: Bundle?) {}

  override fun onActivityResult(
    activity: Activity,
    requestCode: Int,
    resultCode: Int,
    data: Intent?,
  ) {
    if (requestCode != REQUEST_CODE_RECOGNIZE) {
      return
    }

    usingActivityFallback = false
    emit(EVENT_END, null)

    if (resultCode != Activity.RESULT_OK) {
      emitError("Speech recognition canceled")
      return
    }

    val texts = data
      ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
      ?.filterNotNull()
      ?: emptyList()

    val map = Arguments.createMap().apply {
      putArray("value", toWritableArray(texts))
    }
    emit(EVENT_RESULTS, map)
  }

  override fun onNewIntent(intent: Intent) {}
}
