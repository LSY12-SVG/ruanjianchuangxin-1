import {useCallback, useEffect, useRef, useState} from 'react';
import {colorApi, formatApiErrorMessage} from '../modules/api';
import {ApiRequestError} from '../modules/api/http';
import {createSpeechRecognizer} from '../voice/speechRecognizer';
import type {VoiceAudioReadyPayload} from '../voice/types';
import {requestClientPermission} from '../permissions/clientPermissionBroker';

type AgentVoicePhase = 'idle' | 'listening' | 'transcribing' | 'error';

interface UseAgentVoiceGoalOptions {
  locale?: string;
  busy?: boolean;
  onTranscript: (transcript: string) => void;
}

interface UseAgentVoiceGoalResult {
  recording: boolean;
  phase: AgentVoicePhase;
  liveTranscript: string;
  errorText: string;
  onPressIn: () => void;
  onPressOut: () => void;
  clearError: () => void;
}

const normalizeSpeechErrorMessage = (rawMessage: string): string => {
  const message = String(rawMessage || '').trim();
  if (!message) {
    return '语音识别失败，请重试';
  }

  const normalized = message.toLowerCase();
  const looksLikeMissingService =
    normalized.includes('no speech recognition service') ||
    normalized.includes('recognitionservice') ||
    normalized.includes('speech recognizer not present') ||
    normalized.includes('speech service') ||
    normalized.includes('没有语音识别服务') ||
    normalized.includes('未安装语音识别服务') ||
    normalized.includes('语音识别服务不可用');

  if (looksLikeMissingService) {
    return '设备未检测到可用语音识别服务，请安装并启用系统语音识别服务后重试。';
  }

  return message;
};

const mapAsrErrorCodeToMessage = (code: string): string | null => {
  switch (code) {
    case 'ASR_TIMEOUT':
      return '语音转写超时，请检查网络后重试。';
    case 'ASR_MODEL_UNAVAILABLE':
      return '语音转写模型不可用，请稍后重试。';
    case 'ASR_BAD_AUDIO':
      return '音频无效或过短，请按住说话 1 秒以上后重试。';
    case 'ASR_NETWORK_ERROR':
      return '语音转写网络异常，请检查后端与网络连接。';
    case 'ASR_MISCONFIG':
      return '语音转写服务未配置，请联系开发者检查 ASR 配置。';
    default:
      return null;
  }
};

const formatVoiceTranscribeError = (error: unknown): string => {
  if (error instanceof ApiRequestError) {
    const mapped = mapAsrErrorCodeToMessage(String(error.code || '').toUpperCase());
    if (mapped) {
      return mapped;
    }
  }
  return normalizeSpeechErrorMessage(formatApiErrorMessage(error, '语音转写失败'));
};

export const useAgentVoiceGoal = ({
  locale = 'zh-CN',
  busy = false,
  onTranscript,
}: UseAgentVoiceGoalOptions): UseAgentVoiceGoalResult => {
  const [recording, setRecording] = useState(false);
  const [phase, setPhase] = useState<AgentVoicePhase>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [errorText, setErrorText] = useState('');

  const pressingRef = useRef(false);
  const submittedTranscriptRef = useRef('');
  const submittedAudioUriRef = useRef('');

  const submitTranscript = useCallback(
    (rawText: string): boolean => {
      const normalized = String(rawText || '').trim();
      if (!normalized) {
        return false;
      }
      if (submittedTranscriptRef.current === normalized) {
        return true;
      }
      submittedTranscriptRef.current = normalized;
      setLiveTranscript(normalized);
      setPhase('idle');
      setErrorText('');
      onTranscript(normalized);
      return true;
    },
    [onTranscript],
  );

  const submitVoiceAudio = useCallback(
    async (audio: VoiceAudioReadyPayload): Promise<boolean> => {
      const audioUri = String(audio.uri || '').trim();
      if (!audioUri) {
        return false;
      }
      if (submittedAudioUriRef.current === audioUri) {
        return true;
      }
      if (submittedTranscriptRef.current.trim()) {
        return true;
      }

      submittedAudioUriRef.current = audioUri;
      setPhase('transcribing');
      try {
        const result = await colorApi.voiceTranscribe({
          uri: audioUri,
          mimeType: audio.mimeType,
          locale,
        });
        const transcript = String(result.transcript || '').trim();
        if (!transcript) {
          setPhase('error');
          setErrorText('语音转写未返回有效文本，请重试。可尝试按住说话 1 秒以上。');
          return false;
        }
        return submitTranscript(transcript);
      } catch (error) {
        setPhase('error');
        setErrorText(formatVoiceTranscribeError(error));
        return false;
      }
    },
    [locale, submitTranscript],
  );

  const recognizerRef = useRef(
    createSpeechRecognizer({
      onPartial: text => {
        const normalized = String(text || '').trim();
        if (!normalized) {
          return;
        }
        setLiveTranscript(normalized);
      },
      onFinal: text => {
        submitTranscript(text);
      },
      onAudioReady: audio => {
        submitVoiceAudio(audio).catch(() => undefined);
      },
      onError: message => {
        setPhase('error');
        setErrorText(normalizeSpeechErrorMessage(message || '语音识别失败'));
      },
      onPreempted: () => {
        setPhase('error');
        setRecording(false);
        setErrorText('语音识别已被其他任务抢占，请重试。');
      },
      onEnd: () => {
        setRecording(false);
        if (!submittedTranscriptRef.current.trim()) {
          setPhase('transcribing');
        } else {
          setPhase('idle');
        }
      },
    }),
  );

  useEffect(() => {
    return () => {
      recognizerRef.current.destroy().catch(() => undefined);
    };
  }, []);

  const startRecord = useCallback(async () => {
    if (busy) {
      setErrorText('当前任务处理中，请稍后再语音输入。');
      return;
    }
    if (recording) {
      return;
    }
    const permission = await requestClientPermission('microphone');
    if (!permission.granted) {
      setPhase('error');
      setErrorText(permission.message || '录音权限未开启');
      return;
    }
    if (!pressingRef.current) {
      return;
    }
    setErrorText('');
    submittedTranscriptRef.current = '';
    submittedAudioUriRef.current = '';
    setLiveTranscript('');
    setPhase('listening');
    setRecording(true);
    try {
      await recognizerRef.current.start(locale);
    } catch (error) {
      setPhase('error');
      setRecording(false);
      setErrorText(normalizeSpeechErrorMessage(formatApiErrorMessage(error, '语音启动失败')));
    }
  }, [busy, locale, recording]);

  const stopRecord = useCallback(async () => {
    if (!recording && phase !== 'listening') {
      return;
    }
    try {
      setPhase('transcribing');
      await recognizerRef.current.stop();
    } catch (error) {
      setPhase('error');
      setErrorText(normalizeSpeechErrorMessage(formatApiErrorMessage(error, '语音停止失败')));
    } finally {
      setRecording(false);
    }
  }, [phase, recording]);

  const onPressIn = useCallback(() => {
    pressingRef.current = true;
    startRecord().catch(() => undefined);
  }, [startRecord]);

  const onPressOut = useCallback(() => {
    pressingRef.current = false;
    stopRecord().catch(() => undefined);
  }, [stopRecord]);

  const clearError = useCallback(() => {
    if (phase === 'error') {
      setPhase('idle');
    }
    setErrorText('');
  }, [phase]);

  return {
    recording,
    phase,
    liveTranscript,
    errorText,
    onPressIn,
    onPressOut,
    clearError,
  };
};
