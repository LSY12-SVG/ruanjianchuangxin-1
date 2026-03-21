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
import {applyVoiceInterpretation, formatInterpretationSummary} from '../voice/paramApplier';
import {createSpeechRecognizer, requestRecordAudioPermission} from '../voice/speechRecognizer';
import {
  colorApi,
  formatApiErrorMessage,
  type ColorRequestContext,
  type ModuleCapabilityItem,
} from '../modules/api';
import type {InterpretResponse} from '../voice/types';
import {PageHero} from '../components/app/PageHero';
import {HERO_CREATE} from '../assets/design';
import {canvasText, cardSurfaceBlue, glassShadow} from '../theme/canvasDesign';
import {buildPreviewColorMatrix} from '../colorEngine/previewColorMatrix';

type CreateMode = 'voice' | 'pro';

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
  const [segmentationSummary, setSegmentationSummary] = useState('');
  const [showPresets, setShowPresets] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<string[]>([]);
  const [locale] = useState('zh-CN');
  const [skImage, setSkImage] = useState<SkImage | null>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  const liveTranscriptRef = useRef('');
  const autoSubmittedTranscriptRef = useRef('');
  const runVoiceRefineRef = useRef<(text: string) => Promise<void>>(async () => undefined);

  const colorCapability = capabilities.find(item => item.module === 'color');

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

  const imageContext = useMemo(
    () => buildVoiceImageContext(selectedImage, skImage),
    [selectedImage, skImage],
  );

  const requestContext = useMemo(
    () => toColorRequestContext(locale, params, imageContext),
    [imageContext, locale, params],
  );
  const previewColorMatrix = useMemo(() => buildPreviewColorMatrix(params), [params]);

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
      const context = ensureContext();
      const interpretation = await colorApi.voiceRefine(context, text);
      applyInterpret(interpretation, '语音精修: ');
    } catch (error) {
      const message = formatApiErrorMessage(error, '语音精修失败');
      setErrorText(message);
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
        if (normalized) {
          liveTranscriptRef.current = normalized;
          setVoiceText(normalized);
          if (autoSubmittedTranscriptRef.current !== normalized) {
            autoSubmittedTranscriptRef.current = normalized;
            runVoiceRefineRef.current(normalized).catch(() => undefined);
          }
        }
      },
      onError: message => {
        setRecording(false);
        setErrorText(message);
      },
      onPreempted: () => {
        setRecording(false);
        setErrorText('语音识别已被抢占，请重试。');
      },
      onEnd: () => {
        setRecording(false);
        const buffered = liveTranscriptRef.current.trim();
        if (buffered && autoSubmittedTranscriptRef.current !== buffered) {
          autoSubmittedTranscriptRef.current = buffered;
          runVoiceRefineRef.current(buffered).catch(() => undefined);
        }
      },
    }),
  });

  useEffect(() => {
    const recognizer = recognizerRef.current.adapter;
    return () => {
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
      if (!requestContext) {
        setErrorText('请先上传图片');
        return;
      }
      setErrorText('');
      liveTranscriptRef.current = '';
      autoSubmittedTranscriptRef.current = '';
      setVoiceText('');
      setSummary('语音识别中...');
      setRecording(true);
      await recognizerRef.current.adapter.start(locale);
      if (!recognizerRef.current.pressing) {
        await recognizerRef.current.adapter.stop();
        setRecording(false);
      }
    } catch (error) {
      setRecording(false);
      setErrorText(formatApiErrorMessage(error, '语音启动失败'));
    }
  };

  const stopRecord = async () => {
    if (!recording) {
      return;
    }
    try {
      setSummary('语音识别已结束，正在解析...');
      await recognizerRef.current.adapter.stop();
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
        overlayColors={[
          'rgba(7, 12, 24, 0.22)',
          'rgba(10, 23, 54, 0.68)',
          'rgba(17, 38, 76, 0.9)',
        ]}
      />

      <View style={styles.modeRow}>
        <Pressable
          onPress={() => setMode('voice')}
          style={[styles.modeBtn, mode === 'voice' && styles.modeBtnActive]}>
          <Icon name="mic-outline" size={15} color="#EAF6FF" />
          <Text style={styles.modeBtnText}>语音</Text>
        </Pressable>
        <Pressable
          onPress={() => setMode('pro')}
          style={[styles.modeBtn, mode === 'pro' && styles.modeBtnActive]}>
          <Icon name="options-outline" size={15} color="#EAF6FF" />
          <Text style={styles.modeBtnText}>专业</Text>
        </Pressable>
      </View>

      <View style={styles.toolsRow}>
        <Pressable style={styles.toolChip} onPress={() => setShowPresets(prev => !prev)}>
          <Icon name="layers-outline" size={14} color="#EAF6FF" />
          <Text style={styles.toolChipText}>预设</Text>
        </Pressable>
        <Pressable style={styles.toolChip} onPress={() => setShowHistory(prev => !prev)}>
          <Icon name="time-outline" size={14} color="#EAF6FF" />
          <Text style={styles.toolChipText}>历史</Text>
        </Pressable>
      </View>

      {showPresets ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>风格预设</Text>
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
          <Text style={styles.sectionTitle}>调色历史</Text>
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
            <Text style={styles.uploadTitle}>上传图片开始调色</Text>
            <View style={styles.actionRow}>
              <Pressable style={styles.primaryBtn} onPress={() => pickFromGallery()}>
                <Icon name="images-outline" size={16} color="#031225" />
                <Text style={styles.primaryBtnText}>相册选择</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={() => pickFromCamera()}>
                <Icon name="camera-outline" size={16} color="#EAF6FF" />
                <Text style={styles.secondaryBtnText}>拍照导入</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View>
            <View style={styles.previewFrame} onLayout={onPreviewLayout}>
              {skImage && previewWidth > 1 ? (
                <Canvas style={styles.preview}>
                  <SkiaImage image={skImage} x={0} y={0} width={previewWidth} height={220} fit="cover">
                    <ColorMatrix matrix={previewColorMatrix} />
                  </SkiaImage>
                </Canvas>
              ) : (
                <RNImage source={{uri: selectedImage.uri}} style={styles.preview} />
              )}
            </View>
            <Text style={styles.metaText}>当前预览已应用调色参数</Text>
            <View style={styles.previewActions}>
              <Pressable style={styles.primaryBtn} onPress={runInitialSuggest} disabled={loading}>
                <Text style={styles.primaryBtnText}>{loading ? '处理中...' : 'AI首轮建议'}</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={clearImage}>
                <Text style={styles.secondaryBtnText}>重新选择</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {mode === 'voice' ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>语音精修</Text>
          <TextInput
            style={styles.input}
            placeholder="例如：高光降低一点，肤色自然"
            placeholderTextColor="rgba(180,205,230,0.58)"
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
                name={recording ? 'stop-circle-outline' : 'mic-outline'}
                size={16}
                color={recording ? '#2A0A11' : '#031225'}
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
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>专业参数调色</Text>
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
                  minimumTrackTintColor="#6FE7FF"
                  maximumTrackTintColor="rgba(133,170,210,0.35)"
                  thumbTintColor="#4DA3FF"
                />
              </View>
            );
          })}
          <View style={styles.actionRow}>
            <Pressable style={styles.primaryBtn} onPress={() => runAutoGrade('fast')} disabled={loading}>
              <Text style={styles.primaryBtnText}>Pro 自动首版</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => runAutoGrade('refine')} disabled={loading}>
              <Text style={styles.secondaryBtnText}>Pro 精修</Text>
            </Pressable>
          </View>
          <Pressable style={styles.secondaryBtn} onPress={runSegmentation} disabled={loading}>
            <Text style={styles.secondaryBtnText}>生成分区摘要</Text>
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
        <Text style={styles.summaryTitle}>执行结果</Text>
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
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(145, 204, 255, 0.28)',
    backgroundColor: 'rgba(20, 33, 58, 0.76)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  toolChipText: {
    ...canvasText.bodyStrong,
    color: '#EAF6FF',
  },
  modeBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(145, 204, 255, 0.28)',
    backgroundColor: 'rgba(20, 33, 58, 0.76)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modeBtnActive: {
    backgroundColor: 'rgba(77,163,255,0.26)',
    borderColor: 'rgba(111,231,255,0.42)',
  },
  modeBtnText: {
    ...canvasText.bodyStrong,
    color: '#EAF6FF',
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
    color: '#EAF6FF',
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
    backgroundColor: '#101b32',
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(145, 204, 255, 0.28)',
    backgroundColor: 'rgba(16, 31, 56, 0.74)',
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  presetChipText: {
    ...canvasText.bodyStrong,
    color: '#EAF6FF',
  },
  sectionTitle: {
    ...canvasText.sectionTitle,
    color: '#EAF6FF',
  },
  input: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(145, 204, 255, 0.26)',
    backgroundColor: 'rgba(14, 29, 54, 0.88)',
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#EAF6FF',
    ...canvasText.body,
  },
  liveDialog: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(145, 204, 255, 0.22)',
    backgroundColor: 'rgba(10, 22, 42, 0.78)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    minHeight: 68,
  },
  liveDialogLabel: {
    ...canvasText.bodyStrong,
    color: 'rgba(234,246,255,0.9)',
  },
  liveDialogText: {
    ...canvasText.body,
    color: 'rgba(234,246,255,0.82)',
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
    color: 'rgba(234,246,255,0.88)',
  },
  sliderValue: {
    ...canvasText.bodyStrong,
    color: '#6FE7FF',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    backgroundColor: '#6FE7FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  primaryBtnText: {
    ...canvasText.bodyStrong,
    color: '#031225',
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(145, 204, 255, 0.3)',
    backgroundColor: 'rgba(16, 31, 56, 0.74)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  secondaryBtnText: {
    ...canvasText.bodyStrong,
    color: '#EAF6FF',
  },
  warnBtn: {
    backgroundColor: '#FFB8C8',
  },
  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(145, 204, 255, 0.2)',
    backgroundColor: 'rgba(9, 20, 37, 0.84)',
    padding: 11,
    gap: 7,
  },
  summaryTitle: {
    ...canvasText.bodyStrong,
    color: '#EAF6FF',
  },
  summaryText: {
    ...canvasText.body,
    color: 'rgba(234,246,255,0.82)',
    lineHeight: 18,
  },
  errorText: {
    ...canvasText.body,
    color: '#FFB8C8',
    lineHeight: 18,
  },
  metaText: {
    ...canvasText.bodyMuted,
    color: 'rgba(180,205,230,0.68)',
  },
});
