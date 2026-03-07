import {useCallback, useEffect, useRef, useState} from 'react';
import type {ColorGradingParams} from '../types/colorGrading.ts';
import {interpretWithCloud} from './cloudInterpreter';
import {applyVoiceInterpretation, formatInterpretationSummary} from './paramApplier';
import {createSpeechRecognizer, requestRecordAudioPermission} from './speechRecognizer';
import {matchStyleFromTranscript} from './styleMapper';
import type {InterpretResponse, VoicePipelineState, VoiceStyleTag} from './types';
import type {VoiceImageContext} from './imageContext';

interface UseVoiceColorGradingOptions {
  currentParams: ColorGradingParams;
  onApplyParams: (params: ColorGradingParams) => void;
  getImageContext: () => VoiceImageContext | null;
  cloudEndpoint?: string;
  locale?: string;
}

interface VoiceApplyRecord {
  before: ColorGradingParams;
  after: ColorGradingParams;
  summary: string;
}

interface VoiceSession {
  beforeSession: ColorGradingParams;
  history: VoiceApplyRecord[];
}

interface UseVoiceColorGradingResult {
  state: VoicePipelineState | 'continuous_listening' | 'queue_applying';
  isRecording: boolean;
  transcript: string;
  partialTranscript: string;
  lastError: string;
  lastAppliedSummary: string;
  canUndo: boolean;
  canUndoSession: boolean;
  visualState: 'idle' | 'visual_pending' | 'visual_applied' | 'visual_error';
  visualSummary: string;
  visualProfile: string;
  visualApplySummary: string;
  requestInitialVisualSuggestion: () => Promise<void>;
  startPressToTalk: () => Promise<void>;
  stopPressToTalk: () => Promise<void>;
  undoLastApply: () => void;
  undoSessionApply: () => void;
}

const cloneParams = (params: ColorGradingParams): ColorGradingParams => ({
  basic: {...params.basic},
  colorBalance: {...params.colorBalance},
  pro: {
    curves: {
      master: [...params.pro.curves.master] as ColorGradingParams['pro']['curves']['master'],
      r: [...params.pro.curves.r] as ColorGradingParams['pro']['curves']['r'],
      g: [...params.pro.curves.g] as ColorGradingParams['pro']['curves']['g'],
      b: [...params.pro.curves.b] as ColorGradingParams['pro']['curves']['b'],
    },
    wheels: {
      shadows: {...params.pro.wheels.shadows},
      midtones: {...params.pro.wheels.midtones},
      highlights: {...params.pro.wheels.highlights},
    },
  },
});

const isRecoverableRecognizerError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('no match') ||
    normalized.includes('speech timeout') ||
    normalized.includes('recognizer busy')
  );
};

const buildStyleFallback = (transcript: string): InterpretResponse | null => {
  const matchedStyle = matchStyleFromTranscript(transcript);
  if (!matchedStyle) {
    return null;
  }
  let style: VoiceStyleTag = matchedStyle;
  const lowered = transcript.toLowerCase();
  let strength = 1;
  if (lowered.includes('一点') || lowered.includes('稍微')) {
    strength = 0.65;
  } else if (lowered.includes('非常') || lowered.includes('很') || lowered.includes('强烈')) {
    strength = 1.25;
  }
  if (lowered.includes('不要太黄') || lowered.includes('别太黄')) {
    style = 'cinematic_cool';
    strength = Math.min(strength, 0.8);
  }

  return {
    actions: [{action: 'apply_style', target: 'style', style, strength}],
    confidence: 0.6,
    needsConfirmation: false,
    fallbackUsed: true,
    reasoningSummary: '风格模板兜底',
    message: '已使用风格模板进行增量调色',
    source: 'fallback',
    analysisSummary: '云端暂不可用，改用风格模板增量修正',
  };
};

export const useVoiceColorGrading = ({
  currentParams,
  onApplyParams,
  getImageContext,
  cloudEndpoint,
  locale = 'zh-CN',
}: UseVoiceColorGradingOptions): UseVoiceColorGradingResult => {
  const [state, setState] = useState<
    VoicePipelineState | 'continuous_listening' | 'queue_applying'
  >('idle');
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [lastError, setLastError] = useState('');
  const [lastAppliedSummary, setLastAppliedSummary] = useState('');
  const [canUndo, setCanUndo] = useState(false);
  const [canUndoSession, setCanUndoSession] = useState(false);
  const [visualState, setVisualState] = useState<
    'idle' | 'visual_pending' | 'visual_applied' | 'visual_error'
  >('idle');
  const [visualSummary, setVisualSummary] = useState('');
  const [visualProfile, setVisualProfile] = useState('');
  const [visualApplySummary, setVisualApplySummary] = useState('');

  const paramsRef = useRef(currentParams);
  paramsRef.current = currentParams;
  const sessionRef = useRef<VoiceSession | null>(null);
  const lastApplyRef = useRef<VoiceApplyRecord | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const listeningRef = useRef(false);
  const isPressingRef = useRef(false);
  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(false);
  const partialTranscriptRef = useRef('');
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyInterpretation = useCallback(
    (interpretation: InterpretResponse, summaryPrefix = '') => {
      const before = cloneParams(paramsRef.current);
      const after = applyVoiceInterpretation(before, interpretation);
      const summary = `${summaryPrefix}${formatInterpretationSummary(interpretation)}`;
      onApplyParams(after);
      paramsRef.current = cloneParams(after);
      setLastAppliedSummary(summary);
      setLastError('');

      const record: VoiceApplyRecord = {before, after: cloneParams(after), summary};
      lastApplyRef.current = record;
      setCanUndo(true);
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
      undoTimerRef.current = setTimeout(() => {
        setCanUndo(false);
        lastApplyRef.current = null;
      }, 3000);

      if (sessionRef.current) {
        sessionRef.current.history.push(record);
        setCanUndoSession(sessionRef.current.history.length > 0);
      }
    },
    [onApplyParams],
  );

  const resolveVoiceRefine = useCallback(
    async (text: string): Promise<InterpretResponse | null> => {
      const imageContext = getImageContext();
      if (!imageContext) {
        setLastError('请先上传图片后再语音修改。');
        return null;
      }
      const cloud = await interpretWithCloud(
        {
          mode: 'voice_refine',
          transcript: text,
          currentParams: paramsRef.current,
          locale,
          image: imageContext.image,
          imageStats: imageContext.imageStats,
        },
        cloudEndpoint,
      );
      if (cloud) {
        return cloud;
      }
      return buildStyleFallback(text);
    },
    [cloudEndpoint, getImageContext, locale],
  );

  const processQueue = useCallback(async () => {
    if (processingRef.current) {
      return;
    }
    processingRef.current = true;
    while (queueRef.current.length > 0) {
      const text = queueRef.current.shift();
      if (!text) {
        break;
      }
      setState('queue_applying');
      setTranscript(text);
      setPartialTranscript('');
      try {
        const interpretation = await resolveVoiceRefine(text);
        if (!interpretation || interpretation.actions.length === 0) {
          setLastError('未能识别为有效风格修改，请换个说法。');
          continue;
        }
        applyInterpretation(interpretation, '语音增量: ');
      } catch {
        setLastError('语音增量解析失败，请重试。');
      }
    }
    processingRef.current = false;
    setState(isPressingRef.current ? 'continuous_listening' : 'parsed');
  }, [applyInterpretation, resolveVoiceRefine]);

  const scheduleRestart = useCallback(() => {
    if (!isPressingRef.current || restartTimerRef.current) {
      return;
    }
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      recognizerRef.current.start(locale).catch(() => undefined);
    }, 180);
  }, [locale]);

  const recognizerRef = useRef(
    createSpeechRecognizer({
      onStart: () => {
        listeningRef.current = true;
        setState('continuous_listening');
      },
      onEnd: () => {
        listeningRef.current = false;
        if (isPressingRef.current) {
          scheduleRestart();
        }
      },
      onPartial: text => {
        partialTranscriptRef.current = text;
        setPartialTranscript(text);
      },
      onFinal: text => {
        listeningRef.current = false;
        if (text?.trim()) {
          queueRef.current.push(text.trim());
        }
        if (isPressingRef.current) {
          scheduleRestart();
        } else {
          processQueue().catch(() => undefined);
        }
      },
      onError: message => {
        listeningRef.current = false;
        if (isPressingRef.current && isRecoverableRecognizerError(message)) {
          scheduleRestart();
          return;
        }
        setLastError(message);
        setState('error');
      },
    }),
  );

  const requestInitialVisualSuggestion = useCallback(async () => {
    const imageContext = getImageContext();
    if (!imageContext) {
      return;
    }

    setVisualState('visual_pending');
    setVisualSummary('');
    setVisualProfile('');
    setVisualApplySummary('');
    setLastError('');

    try {
      const interpretation =
        (await interpretWithCloud(
          {
            mode: 'initial_visual_suggest',
            transcript: '',
            currentParams: paramsRef.current,
            locale,
            image: imageContext.image,
            imageStats: imageContext.imageStats,
            sceneHints: ['initial_visual_pass'],
          },
          cloudEndpoint,
        )) || buildStyleFallback('清新明亮');

      if (!interpretation || interpretation.actions.length === 0) {
        setVisualState('visual_error');
        setLastError('视觉模型未返回有效首轮建议。');
        return;
      }

      applyInterpretation(interpretation, '视觉首轮: ');
      setVisualSummary(interpretation.analysisSummary || interpretation.reasoningSummary);
      setVisualProfile(interpretation.appliedProfile || '');
      setVisualApplySummary(formatInterpretationSummary(interpretation));
      setVisualState('visual_applied');
    } catch {
      setVisualState('visual_error');
      setLastError('视觉首轮建议失败，可直接语音继续修改。');
    }
  }, [applyInterpretation, cloudEndpoint, getImageContext, locale]);

  const startPressToTalk = useCallback(async () => {
    const hasPermission = await requestRecordAudioPermission();
    if (!hasPermission) {
      setLastError('缺少录音权限，无法语音调色。');
      setState('error');
      return;
    }
    if (!getImageContext()) {
      setLastError('请先上传图片并完成首轮建议。');
      setState('error');
      return;
    }

    queueRef.current = [];
    partialTranscriptRef.current = '';
    setTranscript('');
    setPartialTranscript('');
    setLastError('');
    setIsRecording(true);
    setState('continuous_listening');
    isPressingRef.current = true;
    sessionRef.current = {
      beforeSession: cloneParams(paramsRef.current),
      history: [],
    };
    setCanUndoSession(false);
    await recognizerRef.current.start(locale);
  }, [getImageContext, locale]);

  const stopPressToTalk = useCallback(async () => {
    isPressingRef.current = false;
    setIsRecording(false);
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    try {
      await recognizerRef.current.stop();
    } catch {
      // ignore
    }
    if (queueRef.current.length === 0 && partialTranscriptRef.current.trim()) {
      queueRef.current.push(partialTranscriptRef.current.trim());
    }
    processQueue().catch(() => undefined);
  }, [processQueue]);

  const undoLastApply = useCallback(() => {
    const lastApply = lastApplyRef.current;
    if (!lastApply) {
      return;
    }
    onApplyParams(lastApply.before);
    paramsRef.current = cloneParams(lastApply.before);
    setCanUndo(false);
    setLastAppliedSummary(`已撤销：${lastApply.summary}`);
    lastApplyRef.current = null;
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    if (sessionRef.current?.history.length) {
      sessionRef.current.history.pop();
      setCanUndoSession(sessionRef.current.history.length > 0);
    }
  }, [onApplyParams]);

  const undoSessionApply = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.history.length === 0) {
      return;
    }
    onApplyParams(session.beforeSession);
    paramsRef.current = cloneParams(session.beforeSession);
    session.history = [];
    setCanUndoSession(false);
    setCanUndo(false);
    setLastAppliedSummary('已撤销本次语音会话调色');
  }, [onApplyParams]);

  useEffect(() => {
    return () => {
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
      }
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
      recognizerRef.current.destroy().catch(() => undefined);
    };
  }, []);

  return {
    state,
    isRecording,
    transcript,
    partialTranscript,
    lastError,
    lastAppliedSummary,
    canUndo,
    canUndoSession,
    visualState,
    visualSummary,
    visualProfile,
    visualApplySummary,
    requestInitialVisualSuggestion,
    startPressToTalk,
    stopPressToTalk,
    undoLastApply,
    undoSessionApply,
  };
};

