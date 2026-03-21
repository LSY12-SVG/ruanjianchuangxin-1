import {
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import type {SpeechRecognizerAdapter} from './types';

interface SpeechCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
  onPreempted?: () => void;
}

interface VoiceRecognitionModuleType {
  start: (locale: string) => Promise<void>;
  stop: () => Promise<void>;
  destroy: () => Promise<void>;
}

interface SpeechValueEvent {
  value?: unknown;
}

interface SpeechErrorEvent {
  message?: string;
}

const VoiceRecognition: VoiceRecognitionModuleType | null =
  NativeModules.VoiceRecognition || null;
let activeRecognizerToken: symbol | null = null;
interface ActiveRecognizerController {
  token: symbol;
  stopNative: () => Promise<void>;
  notifyPreempted?: () => void;
}
let activeRecognizerController: ActiveRecognizerController | null = null;

const pickFirstText = (value: unknown): string => {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first.trim() : '';
  }
  if (typeof value === 'object') {
    const asRecord = value as Record<string, unknown>;
    const zeroValue = asRecord[0];
    if (typeof zeroValue === 'string') {
      return zeroValue.trim();
    }
    const joined = Object.values(asRecord)
      .filter(item => typeof item === 'string')
      .map(item => String(item).trim())
      .filter(Boolean)
      .join(' ');
    return joined;
  }
  return '';
};

export const requestRecordAudioPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return true;
  }

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: '录音权限',
      message: '语音调色需要麦克风权限',
      buttonPositive: '允许',
      buttonNegative: '取消',
    },
  );

  return granted === PermissionsAndroid.RESULTS.GRANTED;
};

export const createSpeechRecognizer = (
  callbacks: SpeechCallbacks,
): SpeechRecognizerAdapter => {
  if (!VoiceRecognition) {
    return {
      start: async () => {
        throw new Error('VoiceRecognition native module unavailable');
      },
      stop: async () => undefined,
      destroy: async () => undefined,
    };
  }

  const supportsNativeEmitterContract =
    typeof (VoiceRecognition as unknown as {addListener?: unknown}).addListener === 'function' &&
    typeof (VoiceRecognition as unknown as {removeListeners?: unknown}).removeListeners ===
      'function';

  const emitter = supportsNativeEmitterContract
    ? new NativeEventEmitter(VoiceRecognition as never)
    : new NativeEventEmitter();
  const recognizerToken = Symbol('speech_recognizer');
  const isActiveRecognizer = () => activeRecognizerToken === recognizerToken;
  const extractEventText = (event: unknown): string => {
    if (!event) {
      return '';
    }
    if (typeof event === 'string' || Array.isArray(event)) {
      return pickFirstText(event);
    }
    if (typeof event === 'object') {
      const textFromValue = pickFirstText((event as SpeechValueEvent).value);
      if (textFromValue) {
        return textFromValue;
      }
      return pickFirstText(event);
    }
    return '';
  };

  const onPartial = (event: SpeechValueEvent) => {
    if (!isActiveRecognizer()) {
      return;
    }
    const text = extractEventText(event);
    if (text) {
      callbacks.onPartial?.(text);
    }
  };

  const onFinal = (event: SpeechValueEvent) => {
    if (!isActiveRecognizer()) {
      return;
    }
    const text = extractEventText(event);
    if (text) {
      callbacks.onFinal?.(text);
    }
  };

  const subscriptions = [
    emitter.addListener('VoiceRecognition:onStart', () => {
      if (!isActiveRecognizer()) {
        return;
      }
      callbacks.onStart?.();
    }),
    emitter.addListener('VoiceRecognition:onEnd', () => {
      if (!isActiveRecognizer()) {
        return;
      }
      callbacks.onEnd?.();
    }),
    emitter.addListener('VoiceRecognition:onPartialResults', onPartial),
    emitter.addListener('VoiceRecognition:onResults', onFinal),
    // Compatibility listeners for some vendor/legacy bridges.
    emitter.addListener('onSpeechPartialResults', onPartial),
    emitter.addListener('onSpeechResults', onFinal),
    emitter.addListener('VoiceRecognition:onError', (event: SpeechErrorEvent) => {
      if (!isActiveRecognizer()) {
        return;
      }
      callbacks.onError?.(event?.message || '语音识别失败，请重试');
    }),
  ];

  return {
    start: async (locale: string) => {
      if (
        activeRecognizerController &&
        activeRecognizerController.token !== recognizerToken
      ) {
        const previousController = activeRecognizerController;
        try {
          await previousController.stopNative();
        } catch {
          // ignore: native recognizer might already be released by OS.
        }
        previousController.notifyPreempted?.();
      }
      activeRecognizerToken = recognizerToken;
      activeRecognizerController = {
        token: recognizerToken,
        stopNative: async () => {
          await VoiceRecognition.stop();
        },
        notifyPreempted: callbacks.onPreempted,
      };
      try {
        await VoiceRecognition.start(locale);
      } catch (error) {
        if (isActiveRecognizer()) {
          activeRecognizerToken = null;
          activeRecognizerController = null;
        }
        throw error;
      }
    },
    stop: async () => {
      if (!isActiveRecognizer()) {
        return;
      }
      try {
        await VoiceRecognition.stop();
      } finally {
        if (isActiveRecognizer()) {
          activeRecognizerToken = null;
          activeRecognizerController = null;
        }
      }
    },
    destroy: async () => {
      subscriptions.forEach(subscription => subscription.remove());
      const shouldDestroyNative =
        activeRecognizerController?.token === recognizerToken || activeRecognizerController == null;
      if (isActiveRecognizer()) {
        activeRecognizerToken = null;
        activeRecognizerController = null;
      }
      if (shouldDestroyNative) {
        await VoiceRecognition.destroy();
      }
    },
  };
};
