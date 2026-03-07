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

    Handler(Looper.getMainLooper()).post {
      try {
        if (canUseSpeechRecognizer()) {
          ensureRecognizer()
          val intent = createRecognitionIntent()
          usingActivityFallback = false
          speechRecognizer?.startListening(intent)
          promise.resolve(null)
          return@post
        }

        if (canLaunchRecognitionActivity()) {
          val activity = reactContext.currentActivity
          if (activity == null) {
            emitError("No active screen for voice recognition")
            promise.reject("E_NO_ACTIVITY", "No active screen for voice recognition")
            return@post
          }

          usingActivityFallback = true
          emit(EVENT_START, null)
          activity.startActivityForResult(createRecognitionIntent(), REQUEST_CODE_RECOGNIZE)
          promise.resolve(null)
          return@post
        }

        emitError("No speech recognition service available on device")
        promise.reject("E_UNAVAILABLE", "No speech recognition service available on device")
      } catch (error: Exception) {
        emitError(error.message ?: "start failed")
        promise.reject("E_START", error)
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
      speechRecognizer?.setRecognitionListener(this)
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
      return true
    }
    return resolveSpeechServiceComponent() != null
  }

  private fun createRecognitionIntent(): Intent {
    return Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, currentLocale)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
    }
  }

  private fun canLaunchRecognitionActivity(): Boolean {
    val handlers = reactContext.packageManager.queryIntentActivities(createRecognitionIntent(), 0)
    return handlers.isNotEmpty()
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
    val message = when (error) {
      SpeechRecognizer.ERROR_CLIENT -> "speech error: client"
      SpeechRecognizer.ERROR_AUDIO -> "speech error: audio"
      SpeechRecognizer.ERROR_NETWORK -> "speech error: network"
      SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "speech error: network timeout"
      SpeechRecognizer.ERROR_NO_MATCH -> "speech error: no match"
      SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "speech error: recognizer busy"
      SpeechRecognizer.ERROR_SERVER -> "speech error: server"
      SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "speech error: speech timeout"
      else -> "speech error: $error"
    }
    emitError(message)
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
