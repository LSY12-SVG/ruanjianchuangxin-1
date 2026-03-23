import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Image as RNImage,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  Canvas,
  ColorMatrix,
  Image as SkiaImage,
  Skia,
  type SkImage,
} from '@shopify/react-native-skia';
import {useImagePicker} from '../hooks/useImagePicker';
import {defaultColorGradingParams, type ColorGradingParams} from '../types/colorGrading';
import {buildVoiceImageContext} from '../voice/imageContext';
import {parseLocalVoiceCommand} from '../voice/localParser';
import {applyVoiceInterpretation, formatInterpretationSummary} from '../voice/paramApplier';
import {createSpeechRecognizer, requestRecordAudioPermission} from '../voice/speechRecognizer';
import {useAgentExecutionContextStore} from '../agent/executionContextStore';
import {
  colorApi,
  formatApiErrorMessage,
  type ColorRequestContext,
  type ModuleCapabilityItem,
} from '../modules/api';
import {ApiRequestError} from '../modules/api/http';
import type {InterpretResponse, VoiceAudioReadyPayload} from '../voice/types';
import {PageHero} from '../components/app/PageHero';
import {HERO_CREATE} from '../assets/design';
import {canvasText, canvasUi, cardSurfaceBlue, glassShadow} from '../theme/canvasDesign';
import {buildPreviewColorMatrix} from '../colorEngine/previewColorMatrix';

type CreateMode = 'voice' | 'pro';
type VoiceInputPhase = 'idle' | 'listening' | 'parsing' | 'error';

const VOICE_PARSE_WATCHDOG_MS = 2500;
const VOICE_FALLBACK_HINT =
  '未识别到明确调色命令。可尝试：亮度加10、色温冷一点、饱和度减5。';
const VOICE_NO_TRANSCRIPT_HINT =
  '未识别到有效语音，请重试。可尝试：亮度加10、色温冷一点、饱和度减5。';
const VOICE_FALLBACK_ERROR_CODES = new Set([
  'REAL_MODEL_REQUIRED',
  'PROVIDER_TIMEOUT',
  'MODEL_UNAVAILABLE',
  'NETWORK_ERROR',
]);

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

const formatVoiceTranscribeError = (error: unknown): string => {
  if (error instanceof ApiRequestError) {
    const mapped = mapAsrErrorCodeToMessage(String(error.code || '').toUpperCase());
    if (mapped) {
      return mapped;
    }
  }
  const fallback = formatApiErrorMessage(error, '语音转写失败');
  return normalizeSpeechErrorMessage(fallback);
};

const CREATE_PRESETS: Array<{
  name: string;
  exposure: number;
  contrast: number;
  temperature: number;
  saturation: number;
  vibrance: number;
}> = [
  {name: '电影胶片', exposure: 0.2, contrast: 18, temperature: 16, saturation: 6, vibrance: 14},
  {name: '赛博朋克', exposure: 0.08, contrast: 26, temperature: -14, saturation: 20, vibrance: 26},
  {name: '日系清新', exposure: 0.26, contrast: -8, temperature: 10, saturation: -10, vibrance: 8},
  {name: '复古胶卷', exposure: 0.12, contrast: -16, temperature: 18, saturation: -14, vibrance: -6},
];

const sanitizeBase64 = (raw?: string): string =>
  String(raw || '').replace(/^data:image\/\w+;base64,/, '');

const toColorRequestContext = (
  locale: string,
  currentParams: ColorGradingParams,
  context: ReturnType<typeof buildVoiceImageContext>,
): ColorRequestContext | null => {
  if (!context) {
    return null;
  }
  return {
    locale,
    currentParams,
    image: context.image,
    imageStats: context.imageStats,
  };
};

type ProParamItem =
  | {
      key: keyof ColorGradingParams['basic'];
      label: string;
      min: number;
      max: number;
      step: number;
      section: 'basic';
    }
  | {
      key: keyof ColorGradingParams['colorBalance'];
      label: string;
      min: number;
      max: number;
      step: number;
      section: 'colorBalance';
    };

const proParams: ProParamItem[] = [
  {key: 'exposure', label: '曝光', min: -2, max: 2, step: 0.02, section: 'basic'},
  {key: 'contrast', label: '对比度', min: -100, max: 100, step: 1, section: 'basic'},
  {key: 'highlights', label: '高光', min: -100, max: 100, step: 1, section: 'basic'},
  {key: 'shadows', label: '阴影', min: -100, max: 100, step: 1, section: 'basic'},
  {key: 'temperature', label: '色温', min: -100, max: 100, step: 1, section: 'colorBalance'},
  {key: 'saturation', label: '饱和度', min: -100, max: 100, step: 1, section: 'colorBalance'},
  {key: 'vibrance', label: '自然饱和度', min: -100, max: 100, step: 1, section: 'colorBalance'},
];

const isNeutralPreviewParams = (params: ColorGradingParams): boolean =>
  params.basic.exposure === 0 &&
  params.basic.contrast === 0 &&
  params.basic.brightness === 0 &&
  params.basic.highlights === 0 &&
  params.basic.shadows === 0 &&
  params.basic.whites === 0 &&
  params.basic.blacks === 0 &&
  params.colorBalance.temperature === 0 &&
  params.colorBalance.tint === 0 &&
  params.colorBalance.redBalance === 0 &&
  params.colorBalance.greenBalance === 0 &&
  params.colorBalance.blueBalance === 0 &&
  params.colorBalance.vibrance === 0 &&
  params.colorBalance.saturation === 0;

interface CreateScreenProps {
  capabilities: ModuleCapabilityItem[];
}

export const CreateScreen: React.FC<CreateScreenProps> = ({capabilities}) => {
  const [mode, setMode] = useState<CreateMode>('voice');
  const [params, setParams] = useState<ColorGradingParams>(defaultColorGradingParams);
  const [summary, setSummary] = useState('');
  const [errorText, setErrorText] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [recording, setRecording] = useState(false);
  const [voicePhase, setVoicePhase] = useState<VoiceInputPhase>('idle');
  const [segmentationSummary, setSegmentationSummary] = useState('');
  const [showPresets, setShowPresets] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<string[]>([]);
  const [locale] = useState('zh-CN');
  const [skImage, setSkImage] = useState<SkImage | null>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  const selectedImageUriRef = useRef('');
  const liveTranscriptRef = useRef('');
  const autoSubmittedTranscriptRef = useRef('');
  const submittedAudioUriRef = useRef('');
  const runVoiceRefineRef = useRef<(text: string) => Promise<void>>(async () => undefined);
  const parseWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingParseRef = useRef(false);

  const colorCapability = capabilities.find(item => item.module === 'color');
  const setAgentColorContext = useAgentExecutionContextStore(state => state.setColorContext);

  const {selectedImage, pickFromGallery, pickFromCamera, clearImage} = useImagePicker({
    onImageError: message => setErrorText(message),
  });

  useEffect(() => {
    const base64 = sanitizeBase64(selectedImage?.base64);
    if (!selectedImage?.success || !base64) {
      setSkImage(null);
      return;
    }
    const data = Skia.Data.fromBase64(base64);
    const nextImage = data ? Skia.Image.MakeImageFromEncoded(data) : null;
    setSkImage(nextImage || null);
  }, [selectedImage]);

  useEffect(() => {
    const nextUri = selectedImage?.success ? String(selectedImage.uri || '') : '';
    if (!nextUri) {
      selectedImageUriRef.current = '';
      return;
    }
    if (selectedImageUriRef.current === nextUri) {
      return;
    }
    selectedImageUriRef.current = nextUri;
    setParams(defaultColorGradingParams);
    setSummary('');
    setSegmentationSummary('');
  }, [selectedImage]);

  const imageContext = useMemo(
    () => buildVoiceImageContext(selectedImage, skImage),
    [selectedImage, skImage],
  );

  const requestContext = useMemo(
    () => toColorRequestContext(locale, params, imageContext),
    [imageContext, locale, params],
  );

  useEffect(() => {
    setAgentColorContext(requestContext ? {...requestContext} : null);
  }, [requestContext, setAgentColorContext]);
  const previewColorMatrix = useMemo(() => buildPreviewColorMatrix(params), [params]);
  const isPreviewOriginal = useMemo(() => isNeutralPreviewParams(params), [params]);
  const useSkiaPreview = Boolean(skImage && previewWidth > 1 && !isPreviewOriginal);

  const applyInterpret = (interpretation: InterpretResponse, prefix: string) => {
    const next = applyVoiceInterpretation(params, interpretation);
    setParams(next);
    setSummary(`${prefix}${formatInterpretationSummary(interpretation)}`);
    setHistoryEntries(prev => [`${new Date().toLocaleTimeString()} ${prefix}`, ...prev].slice(0, 8));
  };

  const ensureContext = (): ColorRequestContext => {
    if (!requestContext) {
      throw new Error('请先上传图片');
    }
    return requestContext;
  };

  const runInitialSuggest = async () => {
    try {
      setLoading(true);
      setErrorText('');
      const context = ensureContext();
      const interpretation = await colorApi.initialSuggest(context);
      applyInterpret(interpretation, 'AI 首轮建议: ');
    } catch (error) {
      const message = formatApiErrorMessage(error, '首轮建议失败');
      setErrorText(message);
      Alert.alert('首轮建议失败', message);
    } finally {
      setLoading(false);
    }
  };

  const runVoiceRefine = async (text: string) => {
    try {
      setLoading(true);
      setErrorText('');
      setVoicePhase('parsing');
      const context = requestContext;
      if (!context) {
        const localInterpretation = parseLocalVoiceCommand(text);
        if (Array.isArray(localInterpretation.actions) && localInterpretation.actions.length > 0) {
          applyInterpret(localInterpretation, '语音精修(本地): ');
          setVoicePhase('idle');
          return;
        }

        setVoicePhase('error');
        setSummary(VOICE_FALLBACK_HINT);
        setErrorText(VOICE_FALLBACK_HINT);
        return;
      }
      const interpretation = await colorApi.voiceRefine(context, text);
      applyInterpret(interpretation, '语音精修: ');
      setVoicePhase('idle');
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        VOICE_FALLBACK_ERROR_CODES.has(String(error.code || '').toUpperCase())
      ) {
        const localInterpretation = parseLocalVoiceCommand(text);
        if (Array.isArray(localInterpretation.actions) && localInterpretation.actions.length > 0) {
          setErrorText('');
          applyInterpret(localInterpretation, '语音精修(本地兜底): ');
          setVoicePhase('idle');
          return;
        }

        setVoicePhase('error');
        setSummary(VOICE_FALLBACK_HINT);
        setErrorText(VOICE_FALLBACK_HINT);
        return;
      }

      const message = formatApiErrorMessage(error, '语音精修失败');
      setErrorText(message);
      setVoicePhase('error');
      Alert.alert('语音精修失败', message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runVoiceRefineRef.current = runVoiceRefine;
  }, [runVoiceRefine]);

  const runAutoGrade = async (phase: 'fast' | 'refine') => {
    try {
      setLoading(true);
      setErrorText('');
      const context = ensureContext();
      const result = await colorApi.autoGrade(context, phase);
      const interpretation: InterpretResponse = {
        actions: result.globalActions || [],
        confidence: result.confidence || 0,
        needsConfirmation: false,
        fallbackUsed: Boolean(result.fallbackUsed),
        reasoningSummary: result.explanation || '',
        message: result.explanation || '',
        source: 'cloud',
        sceneProfile: result.sceneProfile,
        qualityRiskFlags: result.qualityRiskFlags,
      };
      applyInterpret(interpretation, phase === 'fast' ? 'Pro 快速自动调色: ' : 'Pro 精修自动调色: ');
    } catch (error) {
      const message = formatApiErrorMessage(error, '自动调色失败');
      setErrorText(message);
      Alert.alert('自动调色失败', message);
    } finally {
      setLoading(false);
    }
  };

  const runSegmentation = async () => {
    try {
      setLoading(true);
      setErrorText('');
      const context = ensureContext();
      const result = await colorApi.segment(context);
      const text = (result.masks || [])
        .map(mask => `${mask.type}: 覆盖${Math.round(mask.coverage * 100)}%, 置信${Math.round(mask.confidence * 100)}%`)
        .join(' | ');
      setSegmentationSummary(text || '无可用分区信息');
      setHistoryEntries(prev => [`${new Date().toLocaleTimeString()} 生成分区摘要`, ...prev].slice(0, 8));
    } catch (error) {
      const message = formatApiErrorMessage(error, '分割失败');
      setErrorText(message);
      Alert.alert('分割失败', message);
    } finally {
      setLoading(false);
    }
  };

  const clearParseWatchdog = () => {
    if (parseWatchdogRef.current) {
      clearTimeout(parseWatchdogRef.current);
      parseWatchdogRef.current = null;
    }
  };

  const clearVoicePendingState = () => {
    pendingParseRef.current = false;
    clearParseWatchdog();
  };

  const setVoiceErrorState = (message: string) => {
    clearVoicePendingState();
    submittedAudioUriRef.current = '';
    setRecording(false);
    setVoicePhase('error');
    setErrorText(message);
  };

  const armParseWatchdog = () => {
    clearParseWatchdog();
    parseWatchdogRef.current = setTimeout(() => {
      if (!pendingParseRef.current) {
        return;
      }
      pendingParseRef.current = false;
      setRecording(false);
      setVoicePhase('error');
      setSummary('语音采集未获得可转写内容，请重试');
      setErrorText(VOICE_NO_TRANSCRIPT_HINT);
    }, VOICE_PARSE_WATCHDOG_MS);
  };

  const submitVoiceTranscript = (rawText: string): boolean => {
    const normalized = rawText.trim();
    if (!normalized) {
      return false;
    }

    liveTranscriptRef.current = normalized;
    setVoiceText(normalized);

    if (autoSubmittedTranscriptRef.current === normalized) {
      clearVoicePendingState();
      return true;
    }

    autoSubmittedTranscriptRef.current = normalized;
    clearVoicePendingState();
    setSummary('语音识别完成，正在解析调色指令...');
    runVoiceRefineRef.current(normalized).catch(() => undefined);
    return true;
  };

  const submitVoiceAudio = async (audio: VoiceAudioReadyPayload): Promise<boolean> => {
    const audioUri = String(audio.uri || '').trim();
    if (!audioUri) {
      return false;
    }
    if (submittedAudioUriRef.current === audioUri) {
      return true;
    }
    if (autoSubmittedTranscriptRef.current.trim()) {
      return true;
    }

    submittedAudioUriRef.current = audioUri;
    clearVoicePendingState();
    setSummary('语音采集完成，正在转写...');
    setVoicePhase('parsing');

    try {
      const result = await colorApi.voiceTranscribe({
        uri: audioUri,
        mimeType: audio.mimeType,
        locale,
      });
      const transcript = String(result.transcript || '').trim();
      if (!transcript) {
        setVoicePhase('error');
        setSummary('语音转写未返回有效文本，请重试');
        setErrorText(VOICE_NO_TRANSCRIPT_HINT);
        return false;
      }

      setVoiceText(transcript);
      setSummary(`识别文本: ${transcript}`);
      return submitVoiceTranscript(transcript);
    } catch (error) {
      setVoiceErrorState(formatVoiceTranscribeError(error));
      return false;
    } finally {
      submittedAudioUriRef.current = '';
      if (recognizerRef.current.adapter.cleanupAudio) {
        recognizerRef.current.adapter.cleanupAudio(audioUri).catch(() => undefined);
      }
    }
  };

  const recognizerRef = useRef({
    pressing: false,
    adapter: createSpeechRecognizer({
      onPartial: text => {
        const normalized = text?.trim();
        if (normalized) {
          liveTranscriptRef.current = normalized;
          setVoiceText(normalized);
          setSummary(`实时识别: ${normalized}`);
        }
      },
      onFinal: text => {
        const normalized = text?.trim();
        if (!normalized) {
          return;
        }
        submitVoiceTranscript(normalized);
      },
      onAudioReady: audio => {
        submitVoiceAudio(audio).catch(() => undefined);
      },
      onError: message => {
        setVoiceErrorState(normalizeSpeechErrorMessage(message || '语音识别失败，请重试'));
      },
      onPreempted: () => {
        setVoiceErrorState('语音识别已被抢占，请重试。');
      },
      onEnd: () => {
        setRecording(false);
        if (autoSubmittedTranscriptRef.current.trim()) {
          clearVoicePendingState();
          return;
        }
        if (pendingParseRef.current) {
          armParseWatchdog();
        }
      },
    }),
  });

  useEffect(() => {
    const recognizer = recognizerRef.current.adapter;
    return () => {
      clearVoicePendingState();
      submittedAudioUriRef.current = '';
      recognizer.destroy().catch(() => undefined);
    };
  }, []);

  const startRecord = async () => {
    try {
      if (loading) {
        setErrorText('当前任务处理中，请稍后再语音输入');
        return;
      }
      if (recording) {
        return;
      }
      const granted = await requestRecordAudioPermission();
      if (!granted) {
        setErrorText('录音权限未开启');
        return;
      }
      if (!recognizerRef.current.pressing) {
        return;
      }
      setErrorText('');
      clearVoicePendingState();
      liveTranscriptRef.current = '';
      autoSubmittedTranscriptRef.current = '';
      submittedAudioUriRef.current = '';
      setVoiceText('');
      setSummary('语音采集中...');
      setVoicePhase('listening');
      setRecording(true);
      await recognizerRef.current.adapter.start(locale);
      if (!recognizerRef.current.pressing) {
        await recognizerRef.current.adapter.stop();
        setRecording(false);
        setVoicePhase('idle');
      }
    } catch (error) {
      const message = formatApiErrorMessage(error, '语音启动失败');
      setVoiceErrorState(normalizeSpeechErrorMessage(message));
    }
  };

  const stopRecord = async () => {
    if (!recording && voicePhase !== 'listening') {
      return;
    }
    try {
      setSummary('语音采集结束，正在识别...');
      setVoicePhase('parsing');
      if (!autoSubmittedTranscriptRef.current.trim()) {
        pendingParseRef.current = true;
        armParseWatchdog();
      } else {
        clearVoicePendingState();
      }
      await recognizerRef.current.adapter.stop();
    } catch (error) {
      const message = formatApiErrorMessage(error, '语音停止失败');
      setVoiceErrorState(normalizeSpeechErrorMessage(message));
    } finally {
      setRecording(false);
    }
  };

  const handleVoicePressIn = () => {
    recognizerRef.current.pressing = true;
    startRecord().catch(() => undefined);
  };

  const handleVoicePressOut = () => {
    recognizerRef.current.pressing = false;
    stopRecord().catch(() => undefined);
  };

  const setManualParam = (item: ProParamItem, value: number) => {
    setParams(prev => {
      if (item.section === 'basic') {
        return {
          ...prev,
          basic: {
            ...prev.basic,
            [item.key]: value,
          },
        };
      }
      return {
        ...prev,
        colorBalance: {
          ...prev.colorBalance,
          [item.key]: value,
        },
      };
    });
  };

  const onPreviewLayout = (event: LayoutChangeEvent) => {
    const width = Math.max(1, Math.round(event.nativeEvent.layout.width));
    if (width !== previewWidth) {
      setPreviewWidth(width);
    }
  };

  const onManualParamCommit = (item: ProParamItem, value: number) => {
    const label = item.label;
    const formatted = value.toFixed(item.step < 1 ? 2 : 0);
    setSummary(`手动调色: ${label} -> ${formatted}`);
  };

  const applyPreset = (preset: (typeof CREATE_PRESETS)[number]) => {
    setParams(prev => ({
      ...prev,
      basic: {
        ...prev.basic,
        exposure: preset.exposure,
        contrast: preset.contrast,
      },
      colorBalance: {
        ...prev.colorBalance,
        temperature: preset.temperature,
        saturation: preset.saturation,
        vibrance: preset.vibrance,
      },
    }));
    setHistoryEntries(prev => [`${new Date().toLocaleTimeString()} 预设:${preset.name}`, ...prev].slice(0, 8));
    setShowPresets(false);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <PageHero
        image={HERO_CREATE}
        title="创作调色"
        subtitle="AI 智能首轮 + 语音精修 + 专业参数"
        variant="warm"
        overlayStrength="normal"
      />

      <View style={styles.modeRow}>
        <Pressable
          onPress={() => setMode('voice')}
          style={[styles.modeBtn, mode === 'voice' && styles.modeBtnActive]}>
          <Icon name="mic" size={15} color="#3B2F29" />
          <Text style={styles.modeBtnText}>语音</Text>
        </Pressable>
        <Pressable
          onPress={() => setMode('pro')}
          style={[styles.modeBtn, mode === 'pro' && styles.modeBtnActive]}>
          <Icon name="options" size={15} color="#3B2F29" />
          <Text style={styles.modeBtnText}>专业</Text>
        </Pressable>
      </View>

      <View style={styles.toolsRow}>
        <Pressable style={styles.toolChip} onPress={() => setShowPresets(prev => !prev)}>
          <Icon name="layers" size={14} color="#3B2F29" />
          <Text style={styles.toolChipText}>预设</Text>
        </Pressable>
        <Pressable style={styles.toolChip} onPress={() => setShowHistory(prev => !prev)}>
          <Icon name="time" size={14} color="#3B2F29" />
          <Text style={styles.toolChipText}>历史</Text>
        </Pressable>
      </View>

      {showPresets ? (
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionIconBadge}>
              <Icon name="color-palette" size={13} color="#A34A3C" />
            </View>
            <Text style={styles.sectionTitle}>风格预设</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
            {CREATE_PRESETS.map(item => (
              <Pressable key={item.name} style={styles.presetChip} onPress={() => applyPreset(item)}>
                <Text style={styles.presetChipText}>{item.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {showHistory ? (
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionIconBadge}>
              <Icon name="albums" size={13} color="#A34A3C" />
            </View>
            <Text style={styles.sectionTitle}>调色历史</Text>
          </View>
          {historyEntries.length ? (
            historyEntries.map((item, index) => (
              <Text key={`${index}-${item}`} style={styles.metaText}>
                {item}
              </Text>
            ))
          ) : (
            <Text style={styles.metaText}>暂无历史</Text>
          )}
        </View>
      ) : null}

      <View style={styles.card}>
        {!selectedImage?.success ? (
          <View style={styles.uploadWrap}>
            <View style={styles.sectionHead}>
              <View style={styles.sectionIconBadge}>
                <Icon name="images" size={13} color="#A34A3C" />
              </View>
              <Text style={styles.uploadTitle}>上传图片开始调色</Text>
            </View>
            <View style={styles.actionRow}>
              <Pressable style={styles.primaryBtn} onPress={() => pickFromGallery()}>
                <Icon name="images" size={16} color="#FFF6F2" />
                <Text style={styles.primaryBtnText}>相册选择</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={() => pickFromCamera()}>
                <Icon name="camera" size={16} color="#3B2F29" />
                <Text style={styles.secondaryBtnText}>拍照导入</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View>
            <View style={styles.previewFrame} onLayout={onPreviewLayout}>
              {useSkiaPreview ? (
                <Canvas style={styles.preview}>
                  <SkiaImage image={skImage} x={0} y={0} width={previewWidth} height={220} fit="cover">
                    <ColorMatrix matrix={previewColorMatrix} />
                  </SkiaImage>
                </Canvas>
              ) : (
                <RNImage source={{uri: selectedImage.uri}} style={styles.preview} />
              )}
            </View>
            <Text style={styles.metaText}>
              {useSkiaPreview ? '当前预览已应用调色参数' : '当前预览为原图'}
            </Text>
            <View style={styles.previewActions}>
              <Pressable style={styles.primaryBtn} onPress={runInitialSuggest} disabled={loading}>
                <Icon name="sparkles" size={16} color="#FFF6F2" />
                <Text style={styles.primaryBtnText}>{loading ? '处理中...' : 'AI首轮'}</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={clearImage}>
                <Icon name="refresh" size={16} color="#3B2F29" />
                <Text style={styles.secondaryBtnText}>重选</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {mode === 'voice' ? (
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionIconBadge}>
              <Icon name="mic" size={13} color="#A34A3C" />
            </View>
            <Text style={styles.sectionTitle}>语音精修</Text>
          </View>
          <TextInput
            style={styles.input}
            placeholder="例如：高光降低一点，肤色自然"
            placeholderTextColor="rgba(150,124,110,0.74)"
            value={voiceText}
            onChangeText={setVoiceText}
          />
          <View style={styles.liveDialog}>
            <Text style={styles.liveDialogLabel}>实时对话框</Text>
            <Text style={styles.liveDialogText}>
              {voiceText || (recording ? '正在识别语音，请继续说话...' : '按住下方按钮开始语音输入')}
            </Text>
          </View>
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.primaryBtn, recording && styles.warnBtn]}
              onPressIn={handleVoicePressIn}
              onPressOut={handleVoicePressOut}
              disabled={loading}>
              <Icon
                name={recording ? 'stop-circle' : 'mic'}
                size={16}
                color={recording ? '#2A0A11' : '#FFF6F2'}
              />
              <Text style={styles.primaryBtnText}>{recording ? '松开结束' : '按住说话'}</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => runVoiceRefine(voiceText)}
              disabled={!voiceText.trim() || loading}>
              <Text style={styles.secondaryBtnText}>文本执行</Text>
            </Pressable>
          </View>
          <Text style={styles.metaText}>按住说话，松开后自动执行语音精修</Text>
          <Text style={styles.metaText}>语音阶段: {voicePhase}</Text>
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionIconBadge}>
              <Icon name="options" size={13} color="#A34A3C" />
            </View>
            <Text style={styles.sectionTitle}>专业参数</Text>
          </View>
          {proParams.map(item => {
            const value =
              item.section === 'basic'
                ? Number(params.basic[item.key])
                : Number(params.colorBalance[item.key]);
            return (
              <View key={item.key} style={styles.sliderRow}>
                <View style={styles.sliderHeader}>
                  <Text style={styles.sliderLabel}>{item.label}</Text>
                  <Text style={styles.sliderValue}>{value.toFixed(item.step < 1 ? 2 : 0)}</Text>
                </View>
                <Slider
                  minimumValue={item.min}
                  maximumValue={item.max}
                  step={item.step}
                  value={value}
                  onValueChange={next => setManualParam(item, next)}
                  onSlidingComplete={next => onManualParamCommit(item, next)}
                  minimumTrackTintColor="#A34A3C"
                  maximumTrackTintColor="rgba(171,129,110,0.3)"
                  thumbTintColor="#B75A48"
                />
              </View>
            );
          })}
          <View style={styles.actionRow}>
            <Pressable style={styles.primaryBtn} onPress={() => runAutoGrade('fast')} disabled={loading}>
              <Icon name="flash" size={16} color="#FFF6F2" />
              <Text style={styles.primaryBtnText}>Pro 首版</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => runAutoGrade('refine')} disabled={loading}>
              <Icon name="build" size={16} color="#3B2F29" />
              <Text style={styles.secondaryBtnText}>Pro 精修</Text>
            </Pressable>
          </View>
          <Pressable style={styles.secondaryBtn} onPress={runSegmentation} disabled={loading}>
            <Icon name="grid" size={16} color="#3B2F29" />
            <Text style={styles.secondaryBtnText}>分区摘要</Text>
          </Pressable>
          {segmentationSummary ? (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>分割摘要</Text>
              <Text style={styles.summaryText}>{segmentationSummary}</Text>
            </View>
          ) : null}
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionIconBadge}>
            <Icon name="checkmark-done" size={13} color="#A34A3C" />
          </View>
          <Text style={styles.summaryTitle}>执行结果</Text>
        </View>
        <Text style={styles.summaryText}>{summary || '等待操作'}</Text>
        {errorText ? <Text style={styles.errorText}>错误: {errorText}</Text> : null}
        <Text style={styles.metaText}>
          严格模式: {colorCapability?.strictMode ? 'ON' : 'UNKNOWN'} | Provider: {colorCapability?.provider || '-'}
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {
    gap: 14,
    paddingBottom: 24,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  toolsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toolChip: {
    ...canvasUi.chip,
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  toolChipText: {
    ...canvasText.bodyStrong,
    color: '#3B2F29',
  },
  modeBtn: {
    ...canvasUi.chip,
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modeBtnActive: {
    ...canvasUi.chipActive,
  },
  modeBtnText: {
    ...canvasText.bodyStrong,
    color: '#3B2F29',
  },
  card: {
    ...cardSurfaceBlue,
    ...glassShadow,
    padding: 14,
    gap: 12,
  },
  uploadWrap: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  uploadTitle: {
    ...canvasText.sectionTitle,
    color: '#3B2F29',
  },
  preview: {
    width: '100%',
    height: 220,
    overflow: 'hidden',
  },
  previewFrame: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#E7D7CC',
  },
  previewActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  presetRow: {
    gap: 8,
    paddingRight: 10,
  },
  presetChip: {
    ...canvasUi.chip,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  presetChipText: {
    ...canvasText.bodyStrong,
    color: '#3B2F29',
  },
  sectionTitle: {
    ...canvasText.sectionTitle,
    color: '#3B2F29',
  },
  sectionHead: {
    ...canvasUi.titleWithIcon,
  },
  sectionIconBadge: {
    ...canvasUi.iconBadge,
  },
  input: {
    ...canvasUi.input,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#3B2F29',
    ...canvasText.body,
  },
  liveDialog: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(171,129,110,0.24)',
    backgroundColor: 'rgba(247,239,234,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    minHeight: 68,
  },
  liveDialogLabel: {
    ...canvasText.bodyStrong,
    color: 'rgba(70,58,52,0.92)',
  },
  liveDialogText: {
    ...canvasText.body,
    color: 'rgba(76,64,56,0.9)',
    lineHeight: 18,
  },
  sliderRow: {
    gap: 4,
  },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sliderLabel: {
    ...canvasText.bodyStrong,
    color: 'rgba(70,58,52,0.9)',
  },
  sliderValue: {
    ...canvasText.bodyStrong,
    color: '#A34A3C',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryBtn: {
    ...canvasUi.primaryButton,
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  primaryBtnText: {
    ...canvasText.bodyStrong,
    color: '#FFF6F2',
  },
  secondaryBtn: {
    ...canvasUi.secondaryButton,
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    flexDirection: 'row',
    gap: 6,
  },
  secondaryBtnText: {
    ...canvasText.bodyStrong,
    color: '#3B2F29',
  },
  warnBtn: {
    ...canvasUi.dangerButton,
  },
  summaryCard: {
    ...canvasUi.subtleCard,
    borderRadius: 14,
    padding: 11,
    gap: 7,
  },
  summaryTitle: {
    ...canvasText.bodyStrong,
    color: '#3B2F29',
  },
  summaryText: {
    ...canvasText.body,
    color: 'rgba(76,64,56,0.9)',
    lineHeight: 18,
  },
  errorText: {
    ...canvasText.body,
    color: '#C35B63',
    lineHeight: 18,
  },
  metaText: {
    ...canvasText.bodyMuted,
    color: 'rgba(109,90,80,0.84)',
  },
});

