import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {Skia} from '@shopify/react-native-skia';
import type {SkImage} from '@shopify/react-native-skia';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import {BasicLightModule} from '../components/colorGrading/BasicLightModule';
import {ColorWheelsModule} from '../components/colorGrading/ColorWheelsModule';
import {ColorBalanceModule} from '../components/colorGrading/ColorBalanceModule';
import {PresetSelector} from '../components/colorGrading/PresetSelector';
import {ToneCurvesModule} from '../components/colorGrading/ToneCurvesModule';
import {GPUBeforeAfterViewer} from '../components/image/GPUBeforeAfterViewer';
import {ImagePickerComponent} from '../components/image/ImagePickerComponent';
import {useImagePicker} from '../hooks/useImagePicker';
import {
  BUILTIN_PRESETS,
  defaultColorGradingParams,
  type ColorGradingParams,
  type ColorPreset,
} from '../types/colorGrading.ts';
import {useVoiceColorGrading} from '../voice/useVoiceColorGrading';
import {buildVoiceImageContext} from '../voice/imageContext';

interface AgentActionResult {
  ok: boolean;
  message: string;
}

export interface GPUColorGradingAgentBridge {
  optimizeCurrentImage: () => Promise<AgentActionResult>;
  resetAll: () => Promise<AgentActionResult>;
  applyPresetById: (presetId: string) => Promise<AgentActionResult>;
  getSnapshot: () => {
    hasImage: boolean;
    selectedPresetId: string;
    voiceState: string;
  };
}

interface GPUColorGradingScreenProps {
  onAgentBridgeReady?: (bridge: GPUColorGradingAgentBridge | null) => void;
  externalApplyParamsRequest?: {
    id: number;
    params: ColorGradingParams;
  } | null;
}

const COLORS = {
  bgStart: '#061426',
  bgMid: '#0A2741',
  bgEnd: '#071B30',
  card: 'rgba(10, 38, 62, 0.92)',
  cardSoft: 'rgba(14, 46, 74, 0.84)',
  border: 'rgba(142, 193, 236, 0.26)',
  textMain: '#e8f3ff',
  textSub: '#a8c8e8',
  textMute: '#84abd0',
  primary: '#79C9FF',
  primaryStrong: '#9AD8FF',
  danger: '#ffb5b5',
  warning: '#ffd6a2',
} as const;

const GPUColorGradingScreen: React.FC<GPUColorGradingScreenProps> = ({
  onAgentBridgeReady,
  externalApplyParamsRequest,
}) => {
  const [params, setParams] = useState<ColorGradingParams>(defaultColorGradingParams);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('preset_original');
  const [showComparison, setShowComparison] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [shaderAvailable, setShaderAvailable] = useState(true);
  const [showVoiceDebug, setShowVoiceDebug] = useState(false);

  const {selectedImage, isLoading, pickFromGallery, pickFromCamera, clearImage} =
    useImagePicker({
      onImageError: error => Alert.alert('图片错误', error),
    });

  const skImage = useMemo<SkImage | null>(() => {
    if (!selectedImage?.success || !selectedImage.base64) {
      return null;
    }

    try {
      const base64String = selectedImage.base64.replace(/^data:image\/\w+;base64,/, '');
      const data = Skia.Data.fromBase64(base64String);
      return data ? Skia.Image.MakeImageFromEncoded(data) : null;
    } catch (error) {
      console.error('Skia image decode failed:', error);
      return null;
    }
  }, [selectedImage?.base64, selectedImage?.success]);

  const voice = useVoiceColorGrading({
    currentParams: params,
    onApplyParams: nextParams => {
      setParams(nextParams);
      setSelectedPresetId('preset_original');
    },
    getImageContext: () => buildVoiceImageContext(selectedImage, skImage),
  });

  const lastVisualKeyRef = useRef('');
  const lastExternalApplyIdRef = useRef<number>(0);
  useEffect(() => {
    if (!selectedImage?.success || !skImage || !selectedImage.base64) {
      lastVisualKeyRef.current = '';
      return;
    }
    const key = `${selectedImage.uri || ''}_${selectedImage.width || 0}_${selectedImage.height || 0}`;
    if (lastVisualKeyRef.current === key) {
      return;
    }
    lastVisualKeyRef.current = key;
    voice.requestInitialVisualSuggestion().catch(error => {
      console.warn('initial visual suggestion failed:', error);
    });
  }, [
    selectedImage?.base64,
    selectedImage?.height,
    selectedImage?.success,
    selectedImage?.uri,
    selectedImage?.width,
    skImage,
    voice,
  ]);

  useEffect(() => {
    if (!externalApplyParamsRequest) {
      return;
    }
    if (lastExternalApplyIdRef.current === externalApplyParamsRequest.id) {
      return;
    }
    lastExternalApplyIdRef.current = externalApplyParamsRequest.id;
    setParams(externalApplyParamsRequest.params);
    setSelectedPresetId('preset_original');
  }, [externalApplyParamsRequest]);

  const handleBasicChange = useCallback(
    (basic: ColorGradingParams['basic']) => {
      setParams(prev => ({...prev, basic}));
      if (selectedPresetId !== 'preset_original') {
        setSelectedPresetId('preset_original');
      }
    },
    [selectedPresetId],
  );

  const handleColorBalanceChange = useCallback(
    (colorBalance: ColorGradingParams['colorBalance']) => {
      setParams(prev => ({...prev, colorBalance}));
      if (selectedPresetId !== 'preset_original') {
        setSelectedPresetId('preset_original');
      }
    },
    [selectedPresetId],
  );

  const handleSelectPreset = useCallback((preset: ColorPreset) => {
    setSelectedPresetId(preset.id);
    setParams(preset.params);
  }, []);

  const handleProCurvesChange = useCallback(
    (curves: ColorGradingParams['pro']['curves']) => {
      setParams(prev => ({...prev, pro: {...prev.pro, curves}}));
      if (selectedPresetId !== 'preset_original') {
        setSelectedPresetId('preset_original');
      }
    },
    [selectedPresetId],
  );

  const handleProWheelsChange = useCallback(
    (wheels: ColorGradingParams['pro']['wheels']) => {
      setParams(prev => ({...prev, pro: {...prev.pro, wheels}}));
      if (selectedPresetId !== 'preset_original') {
        setSelectedPresetId('preset_original');
      }
    },
    [selectedPresetId],
  );

  const handleResetAll = useCallback(() => {
    setParams(defaultColorGradingParams);
    setSelectedPresetId('preset_original');
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedImage?.success || !skImage) {
      Alert.alert('提示', '请先选择一张图片');
      return;
    }

    try {
      setIsSaving(true);
      Alert.alert('保存功能', 'GPU 导出将在下一步接入系统相册。');
    } finally {
      setIsSaving(false);
    }
  }, [selectedImage?.success, skImage]);

  const handleVoiceToggle = useCallback(() => {
    const task = voice.isRecording ? voice.stopPressToTalk() : voice.startPressToTalk();
    task.catch(error => {
      console.warn('voice toggle failed:', error);
    });
  }, [voice]);

  const handleApplyVisualSuggestion = useCallback(async (): Promise<AgentActionResult> => {
    if (!selectedImage?.success || !skImage) {
      return {
        ok: false,
        message: '请先上传图片后再执行首轮视觉建议。',
      };
    }

    try {
      await voice.requestInitialVisualSuggestion();
      return {
        ok: true,
        message: '已完成视觉首轮建议并应用到当前图片。',
      };
    } catch {
      return {
        ok: false,
        message: '视觉建议执行失败，请稍后重试。',
      };
    }
  }, [selectedImage?.success, skImage, voice]);

  const handleApplyPresetById = useCallback(
    async (presetId: string): Promise<AgentActionResult> => {
      const preset = BUILTIN_PRESETS.find(item => item.id === presetId);
      if (!preset) {
        return {ok: false, message: `未找到预设: ${presetId}`};
      }
      handleSelectPreset(preset);
      return {ok: true, message: `已应用预设: ${preset.name}`};
    },
    [handleSelectPreset],
  );

  useEffect(() => {
    if (!onAgentBridgeReady) {
      return;
    }

    onAgentBridgeReady({
      optimizeCurrentImage: handleApplyVisualSuggestion,
      resetAll: async () => {
        handleResetAll();
        return {ok: true, message: '已重置全部调色参数。'};
      },
      applyPresetById: handleApplyPresetById,
      getSnapshot: () => ({
        hasImage: Boolean(selectedImage?.success && skImage),
        selectedPresetId,
        voiceState: voice.state,
      }),
    });

    return () => {
      onAgentBridgeReady(null);
    };
  }, [
    handleApplyPresetById,
    handleApplyVisualSuggestion,
    handleResetAll,
    onAgentBridgeReady,
    selectedImage?.success,
    selectedPresetId,
    skImage,
    voice.state,
  ]);

  return (
    <LinearGradient
      colors={[COLORS.bgStart, COLORS.bgMid, COLORS.bgEnd]}
      style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <View>
            <Text style={styles.headerTitle}>GPU 调色工作台</Text>
            <Text style={styles.headerSubtitle}>单主预览 | 连续语音 | 实时渲染</Text>
          </View>
          <TouchableOpacity style={styles.headerAction} onPress={handleResetAll}>
            <Icon name="refresh-outline" size={16} color={COLORS.primaryStrong} />
            <Text style={styles.headerActionText}>重置参数</Text>
          </TouchableOpacity>
        </View>

        <ImagePickerComponent
          selectedImage={selectedImage}
          isLoading={isLoading}
          onPickFromGallery={pickFromGallery}
          onPickFromCamera={pickFromCamera}
          onClearImage={clearImage}
          compactWhenSelected
        />

        {selectedImage?.success && !skImage ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.loadingText}>正在解码图片...</Text>
          </View>
        ) : null}

        {selectedImage?.success && skImage ? (
          <>
            <View style={styles.viewerHeader}>
              <Text style={styles.viewerTitle}>实时预览</Text>
              <TouchableOpacity
                style={styles.compareButton}
                onPress={() => setShowComparison(v => !v)}>
                <Icon name="layers-outline" size={16} color={COLORS.textMain} />
                <Text style={styles.compareText}>
                  {showComparison ? '关闭对比' : '开启对比'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.viewerCard}>
              <GPUBeforeAfterViewer
                image={skImage}
                params={params}
                showComparison={showComparison}
                onToggleComparison={() => setShowComparison(v => !v)}
                onShaderAvailabilityChange={setShaderAvailable}
              />
            </View>

            {!shaderAvailable ? (
              <View style={styles.shaderWarningCard}>
                <Icon name="warning-outline" size={15} color={COLORS.warning} />
                <Text style={styles.shaderWarningText}>
                  当前设备不支持 Runtime Shader，已回退到基础矩阵模式。进阶参数效果会受限。
                </Text>
              </View>
            ) : null}

            <View style={styles.voiceCard}>
              <View style={styles.voiceHeader}>
                <Text style={styles.voiceTitle}>语音智能调色</Text>
                <Text style={styles.voiceState}>{voice.state}</Text>
              </View>

              <View style={styles.voiceSummaryCard}>
                <Text style={styles.voiceSummaryTitle}>视觉首轮建议</Text>
                <Text style={styles.voiceSummaryMeta}>
                  状态: {voice.visualState}
                  {voice.visualProfile ? ` | 场景: ${voice.visualProfile}` : ''}
                </Text>
                {voice.visualSummary ? (
                  <Text style={styles.voiceSummaryText}>{voice.visualSummary}</Text>
                ) : null}
                {voice.visualApplySummary ? (
                  <Text style={styles.voiceSummaryText}>
                    已应用: {voice.visualApplySummary}
                  </Text>
                ) : null}
              </View>

              <TouchableOpacity
                style={[
                  styles.voiceButton,
                  voice.isRecording && styles.voiceButtonActive,
                ]}
                onPress={handleVoiceToggle}
                activeOpacity={0.78}
                hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
                pressRetentionOffset={{top: 16, bottom: 16, left: 16, right: 16}}
                disabled={voice.state === 'queue_applying'}>
                <Icon
                  name="mic"
                  size={18}
                  color={voice.isRecording ? '#08213a' : COLORS.textMain}
                />
                <Text
                  style={[
                    styles.voiceButtonText,
                    voice.isRecording && styles.voiceButtonTextActive,
                  ]}>
                  {voice.isRecording ? '点击结束并自动叠加' : '在当前建议上继续语音修改'}
                </Text>
              </TouchableOpacity>

              {voice.lastError ? <Text style={styles.voiceError}>{voice.lastError}</Text> : null}

              {voice.lastAppliedSummary ? (
                <View style={styles.voiceSummaryCard}>
                  <Text style={styles.voiceSummaryTitle}>最近一次语音增量</Text>
                  <Text style={styles.voiceSummaryText}>{voice.lastAppliedSummary}</Text>
                </View>
              ) : null}

              <View style={styles.voiceActions}>
                {voice.canUndo ? (
                  <TouchableOpacity style={styles.undoButton} onPress={voice.undoLastApply}>
                    <Icon name="arrow-undo-outline" size={16} color={COLORS.textMain} />
                    <Text style={styles.undoText}>撤销本次应用</Text>
                  </TouchableOpacity>
                ) : null}
                {voice.canUndoSession ? (
                  <TouchableOpacity style={styles.undoButton} onPress={voice.undoSessionApply}>
                    <Icon name="albums-outline" size={16} color={COLORS.textMain} />
                    <Text style={styles.undoText}>撤销本次会话</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <TouchableOpacity
                style={styles.voiceDebugToggle}
                onPress={() => setShowVoiceDebug(v => !v)}>
                <Text style={styles.voiceDebugToggleText}>
                  {showVoiceDebug ? '收起识别调试信息' : '展开识别调试信息'}
                </Text>
                <Icon
                  name={showVoiceDebug ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={COLORS.textSub}
                />
              </TouchableOpacity>

              {showVoiceDebug ? (
                <View style={styles.voiceDebugPanel}>
                  {voice.partialTranscript ? (
                    <Text style={styles.voiceDebugText}>识别中: {voice.partialTranscript}</Text>
                  ) : null}
                  {voice.transcript ? (
                    <Text style={styles.voiceDebugText}>最终文本: {voice.transcript}</Text>
                  ) : (
                    <Text style={styles.voiceDebugText}>暂无识别文本</Text>
                  )}
                </View>
              ) : null}
            </View>

            <View style={styles.blockCard}>
              <Text style={styles.blockTitle}>预设</Text>
              <PresetSelector
                presets={BUILTIN_PRESETS}
                selectedPresetId={selectedPresetId}
                onSelectPreset={handleSelectPreset}
              />
            </View>

            <View style={styles.blockCard}>
              <Text style={styles.blockTitle}>参数调节</Text>
              <BasicLightModule params={params.basic} onChange={handleBasicChange} />
              <ColorBalanceModule
                params={params.colorBalance}
                onChange={handleColorBalanceChange}
              />
              <ToneCurvesModule
                curves={params.pro.curves}
                onChange={handleProCurvesChange}
              />
              <ColorWheelsModule
                wheels={params.pro.wheels}
                onChange={handleProWheelsChange}
              />
            </View>

            <TouchableOpacity
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={isSaving}>
              {isSaving ? (
                <ActivityIndicator size="small" color="#0b2a47" />
              ) : (
                <Icon name="download-outline" size={18} color="#0b2a47" />
              )}
              <Text style={styles.saveButtonText}>{isSaving ? '处理中...' : '导出结果'}</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  headerCard: {
    borderRadius: 15,
    padding: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    color: COLORS.textMain,
    fontSize: 21,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: COLORS.textSub,
    fontSize: 12,
    marginTop: 4,
  },
  headerAction: {
    backgroundColor: 'rgba(23, 79, 122, 0.75)',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(141, 197, 236, 0.32)',
    paddingHorizontal: 11,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerActionText: {
    color: COLORS.primaryStrong,
    fontSize: 12,
    fontWeight: '600',
  },
  loadingCard: {
    marginTop: 8,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardSoft,
  },
  loadingText: {
    color: COLORS.textSub,
    fontSize: 13,
  },
  viewerHeader: {
    marginTop: 10,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewerTitle: {
    color: COLORS.textMain,
    fontSize: 16,
    fontWeight: '700',
  },
  compareButton: {
    borderRadius: 15,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: 'rgba(24, 73, 110, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(156, 208, 246, 0.26)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compareText: {
    color: COLORS.textMain,
    fontSize: 12,
    fontWeight: '600',
  },
  viewerCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#041224',
  },
  shaderWarningCard: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 214, 162, 0.36)',
    backgroundColor: 'rgba(120, 84, 34, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shaderWarningText: {
    color: '#ffe1bc',
    fontSize: 11,
    flex: 1,
  },
  voiceCard: {
    borderRadius: 14,
    marginTop: 10,
    padding: 11,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  voiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voiceTitle: {
    color: COLORS.textMain,
    fontSize: 15,
    fontWeight: '700',
  },
  voiceState: {
    color: COLORS.textMute,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  voiceButton: {
    marginTop: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(153, 206, 246, 0.35)',
    backgroundColor: 'rgba(27, 82, 125, 0.78)',
    paddingVertical: 12,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  voiceButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryStrong,
  },
  voiceButtonText: {
    color: COLORS.textMain,
    fontSize: 13,
    fontWeight: '700',
  },
  voiceButtonTextActive: {
    color: '#08213a',
  },
  voiceError: {
    color: COLORS.danger,
    marginTop: 8,
    fontSize: 12,
  },
  voiceSummaryCard: {
    marginTop: 9,
    borderRadius: 10,
    padding: 9,
    backgroundColor: 'rgba(21, 71, 108, 0.8)',
  },
  voiceSummaryTitle: {
    color: '#d9edff',
    fontSize: 12,
    fontWeight: '700',
  },
  voiceSummaryText: {
    color: '#cae3fa',
    fontSize: 12,
    marginTop: 4,
  },
  voiceSummaryMeta: {
    color: '#9cc7ef',
    fontSize: 11,
    marginTop: 4,
  },
  applySuggestionButton: {
    marginTop: 9,
    borderRadius: 10,
    paddingVertical: 8,
    backgroundColor: '#85d0ff',
    borderWidth: 1,
    borderColor: '#b7e4ff',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  applySuggestionText: {
    color: '#07243f',
    fontSize: 12,
    fontWeight: '800',
  },
  voiceActions: {
    marginTop: 9,
    flexDirection: 'row',
    gap: 8,
  },
  undoButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(24, 70, 106, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(157, 208, 245, 0.34)',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  undoText: {
    color: COLORS.textMain,
    fontSize: 12,
    fontWeight: '700',
  },
  voiceDebugToggle: {
    marginTop: 9,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(147, 198, 237, 0.25)',
    backgroundColor: 'rgba(13, 47, 75, 0.75)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  voiceDebugToggleText: {
    color: COLORS.textSub,
    fontSize: 12,
    fontWeight: '600',
  },
  voiceDebugPanel: {
    marginTop: 7,
    borderRadius: 9,
    padding: 8,
    backgroundColor: 'rgba(8, 31, 53, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(146, 195, 232, 0.22)',
  },
  voiceDebugText: {
    color: '#a8cbeb',
    fontSize: 12,
    marginBottom: 2,
  },
  blockCard: {
    marginTop: 10,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardSoft,
  },
  blockTitle: {
    color: COLORS.textMain,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  saveButton: {
    marginTop: 14,
    borderRadius: 14,
    paddingVertical: 13,
    marginBottom: 6,
    backgroundColor: COLORS.primaryStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#0b2a47',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default GPUColorGradingScreen;
