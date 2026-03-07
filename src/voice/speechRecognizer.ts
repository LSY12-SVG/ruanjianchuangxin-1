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
}

interface VoiceRecognitionModuleType {
  start: (locale: string) => Promise<void>;
  stop: () => Promise<void>;
  destroy: () => Promise<void>;
}

interface SpeechValueEvent {
  value?: string[];
}

interface SpeechErrorEvent {
  message?: string;
}

const VoiceRecognition: VoiceRecognitionModuleType | null =
  NativeModules.VoiceRecognition || null;

const pickFirstText = (value: unknown): string => {
  if (!value || !Array.isArray(value)) {
    return '';
  }
  const first = value[0];
  return typeof first === 'string' ? first : '';
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

  const emitter = new NativeEventEmitter(VoiceRecognition as never);
  const subscriptions = [
    emitter.addListener('VoiceRecognition:onStart', () => callbacks.onStart?.()),
    emitter.addListener('VoiceRecognition:onEnd', () => callbacks.onEnd?.()),
    emitter.addListener('VoiceRecognition:onPartialResults', (event: SpeechValueEvent) => {
      const text = pickFirstText(event?.value);
      if (text) {
        callbacks.onPartial?.(text);
      }
    }),
    emitter.addListener('VoiceRecognition:onResults', (event: SpeechValueEvent) => {
      const text = pickFirstText(event?.value);
      if (text) {
        callbacks.onFinal?.(text);
      }
    }),
    emitter.addListener('VoiceRecognition:onError', (event: SpeechErrorEvent) => {
      callbacks.onError?.(event?.message || '语音识别失败，请重试');
    }),
  ];

  return {
    start: (locale: string) => VoiceRecognition.start(locale),
    stop: () => VoiceRecognition.stop(),
    destroy: async () => {
      subscriptions.forEach(subscription => subscription.remove());
      await VoiceRecognition.destroy();
    },
  };
};
