import React, {Component, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import {
  type AutoGradeStatus,
  defaultHslSecondaryAdjustments,
  type EngineSelectionResult,
  type HslSecondaryAdjustments,
  type IccProfile,
  type Lut3D,
  type LutSlot,
  type LocalMaskLayer,
} from '../types/colorEngine';
import {useAppStore} from '../store/appStore';
import {selectColorEngine} from '../colorEngine/engineSelector';
import {requestSegmentation} from '../colorEngine/segmentationService';
import {composeMaskLayers, summarizeMaskLayers} from '../colorEngine/masks/maskComposer';
import {buildPresetBundle} from '../colorEngine/core/operators';
import {exportGradedResult} from '../colorEngine/exportService';
import {buildFilmicLut, buildIdentityLut} from '../colorEngine/lut/runtime';
import {useVoiceColorGrading} from '../voice/useVoiceColorGrading';
import {buildVoiceImageContext} from '../voice/imageContext';
import {useAutoGradeOrchestrator} from '../colorEngine/autoGradeOrchestrator';
import {LiquidPanel} from '../components/design';
import {
  canTriggerFirstPass,
  createFirstPassGate,
  markFirstPassTriggered,
  openFirstPassGate,
} from '../colorEngine/firstPassGate';
import {
  getCloudRuntimeState,
  subscribeCloudRuntimeState,
  type CloudRuntimeState,
} from '../cloud/endpointResolver';
import {VISION_THEME} from '../theme/visionTheme';

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
  onAssistantSceneEvent?: (event: {
    page: 'capture' | 'editor';
    trigger: 'camera_open' | 'image_imported';
  }) => void;
  externalApplyParamsRequest?: {
    id: number;
    params: ColorGradingParams;
  } | null;
  externalImportRequest?: {
    id: number;
    source?: 'gallery' | 'camera';
  } | null;
}

const isWorkletsRuntimeError = (error: unknown): boolean => {
  if (!error) {
    return false;
  }
  const message = String((error as {message?: string}).message ?? error);
  return (
    message.includes('runOnUI can only be used with worklets') ||
    message.includes('`runOnUI` can only be used with worklets') ||
    message.includes('Should not already be working')
  );
};

const fallbackReasonLabel = (reason?: string): string => {
  switch (reason) {
    case 'timeout':
      return '请求超时';
    case 'host_unreachable':
      return '主机不可达';
    case 'http_5xx':
      return '服务 5xx';
    case 'model_unavailable':
      return '模型不可用';
    case 'bad_payload':
      return '返回格式异常';
    case 'dns_error':
      return 'DNS 解析失败';
    case 'auth_error':
      return '鉴权失败';
    case 'unknown':
      return '未知异常';
    default:
      return '云端可用';
  }
};

const cloudStateLabel = (state: string): string => {
  switch (state) {
    case 'healthy':
      return '可用';
    case 'degraded':
      return '降级';
    case 'offline':
      return '离线';
    default:
      return state;
  }
};

const recoveryActionLabel = (action?: string): string => {
  switch (action) {
    case 'retry_with_backoff':
      return '指数退避重试中';
    case 'verify_adb_reverse_or_lan_host':
      return '检查 adb reverse/局域网地址';
    case 'check_dns_or_hostname':
      return '检查 DNS 与主机名';
    case 'check_model_api_credentials':
      return '检查模型密钥与权限';
    case 'wait_or_switch_backup_model':
      return '切换备选模型并重试';
    case 'check_model_catalog_or_id':
      return '检查模型 ID 与可用性';
    case 'check_backend_payload_schema':
      return '检查后端返回结构';
    default:
      return '后台探活，恢复后自动回切';
  }
};

const autoGradeStatusLabel = (status: AutoGradeStatus): string => {
  switch (status) {
    case 'idle':
      return '待执行';
    case 'analyzing':
      return '分析中';
    case 'refining':
      return 'Refine 中';
    case 'applying':
      return '应用中';
    case 'completed':
      return '已完成';
    case 'degraded':
      return '降级完成';
    case 'failed':
      return '失败';
    default:
      return status;
  }
};

interface ViewerErrorBoundaryProps {
  children: React.ReactNode;
  resetKey: string;
  onRuntimeError: (error: unknown) => void;
}

interface ViewerErrorBoundaryState {
  hasError: boolean;
}

class ViewerErrorBoundary extends Component<ViewerErrorBoundaryProps, ViewerErrorBoundaryState> {
  state: ViewerErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ViewerErrorBoundaryState {
    return {hasError: true};
  }

  componentDidCatch(error: unknown): void {
    this.props.onRuntimeError(error);
  }

  componentDidUpdate(prevProps: ViewerErrorBoundaryProps): void {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({hasError: false});
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

const COLORS = {
  bgStart: VISION_THEME.gradients.page[0],
  bgMid: VISION_THEME.gradients.page[1],
  bgEnd: VISION_THEME.gradients.page[2],
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
  onAssistantSceneEvent,
  externalApplyParamsRequest,
  externalImportRequest,
}) => {
  const [params, setParams] = useState<ColorGradingParams>(defaultColorGradingParams);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('preset_original');
  const [showComparison, setShowComparison] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [shaderAvailable, setShaderAvailable] = useState(true);
  const [showVoiceDebug, setShowVoiceDebug] = useState(false);
  const [manualVoiceCommand, setManualVoiceCommand] = useState('');
  const [isApplyingManualVoiceCommand, setIsApplyingManualVoiceCommand] = useState(false);
  const [engineSelection, setEngineSelection] = useState<EngineSelectionResult | null>(null);
  const [workletsRuntimeUnavailable, setWorkletsRuntimeUnavailable] = useState(false);
  const [localMasks, setLocalMasks] = useState<LocalMaskLayer[]>([]);
  const [hslAdjustments] = useState<HslSecondaryAdjustments>(defaultHslSecondaryAdjustments());
  const lutLibrary = useMemo<Record<string, Lut3D>>(
    () => ({
      lut_identity_16: buildIdentityLut(16, 'lut_identity_16', 'Identity 16'),
      lut_filmic_soft_16: buildFilmicLut(16, 'lut_filmic_soft_16', 'Filmic Soft 16'),
    }),
    [],
  );
  const [activeLut, setActiveLut] = useState<LutSlot | null>(null);
  const [isSegmenting, setIsSegmenting] = useState(false);
  const [segmentationSummary, setSegmentationSummary] = useState('未启用 AI 局部调色');
  const [segmentationStatusMeta, setSegmentationStatusMeta] = useState('');
  const [cloudRuntimeState, setCloudRuntimeState] = useState<CloudRuntimeState>(
    getCloudRuntimeState(),
  );
  const [lastExportSummary, setLastExportSummary] = useState('');
  const viewerRef = useRef<View | null>(null);
  const lastAutoSegmentImageRef = useRef('');

  const colorEngineMode = useAppStore(state => state.colorEngineMode);
  const preferredWorkingSpace = useAppStore(state => state.preferredWorkingSpace);
  const resolvedColorEngineMode = useAppStore(state => state.resolvedColorEngineMode);
  const setResolvedColorEngineMode = useAppStore(state => state.setResolvedColorEngineMode);
  const setPreferredWorkingSpace = useAppStore(state => state.setPreferredWorkingSpace);
  const setColorEngineMode = useAppStore(state => state.setColorEngineMode);
  const setLastColorEngineFallbackReason = useAppStore(
    state => state.setLastColorEngineFallbackReason,
  );

  const {selectedImage, isLoading, pickFromGallery, pickFromCamera, clearImage} =
    useImagePicker({
      onImageError: error => Alert.alert('图片错误', error),
    });
  const lastImportRequestIdRef = useRef<number>(0);

  useEffect(() => {
    if (!externalImportRequest?.id || externalImportRequest.id === lastImportRequestIdRef.current) {
      return;
    }
    lastImportRequestIdRef.current = externalImportRequest.id;
    onAssistantSceneEvent?.({
      page: 'capture',
      trigger: 'camera_open',
    });
    const runner =
      externalImportRequest.source === 'camera' ? pickFromCamera : pickFromGallery;
    runner().catch(() => undefined);
  }, [externalImportRequest, onAssistantSceneEvent, pickFromCamera, pickFromGallery]);

  useEffect(() => {
    if (!selectedImage?.success) {
      return;
    }
    onAssistantSceneEvent?.({
      page: 'editor',
      trigger: 'image_imported',
    });
  }, [onAssistantSceneEvent, selectedImage?.success]);

  useEffect(() => {
    const unsubscribe = subscribeCloudRuntimeState(setCloudRuntimeState);
    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const resolveEngine = async () => {
      const selection = await selectColorEngine({
        preferredMode: colorEngineMode,
        preferredWorkingSpace,
        image: selectedImage,
      });

      if (cancelled) {
        return;
      }

      setEngineSelection(selection);
      setResolvedColorEngineMode(selection.resolvedMode);
      if (selection.workingSpace !== preferredWorkingSpace) {
        setPreferredWorkingSpace(selection.workingSpace);
      }
      setLastColorEngineFallbackReason(selection.diagnostics.fallbackReason || null);
    };

    resolveEngine().catch(error => {
      console.warn('resolve engine failed:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [
    colorEngineMode,
    preferredWorkingSpace,
    selectedImage,
    setLastColorEngineFallbackReason,
    setPreferredWorkingSpace,
    setResolvedColorEngineMode,
  ]);

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
  const resetVoiceSession = voice.resetVoiceSession;

  const autoGrade = useAutoGradeOrchestrator({
    onApply: (nextParams, nextMasks) => {
      setParams(nextParams);
      setLocalMasks(nextMasks);
      setSelectedPresetId('preset_original');
      setSegmentationSummary(`AI 蒙版已就绪: ${summarizeMaskLayers(nextMasks)}`);
    },
  });
  const resetAutoGradeState = autoGrade.resetAutoGradeState;

  const firstPassGateRef = useRef(createFirstPassGate());
  const lastImageSessionKeyRef = useRef('');
  const skipAutoGradeForImageKeyRef = useRef('');
  const lastExternalApplyIdRef = useRef<number>(0);
  const currentImageSessionKey = useMemo(() => {
    if (!selectedImage?.success) {
      return '';
    }
    return `${selectedImage.uri || ''}_${selectedImage.width || 0}_${selectedImage.height || 0}`;
  }, [selectedImage?.height, selectedImage?.success, selectedImage?.uri, selectedImage?.width]);

  useEffect(() => {
    if (!selectedImage?.success) {
      lastImageSessionKeyRef.current = '';
      skipAutoGradeForImageKeyRef.current = '';
      openFirstPassGate(firstPassGateRef.current, '');
      return;
    }
    if (lastImageSessionKeyRef.current === currentImageSessionKey) {
      return;
    }

    const hasPreviousImage = lastImageSessionKeyRef.current.length > 0;
    lastImageSessionKeyRef.current = currentImageSessionKey;
    openFirstPassGate(firstPassGateRef.current, currentImageSessionKey);
    lastAutoSegmentImageRef.current = '';
    resetVoiceSession().catch(() => undefined);

    if (!hasPreviousImage) {
      return;
    }

    skipAutoGradeForImageKeyRef.current = currentImageSessionKey;
    setParams(defaultColorGradingParams);
    setSelectedPresetId('preset_original');
    setLocalMasks([]);
    setActiveLut(null);
    setSegmentationSummary('未启用 AI 局部调色');
    setSegmentationStatusMeta('');
    setLastExportSummary('');
    resetAutoGradeState();
  }, [currentImageSessionKey, resetAutoGradeState, resetVoiceSession, selectedImage?.success]);

  useEffect(() => {
    if (selectedImage?.success) {
      return;
    }
    setWorkletsRuntimeUnavailable(false);
    setLocalMasks([]);
    setActiveLut(null);
    setSegmentationSummary('未启用 AI 局部调色');
    setSegmentationStatusMeta('');
    setLastExportSummary('');
    lastAutoSegmentImageRef.current = '';
    resetAutoGradeState();
    resetVoiceSession().catch(() => undefined);
    openFirstPassGate(firstPassGateRef.current, '');
  }, [resetAutoGradeState, resetVoiceSession, selectedImage?.success]);

  useEffect(() => {
    if (!workletsRuntimeUnavailable) {
      return;
    }
    setResolvedColorEngineMode('legacy');
    setLastColorEngineFallbackReason('worklets_runtime_unavailable');
    setShaderAvailable(false);
  }, [
    setLastColorEngineFallbackReason,
    setResolvedColorEngineMode,
    workletsRuntimeUnavailable,
  ]);

  const effectiveEngineMode = workletsRuntimeUnavailable ? 'legacy' : resolvedColorEngineMode;

  useEffect(() => {
    console.log(
      '[cloud-runtime]',
      JSON.stringify({
        phase: cloudRuntimeState.phase || '',
        cloudState: cloudRuntimeState.cloudState,
        fallbackReason: cloudRuntimeState.fallbackReason || '',
        fallbackUsed: cloudRuntimeState.cloudState !== 'healthy',
        endpoint: cloudRuntimeState.endpoint || '',
        lockedEndpoint: cloudRuntimeState.lockedEndpoint || '',
        latencyMs: cloudRuntimeState.latencyMs,
        retrying: cloudRuntimeState.retrying,
        nextRecoveryAction: cloudRuntimeState.nextRecoveryAction,
        resolvedEngineMode: effectiveEngineMode,
      }),
    );
  }, [cloudRuntimeState, effectiveEngineMode]);

  const handleViewerRuntimeError = useCallback(
    (error: unknown) => {
      if (!isWorkletsRuntimeError(error)) {
        return;
      }
      console.warn('worklets runtime unavailable, forcing legacy preview mode:', error);
      setWorkletsRuntimeUnavailable(true);
    },
    [],
  );

  const fallbackPreviewUri = useMemo(() => {
    if (!selectedImage?.success) {
      return '';
    }
    if (selectedImage.base64) {
      if (selectedImage.base64.startsWith('data:image/')) {
        return selectedImage.base64;
      }
      const mime = selectedImage.type || 'image/jpeg';
      return `data:${mime};base64,${selectedImage.base64}`;
    }
    return selectedImage.uri || '';
  }, [selectedImage]);

  useEffect(() => {
    if (!selectedImage?.success || !skImage || !selectedImage.base64 || !currentImageSessionKey) {
      openFirstPassGate(firstPassGateRef.current, '');
      return;
    }
    if (skipAutoGradeForImageKeyRef.current === currentImageSessionKey) {
      skipAutoGradeForImageKeyRef.current = '';
      return;
    }
    if (!canTriggerFirstPass(firstPassGateRef.current, currentImageSessionKey)) {
      return;
    }
    const imageContext = buildVoiceImageContext(selectedImage, skImage);
    if (!imageContext) {
      return;
    }
    markFirstPassTriggered(firstPassGateRef.current, currentImageSessionKey);
    autoGrade
      .runAutoGrade({
        image: selectedImage,
        imageContext,
        currentParams: params,
        currentMasks: localMasks,
        locale: 'zh-CN',
      })
      .catch(error => {
        console.warn('auto grade failed:', error);
      });
  }, [
    autoGrade,
    localMasks,
    params,
    currentImageSessionKey,
    selectedImage,
    skImage,
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

  const handleRunSegmentation = useCallback(async () => {
    if (!selectedImage?.success) {
      Alert.alert('提示', '请先选择一张图片');
      return;
    }

    setIsSegmenting(true);
    try {
      const result = await requestSegmentation({image: selectedImage});
      const nextMasks = composeMaskLayers(result, localMasks);
      setLocalMasks(nextMasks);
      setSegmentationSummary(
        result.fallbackUsed
          ? `局部分割已降级: ${summarizeMaskLayers(nextMasks)}`
          : `AI 蒙版已就绪: ${summarizeMaskLayers(nextMasks)}`,
      );
      setSegmentationStatusMeta(
        `云端: ${cloudStateLabel(result.cloudState)} | 原因: ${fallbackReasonLabel(
          result.fallbackReason,
        )} | 恢复: ${recoveryActionLabel(result.nextRecoveryAction)}`,
      );
    } catch (error) {
      console.warn('segmentation failed:', error);
      const fallback = composeMaskLayers(null, localMasks);
      setLocalMasks(fallback);
      setSegmentationSummary(`局部分割异常，已保留手动画笔: ${summarizeMaskLayers(fallback)}`);
      setSegmentationStatusMeta('云端: 离线 | 原因: 未知异常 | 恢复: 后台探活，恢复后自动回切');
    } finally {
      setIsSegmenting(false);
    }
  }, [localMasks, selectedImage]);

  useEffect(() => {
    if (!selectedImage?.success || effectiveEngineMode !== 'pro') {
      return;
    }

    const imageKey = `${selectedImage.uri || ''}_${selectedImage.width || 0}_${selectedImage.height || 0}`;
    if (!imageKey || lastAutoSegmentImageRef.current === imageKey) {
      return;
    }

    lastAutoSegmentImageRef.current = imageKey;
    handleRunSegmentation().catch(error => {
      console.warn('auto segmentation failed:', error);
    });
  }, [effectiveEngineMode, handleRunSegmentation, selectedImage]);

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
    setLocalMasks([]);
    setActiveLut(null);
    setSegmentationSummary('未启用 AI 局部调色');
    setSegmentationStatusMeta('');
    setLastExportSummary('');
    lastAutoSegmentImageRef.current = '';
    autoGrade.resetAutoGradeState();
    resetVoiceSession().catch(() => undefined);
  }, [autoGrade, resetVoiceSession]);

  const handleSave = useCallback(async () => {
    if (!selectedImage?.success || !skImage || !viewerRef.current) {
      Alert.alert('提示', '请先选择一张图片');
      return;
    }

    try {
      setIsSaving(true);
      const exportSpec =
        effectiveEngineMode === 'pro' || selectedImage.isRaw
          ? {
              format: 'png16' as const,
              bitDepth: 16 as const,
              iccProfile: (
                engineSelection?.workingSpace === 'linear_prophoto' ? 'display_p3' : 'srgb'
              ) as IccProfile,
              sourcePolicy: 'original_only' as const,
              quality: 1,
            }
          : {
              format: 'jpeg' as const,
              bitDepth: 8 as const,
              iccProfile: 'srgb' as const,
              sourcePolicy: 'allow_fallback' as const,
              quality: 0.94,
            };

      const result = await exportGradedResult({
        targetRef: viewerRef,
        spec: exportSpec,
        metadata: {
          engineMode: effectiveEngineMode,
          workingSpace: engineSelection?.workingSpace,
          sourceUri: selectedImage.uri,
          nativeSourcePath: selectedImage.nativeSourcePath,
          isRawSource: selectedImage.isRaw,
        },
        params,
        hsl: hslAdjustments,
        lut: activeLut,
        lutData: activeLut ? lutLibrary[activeLut.lutId] || null : null,
        localMasks,
      });

      const warningText = result.warnings.length > 0 ? `\n${result.warnings.join('\n')}` : '';
      const summary = `${result.spec.format} / ${result.spec.bitDepth}-bit / ${result.spec.iccProfile}`;
      const saveSummary = result.savedToGallery ? '已保存到相册' : '相册保存失败，文件保留在临时目录';
      const locationText = result.savedToGallery
        ? `相册 URI:\n${result.galleryUri || '系统图库路径'}`
        : `临时文件:\n${result.uri}`;
      setLastExportSummary(`${summary} | ${saveSummary}`);
      Alert.alert('导出完成', `${saveSummary}\n${locationText}\n${summary}${warningText}`);
    } catch (error) {
      Alert.alert(
        '导出失败',
        error instanceof Error ? error.message : '导出流程异常，请稍后重试。',
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    activeLut,
    effectiveEngineMode,
    engineSelection?.workingSpace,
    hslAdjustments,
    localMasks,
    lutLibrary,
    params,
    selectedImage,
    skImage,
  ]);

  const handleVoiceToggle = useCallback(() => {
    const task = voice.isRecording ? voice.stopPressToTalk() : voice.startPressToTalk();
    task.catch(error => {
      console.warn('voice toggle failed:', error);
    });
  }, [voice]);

  const handleApplyManualVoiceCommand = useCallback(async () => {
    const command = manualVoiceCommand.trim();
    if (!command) {
      return;
    }

    setIsApplyingManualVoiceCommand(true);
    try {
      await voice.applyTextCommand(command);
      setManualVoiceCommand('');
    } finally {
      setIsApplyingManualVoiceCommand(false);
    }
  }, [manualVoiceCommand, voice]);

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

  const activePresetBundle = useMemo(
    () => buildPresetBundle(params, localMasks),
    [localMasks, params],
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
        <LiquidPanel style={styles.headerCard}>
          <View>
            <Text style={styles.headerTitle}>GPU 调色工作台</Text>
            <Text style={styles.headerSubtitle}>单主预览 | 连续语音 | 实时渲染</Text>
          </View>
          <TouchableOpacity style={styles.headerAction} onPress={handleResetAll}>
            <Icon name="refresh-outline" size={16} color={COLORS.primaryStrong} />
            <Text style={styles.headerActionText}>重置参数</Text>
          </TouchableOpacity>
        </LiquidPanel>

        <LiquidPanel style={styles.engineCard}>
          <View style={styles.engineRow}>
            <View>
              <Text style={styles.engineTitle}>Pro Engine 灰度</Text>
              <Text style={styles.engineMeta}>
                当前: {effectiveEngineMode.toUpperCase()} | 工作空间:{' '}
                {engineSelection?.workingSpace || preferredWorkingSpace}
              </Text>
            </View>
            <View style={styles.engineModeGroup}>
              {(['auto', 'pro', 'legacy'] as const).map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.engineModeButton,
                    colorEngineMode === mode && styles.engineModeButtonActive,
                  ]}
                  onPress={() => setColorEngineMode(mode)}>
                  <Text
                    style={[
                      styles.engineModeButtonText,
                      colorEngineMode === mode && styles.engineModeButtonTextActive,
                    ]}>
                    {mode}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <Text style={styles.engineMeta}>
            预览预算: {engineSelection?.diagnostics.maxPreviewDimension || 0}px | 推荐导出:{' '}
            {engineSelection?.diagnostics.recommendedExportFormat || 'png16'}
          </Text>
          {engineSelection?.diagnostics.fallbackReason ? (
            <Text style={styles.engineWarning}>
              自动降级原因: {engineSelection.diagnostics.fallbackReason}
            </Text>
          ) : null}
        </LiquidPanel>

        <LiquidPanel style={styles.cloudStatusCard}>
          <View style={styles.cloudStatusHeader}>
            <Text style={styles.cloudStatusTitle}>云端状态</Text>
            <Text
              style={[
                styles.cloudStatusBadge,
                cloudRuntimeState.cloudState === 'healthy'
                  ? styles.cloudStatusHealthy
                  : styles.cloudStatusFallback,
              ]}>
              {cloudStateLabel(cloudRuntimeState.cloudState)}
            </Text>
          </View>
          <Text style={styles.cloudStatusMeta}>
            原因: {fallbackReasonLabel(cloudRuntimeState.fallbackReason)}
          </Text>
          <Text style={styles.cloudStatusMeta}>
            动作: {recoveryActionLabel(cloudRuntimeState.nextRecoveryAction)}
          </Text>
          <Text style={styles.cloudStatusMeta}>
            重试: {cloudRuntimeState.retrying ? '是' : '否'} | 延迟: {cloudRuntimeState.latencyMs}ms
          </Text>
          <Text style={styles.cloudStatusMeta}>
            端点: {cloudRuntimeState.endpoint || '未命中'}
          </Text>
        </LiquidPanel>

        <LiquidPanel style={styles.autoGradeCard}>
          <View style={styles.autoGradeHeader}>
            <Text style={styles.autoGradeTitle}>上传首版智能调色</Text>
            <Text
              style={[
                styles.autoGradeBadge,
                autoGrade.status === 'completed'
                  ? styles.autoGradeBadgeDone
                  : autoGrade.status === 'degraded'
                    ? styles.autoGradeBadgeDegraded
                    : styles.autoGradeBadgePending,
              ]}>
              {autoGradeStatusLabel(autoGrade.status)}
            </Text>
          </View>
              <Text style={styles.autoGradeMeta}>
                首次应用: {autoGrade.firstAutoGradeAppliedAt || '尚未完成'}
              </Text>
              {autoGrade.report ? (
                <>
                  <Text style={styles.autoGradeMeta}>
                    阶段: {autoGrade.report.phase === 'refine' ? 'refine' : 'fast'}
                  </Text>
                  <Text style={styles.autoGradeMeta}>场景: {autoGrade.report.sceneProfile}</Text>
                  <Text style={styles.autoGradeMeta}>
                    风险: {autoGrade.report.qualityRiskFlags.join(', ') || '无'}
                  </Text>
                  <Text style={styles.autoGradeMeta}>
                    解释: {autoGrade.report.explanation}
                  </Text>
                  <Text style={styles.autoGradeMeta}>
                    云端: {cloudStateLabel(autoGrade.report.cloudState)} | 原因:{' '}
                    {fallbackReasonLabel(autoGrade.report.fallbackReason)}
                  </Text>
                  <Text style={styles.autoGradeMeta}>
                    refine: {autoGrade.report.refineApplied ? '已自动叠加' : '未叠加'}
                    {autoGrade.report.refineFallbackReason
                      ? ` | 原因: ${fallbackReasonLabel(autoGrade.report.refineFallbackReason)}`
                      : ''}
                  </Text>
                  <Text style={styles.autoGradeMeta}>
                    恢复: {recoveryActionLabel(autoGrade.report.nextRecoveryAction)} | 延迟:{' '}
                    {autoGrade.report.latencyMs}ms
                  </Text>
                  <Text style={styles.autoGradeMeta}>
                    超时/预算: {autoGrade.report.phaseTimeoutMs || 0} /{' '}
                    {autoGrade.report.phaseBudgetMs || 0} ms | payload:{' '}
                    {autoGrade.report.payloadBytes || 0} bytes | quality:{' '}
                    {autoGrade.report.encodeQuality || 0}
                  </Text>
                  <Text style={styles.autoGradeMeta}>
                    端点: {autoGrade.report.endpoint || 'N/A'}
                    {autoGrade.report.lockedEndpoint
                      ? ` | 锁定: ${autoGrade.report.lockedEndpoint}`
                      : ''}
                  </Text>
                </>
              ) : (
                <Text style={styles.autoGradeMeta}>上传后将自动分析并应用首版建议。</Text>
              )}
          {autoGrade.firstAutoGradeUndoToken ? (
            <TouchableOpacity
              style={styles.autoGradeUndoButton}
              onPress={() => {
                const undone = autoGrade.undoFirstAutoGrade();
                if (undone) {
                  setSegmentationSummary('已撤销首版自动调色，恢复上传初始状态');
                }
              }}>
              <Icon name="arrow-undo-outline" size={16} color={COLORS.textMain} />
              <Text style={styles.autoGradeUndoText}>撤销首版自动调色</Text>
            </TouchableOpacity>
          ) : null}
        </LiquidPanel>

        <ImagePickerComponent
          selectedImage={selectedImage}
          isLoading={isLoading}
          onPickFromGallery={pickFromGallery}
          onPickFromCamera={pickFromCamera}
          onClearImage={clearImage}
          compactWhenSelected
        />

        {selectedImage?.success && !skImage ? (
          <LiquidPanel style={styles.loadingCard}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.loadingText}>正在解码图片...</Text>
          </LiquidPanel>
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

            <LiquidPanel style={styles.viewerCard}>
              <View ref={viewerRef}>
              {workletsRuntimeUnavailable && fallbackPreviewUri ? (
                <View style={styles.runtimeFallbackViewer}>
                  <Image
                    source={{uri: fallbackPreviewUri}}
                    resizeMode="contain"
                    style={styles.runtimeFallbackImage}
                  />
                </View>
              ) : (
                <ViewerErrorBoundary
                  resetKey={`${selectedImage?.uri || ''}_${effectiveEngineMode}`}
                  onRuntimeError={handleViewerRuntimeError}>
                  <GPUBeforeAfterViewer
                    image={skImage}
                    params={params}
                    showComparison={showComparison}
                    onToggleComparison={() => setShowComparison(v => !v)}
                    onShaderAvailabilityChange={setShaderAvailable}
                    engineMode={effectiveEngineMode}
                    localMasks={localMasks}
                    hsl={hslAdjustments}
                    lut={activeLut}
                    lutLibrary={lutLibrary}
                  />
                </ViewerErrorBoundary>
              )}
              </View>
            </LiquidPanel>

            <LiquidPanel style={styles.blockCard}>
              <Text style={styles.blockTitle}>LUT 风格</Text>
              <View style={styles.engineModeGroup}>
                <TouchableOpacity
                  style={[
                    styles.engineModeButton,
                    !activeLut && styles.engineModeButtonActive,
                  ]}
                  onPress={() => setActiveLut(null)}>
                  <Text
                    style={[
                      styles.engineModeButtonText,
                      !activeLut && styles.engineModeButtonTextActive,
                    ]}>
                    OFF
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.engineModeButton,
                    activeLut?.lutId === 'lut_filmic_soft_16' &&
                      styles.engineModeButtonActive,
                  ]}
                  onPress={() =>
                    setActiveLut({
                      enabled: true,
                      lutId: 'lut_filmic_soft_16',
                      strength: 0.38,
                    })
                  }>
                  <Text
                    style={[
                      styles.engineModeButtonText,
                      activeLut?.lutId === 'lut_filmic_soft_16' &&
                        styles.engineModeButtonTextActive,
                    ]}>
                    FILMIC
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.engineModeButton,
                    activeLut?.lutId === 'lut_identity_16' &&
                      styles.engineModeButtonActive,
                  ]}
                  onPress={() =>
                    setActiveLut({
                      enabled: true,
                      lutId: 'lut_identity_16',
                      strength: 1,
                    })
                  }>
                  <Text
                    style={[
                      styles.engineModeButtonText,
                      activeLut?.lutId === 'lut_identity_16' &&
                        styles.engineModeButtonTextActive,
                    ]}>
                    IDENTITY
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.engineMeta}>
                当前: {activeLut ? `${activeLut.lutId} (${Math.round(activeLut.strength * 100)}%)` : '未启用'}
              </Text>
            </LiquidPanel>

            {!shaderAvailable ? (
              <LiquidPanel style={styles.shaderWarningCard}>
                <Icon name="warning-outline" size={15} color={COLORS.warning} />
                <Text style={styles.shaderWarningText}>
                  {workletsRuntimeUnavailable
                    ? 'Worklets 运行时不可用，已自动降级到 legacy 预览链路。'
                    : '当前设备不支持 Runtime Shader，已回退到基础矩阵模式。进阶参数效果会受限。'}
                </Text>
              </LiquidPanel>
            ) : null}

            <LiquidPanel style={styles.blockCard}>
              <View style={styles.localMaskHeader}>
                <Text style={styles.blockTitle}>AI 局部调色</Text>
                <TouchableOpacity
                  style={[
                    styles.localMaskButton,
                    isSegmenting && styles.localMaskButtonDisabled,
                  ]}
                  onPress={handleRunSegmentation}
                  disabled={isSegmenting}>
                  <Text style={styles.localMaskButtonText}>
                    {isSegmenting ? '分析中...' : '刷新蒙版'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.localMaskSummary}>{segmentationSummary}</Text>
              <Text style={styles.localMaskMeta}>
                蒙版数: {localMasks.length} | 预设版本: {activePresetBundle.metadata.version}
              </Text>
              {segmentationStatusMeta ? (
                <Text style={styles.localMaskStatusMeta}>{segmentationStatusMeta}</Text>
              ) : null}
            </LiquidPanel>

            <LiquidPanel style={styles.voiceCard}>
              <View style={styles.voiceHeader}>
                <Text style={styles.voiceTitle}>语音智能调色</Text>
                <Text style={styles.voiceState}>{voice.state}</Text>
              </View>

              <LiquidPanel style={styles.voiceSummaryCard}>
                <Text style={styles.voiceSummaryTitle}>视觉首轮建议</Text>
                <Text style={styles.voiceSummaryMeta}>
                  状态: {voice.visualState}
                  {voice.visualProfile ? ` | 场景: ${voice.visualProfile}` : ''}
                </Text>
                <Text style={styles.voiceSummaryMeta}>
                  云端: {cloudStateLabel(voice.cloudState)} | 原因:{' '}
                  {fallbackReasonLabel(voice.fallbackReason)}
                </Text>
                <Text style={styles.voiceSummaryMeta}>
                  恢复: {recoveryActionLabel(voice.nextRecoveryAction)}
                </Text>
                <Text style={styles.voiceSummaryMeta}>
                  延迟: {voice.cloudLatencyMs}ms | 自动重试: {voice.cloudRetrying ? '是' : '否'}
                </Text>
                {voice.visualSummary ? (
                  <Text style={styles.voiceSummaryText}>{voice.visualSummary}</Text>
                ) : null}
                {voice.visualApplySummary ? (
                  <Text style={styles.voiceSummaryText}>
                    已应用: {voice.visualApplySummary}
                  </Text>
                ) : null}
              </LiquidPanel>

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

              {voice.cloudState !== 'healthy' ? (
                <LiquidPanel style={styles.textFallbackCard}>
                  <Text style={styles.textFallbackTitle}>语音网络不稳定时，改用文本命令</Text>
                  <TextInput
                    style={styles.textFallbackInput}
                    value={manualVoiceCommand}
                    onChangeText={setManualVoiceCommand}
                    placeholder="例如：亮一点，对比增强，肤色自然"
                    placeholderTextColor="#8cb0cf"
                    editable={!isApplyingManualVoiceCommand}
                  />
                  <TouchableOpacity
                    style={[
                      styles.textFallbackButton,
                      (isApplyingManualVoiceCommand || !manualVoiceCommand.trim()) &&
                        styles.textFallbackButtonDisabled,
                    ]}
                    onPress={handleApplyManualVoiceCommand}
                    disabled={isApplyingManualVoiceCommand || !manualVoiceCommand.trim()}>
                    <Text style={styles.textFallbackButtonText}>
                      {isApplyingManualVoiceCommand ? '应用中...' : '应用文本命令'}
                    </Text>
                  </TouchableOpacity>
                </LiquidPanel>
              ) : null}

              {voice.lastAppliedSummary ? (
                <LiquidPanel style={styles.voiceSummaryCard}>
                  <Text style={styles.voiceSummaryTitle}>最近一次语音增量</Text>
                  <Text style={styles.voiceSummaryText}>{voice.lastAppliedSummary}</Text>
                </LiquidPanel>
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
            </LiquidPanel>

            <LiquidPanel style={styles.blockCard}>
              <Text style={styles.blockTitle}>预设</Text>
              <PresetSelector
                presets={BUILTIN_PRESETS}
                selectedPresetId={selectedPresetId}
                onSelectPreset={handleSelectPreset}
              />
            </LiquidPanel>

            <LiquidPanel style={styles.blockCard}>
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
            </LiquidPanel>

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

            {lastExportSummary ? (
              <LiquidPanel style={styles.exportSummaryCard}>
                <Text style={styles.exportSummaryText}>最近导出: {lastExportSummary}</Text>
              </LiquidPanel>
            ) : null}
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
  engineCard: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    backgroundColor: 'rgba(9, 34, 56, 0.92)',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  engineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  engineTitle: {
    color: COLORS.textMain,
    fontSize: 15,
    fontWeight: '700',
  },
  engineMeta: {
    color: COLORS.textSub,
    fontSize: 12,
    marginTop: 3,
  },
  engineWarning: {
    color: COLORS.warning,
    fontSize: 11,
  },
  cloudStatusCard: {
    marginTop: 8,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardSoft,
  },
  cloudStatusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cloudStatusTitle: {
    color: COLORS.textMain,
    fontSize: 14,
    fontWeight: '700',
  },
  cloudStatusBadge: {
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9,
  },
  cloudStatusHealthy: {
    backgroundColor: 'rgba(112, 208, 162, 0.24)',
    color: '#9af0cb',
  },
  cloudStatusFallback: {
    backgroundColor: 'rgba(255, 214, 162, 0.24)',
    color: '#ffe1bc',
  },
  cloudStatusMeta: {
    color: COLORS.textSub,
    fontSize: 11,
    marginTop: 3,
  },
  autoGradeCard: {
    marginTop: 8,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardSoft,
  },
  autoGradeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  autoGradeTitle: {
    color: COLORS.textMain,
    fontSize: 14,
    fontWeight: '700',
  },
  autoGradeBadge: {
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '800',
  },
  autoGradeBadgeDone: {
    backgroundColor: 'rgba(117, 216, 174, 0.24)',
    color: '#a8f7d2',
  },
  autoGradeBadgeDegraded: {
    backgroundColor: 'rgba(255, 214, 162, 0.24)',
    color: '#ffe4c0',
  },
  autoGradeBadgePending: {
    backgroundColor: 'rgba(151, 203, 245, 0.24)',
    color: '#d7ecff',
  },
  autoGradeMeta: {
    color: COLORS.textSub,
    fontSize: 11,
    marginTop: 4,
  },
  autoGradeUndoButton: {
    marginTop: 8,
    borderRadius: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(157, 208, 245, 0.34)',
    backgroundColor: 'rgba(24, 70, 106, 0.85)',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  autoGradeUndoText: {
    color: COLORS.textMain,
    fontSize: 12,
    fontWeight: '700',
  },
  engineModeGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  engineModeButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(141, 197, 236, 0.24)',
    backgroundColor: 'rgba(18, 60, 92, 0.74)',
  },
  engineModeButtonActive: {
    backgroundColor: COLORS.primaryStrong,
    borderColor: '#caecff',
  },
  engineModeButtonText: {
    color: COLORS.textMain,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  engineModeButtonTextActive: {
    color: '#0a2a47',
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
  runtimeFallbackViewer: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#051a30',
  },
  runtimeFallbackImage: {
    width: '100%',
    height: '100%',
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
  textFallbackCard: {
    marginTop: 9,
    borderRadius: 10,
    padding: 9,
    backgroundColor: 'rgba(14, 53, 82, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(151, 206, 247, 0.28)',
  },
  textFallbackTitle: {
    color: '#d8edff',
    fontSize: 12,
    fontWeight: '700',
  },
  textFallbackInput: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 203, 245, 0.35)',
    backgroundColor: 'rgba(8, 31, 53, 0.85)',
    color: '#e7f3ff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  textFallbackButton: {
    marginTop: 8,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: '#8bd2ff',
    borderWidth: 1,
    borderColor: '#bce7ff',
  },
  textFallbackButtonDisabled: {
    opacity: 0.6,
  },
  textFallbackButtonText: {
    color: '#083152',
    fontSize: 12,
    fontWeight: '800',
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
  localMaskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  localMaskButton: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(124, 206, 255, 0.92)',
    borderWidth: 1,
    borderColor: '#bfe7ff',
  },
  localMaskButtonDisabled: {
    opacity: 0.65,
  },
  localMaskButtonText: {
    color: '#0a2943',
    fontSize: 12,
    fontWeight: '800',
  },
  localMaskSummary: {
    color: COLORS.textMain,
    fontSize: 12,
    marginTop: 6,
  },
  localMaskMeta: {
    color: COLORS.textMute,
    fontSize: 11,
    marginTop: 5,
  },
  localMaskStatusMeta: {
    color: COLORS.textSub,
    fontSize: 11,
    marginTop: 5,
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
  exportSummaryCard: {
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    padding: 10,
    backgroundColor: 'rgba(8, 33, 55, 0.86)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  exportSummaryText: {
    color: COLORS.textSub,
    fontSize: 12,
  },
});

export default GPUColorGradingScreen;
