import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import {launchImageLibrary, type Asset} from 'react-native-image-picker';
import {LiquidPanel, StatusStrip} from '../components/design';
import {VISION_THEME} from '../theme/visionTheme';
import {
  createImageTo3DJob,
  getModelAsset,
  getReconstructionTask,
  type ImageTo3DJobStatus,
  type UploadableImageAsset,
} from '../services/imageTo3dApi';

export type ModelLevel = 'preview' | 'balanced' | 'quality';

interface AgentActionResult {
  ok: boolean;
  message: string;
}

export interface TwoDToThreeDAgentBridge {
  startTask: (level?: ModelLevel) => Promise<AgentActionResult>;
  setModelLevel: (level: ModelLevel) => Promise<AgentActionResult>;
  getSnapshot: () => {
    modelLevel: ModelLevel;
    progress: number;
    statusText: string;
  };
}

interface TwoDToThreeDScreenProps {
  onAgentBridgeReady?: (bridge: TwoDToThreeDAgentBridge | null) => void;
}

const MODEL_OPTIONS: Array<{key: ModelLevel; label: string; hint: string}> = [
  {key: 'preview', label: '极速预览', hint: '30-60 秒'},
  {key: 'balanced', label: '平衡模式', hint: '2-4 分钟'},
  {key: 'quality', label: '高精模式', hint: '5-9 分钟'},
];

const PIPELINE = [
  '主体分割与深度估计',
  '多视角补全与几何重建',
  '网格优化与法线修复',
  'PBR 材质生成与导出',
];

const PROGRESS_MAP: Record<ImageTo3DJobStatus, number> = {
  queued: 14,
  processing: 64,
  succeeded: 100,
  failed: 0,
  expired: 0,
};

const isTerminalStatus = (status: ImageTo3DJobStatus): boolean =>
  status === 'succeeded' || status === 'failed' || status === 'expired';

const statusFallbackText = (status: ImageTo3DJobStatus): string => {
  if (status === 'queued') {
    return '任务排队中';
  }
  if (status === 'processing') {
    return '重建中';
  }
  if (status === 'succeeded') {
    return '已完成';
  }
  if (status === 'failed') {
    return '生成失败';
  }
  return '已过期';
};

const toUploadAsset = (asset: Asset): UploadableImageAsset => ({
  uri: String(asset.uri || ''),
  type: String(asset.type || 'image/jpeg'),
  fileName: String(asset.fileName || `image-${Date.now()}.jpg`),
});

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return '任务提交失败，请稍后重试。';
};

export const TwoDToThreeDScreen: React.FC<TwoDToThreeDScreenProps> = ({onAgentBridgeReady}) => {
  const [modelLevel, setModelLevel] = useState<ModelLevel>('balanced');
  const [taskProgress, setTaskProgress] = useState(0);
  const [taskName, setTaskName] = useState('--');
  const [statusText, setStatusText] = useState('待开始');
  const [selectedImage, setSelectedImage] = useState<UploadableImageAsset | null>(null);
  const [taskMeta, setTaskMeta] = useState('请先选择素材图片');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearPolling();
    };
  }, [clearPolling]);

  const refreshTask = useCallback(
    async (taskId: string, pollAfterMs = 5000) => {
      try {
        const task = await getReconstructionTask(taskId);
        setTaskName(task.taskId.slice(0, 12));
        setTaskProgress(PROGRESS_MAP[task.status] ?? 0);
        setStatusText(task.message || statusFallbackText(task.status));

        if (task.downloadUrl) {
          setTaskMeta(`导出链接已就绪 (${String(task.viewerFormat || 'glb').toUpperCase()})`);
        } else if (task.status === 'succeeded') {
          setTaskMeta('模型已生成，可在作品中查看。');
        } else if (task.status === 'processing') {
          setTaskMeta('服务端正在生成模型，请稍候...');
        }

        if (task.status === 'succeeded' && task.modelId) {
          try {
            const model = await getModelAsset(task.modelId);
            if (model.glbUrl) {
              setTaskMeta(`模型已生成 (${String(model.viewerFormat || 'glb').toUpperCase()})`);
            }
          } catch {
            // ignore model metadata fallback errors
          }
        }

        if (!isTerminalStatus(task.status)) {
          clearPolling();
          pollTimerRef.current = setTimeout(() => {
            refreshTask(taskId, pollAfterMs).catch(() => undefined);
          }, Math.max(1200, pollAfterMs));
        }
      } catch (error) {
        setErrorText(getErrorMessage(error));
        setStatusText('状态刷新失败');
      }
    },
    [clearPolling],
  );

  const handlePickImage = useCallback(async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 1,
      includeBase64: false,
    });

    if (result.didCancel) {
      return;
    }
    if (result.errorMessage) {
      setErrorText(result.errorMessage);
      return;
    }

    const asset = result.assets?.[0];
    if (!asset?.uri) {
      setErrorText('未获取到有效图片，请重新选择。');
      return;
    }

    const nextImage = toUploadAsset(asset);
    setSelectedImage(nextImage);
    setErrorText(null);
    setTaskMeta(`素材已就绪：${nextImage.fileName || '图片'}`);
    if (taskName === '--') {
      setStatusText('素材已选择');
      setTaskProgress(0);
    }
  }, [taskName]);

  const startTask = useCallback(
    async (level?: ModelLevel): Promise<AgentActionResult> => {
      if (isSubmitting) {
        return {
          ok: false,
          message: '已有任务在提交中，请稍候。',
        };
      }
      if (!selectedImage) {
        return {
          ok: false,
          message: '请先选择一张素材图片。',
        };
      }

      if (level) {
        setModelLevel(level);
      }
      const finalLevel = level || modelLevel;

      setIsSubmitting(true);
      setErrorText(null);
      clearPolling();
      setStatusText('任务提交中...');
      setTaskMeta('已连接后端，正在创建任务。');

      try {
        const created = await createImageTo3DJob(selectedImage);
        setTaskName(created.taskId.slice(0, 12));
        setTaskProgress(PROGRESS_MAP[created.status] ?? 0);
        setStatusText(statusFallbackText(created.status));
        setTaskMeta('任务已创建，等待服务端生成模型。');
        refreshTask(created.taskId, created.pollAfterMs).catch(() => undefined);

        return {
          ok: true,
          message: `已按${finalLevel}模式启动 2D 转 3D 任务。`,
        };
      } catch (error) {
        const message = getErrorMessage(error);
        setErrorText(message);
        setStatusText('提交失败');
        return {
          ok: false,
          message,
        };
      } finally {
        setIsSubmitting(false);
      }
    },
    [clearPolling, isSubmitting, modelLevel, refreshTask, selectedImage],
  );

  useEffect(() => {
    if (!onAgentBridgeReady) {
      return;
    }

    onAgentBridgeReady({
      startTask,
      setModelLevel: async (level: ModelLevel) => {
        setModelLevel(level);
        return {
          ok: true,
          message: `已切换重建质量到 ${level}。`,
        };
      },
      getSnapshot: () => ({
        modelLevel,
        progress: taskProgress,
        statusText,
      }),
    });

    return () => {
      onAgentBridgeReady(null);
    };
  }, [modelLevel, onAgentBridgeReady, startTask, statusText, taskProgress]);

  return (
    <LinearGradient colors={VISION_THEME.gradients.page} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LiquidPanel style={styles.heroCard}>
          <View>
            <Text style={styles.heroTitle}>2D 转 3D 工作台</Text>
            <StatusStrip
              compact
              items={[
                {label: 'Mesh', icon: 'cube-outline', tone: 'active'},
                {label: 'PBR', icon: 'color-palette-outline', tone: 'active'},
              ]}
            />
          </View>
          <TouchableOpacity style={styles.heroAction} activeOpacity={0.86}>
            <Icon name="link-outline" size={16} color={VISION_THEME.accent.strong} />
            <Text style={styles.heroActionText}>后端已接入</Text>
          </TouchableOpacity>
        </LiquidPanel>

        <LiquidPanel style={styles.block}>
          <Text style={styles.blockTitle}>素材输入</Text>
          <View style={styles.uploadRow}>
            <TouchableOpacity style={styles.uploadCard} activeOpacity={0.85} onPress={handlePickImage}>
              <Icon name="image-outline" size={26} color={VISION_THEME.accent.main} />
              <Text style={styles.uploadLabel}>单图重建</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.uploadCard} activeOpacity={0.85} onPress={handlePickImage}>
              <Icon name="images-outline" size={26} color={VISION_THEME.accent.main} />
              <Text style={styles.uploadLabel}>多图入口</Text>
            </TouchableOpacity>
          </View>
        </LiquidPanel>

        <LiquidPanel style={styles.block}>
          <Text style={styles.blockTitle}>重建质量策略</Text>
          <View style={styles.segmented}>
            {MODEL_OPTIONS.map(option => {
              const active = option.key === modelLevel;
              return (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => setModelLevel(option.key)}
                  style={[styles.segment, active && styles.segmentActive]}
                  activeOpacity={0.86}>
                  <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                    {option.label}
                  </Text>
                  <Text style={[styles.segmentHint, active && styles.segmentHintActive]}>
                    {option.hint}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </LiquidPanel>

        <LiquidPanel style={styles.block}>
          <Text style={styles.blockTitle}>当前处理流程</Text>
          <View style={styles.pipelineCard}>
            {PIPELINE.map((step, index) => (
              <View key={step} style={styles.pipelineRow}>
                <View style={styles.pipelineIndex}>
                  <Text style={styles.pipelineIndexText}>{index + 1}</Text>
                </View>
                <Text style={styles.pipelineText}>{step}</Text>
              </View>
            ))}
          </View>
        </LiquidPanel>

        <LiquidPanel style={styles.block}>
          <Text style={styles.blockTitle}>最近任务</Text>
          <View style={styles.taskCard}>
            <View style={styles.taskHeader}>
              <Text style={styles.taskName}>{taskName}</Text>
              <Text style={styles.taskStatus}>
                {statusText} {taskProgress}%
              </Text>
            </View>
            <View style={styles.progressRail}>
              <View style={[styles.progressValue, {width: `${taskProgress}%`}]} />
            </View>
            <Text style={styles.taskMeta}>{taskMeta}</Text>
            {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
          </View>
        </LiquidPanel>

        <TouchableOpacity
          style={[styles.primaryButton, isSubmitting && styles.primaryButtonDisabled]}
          activeOpacity={0.9}
          disabled={isSubmitting}
          onPress={() => {
            startTask().catch(() => undefined);
          }}>
          <Icon name="sparkles-outline" size={18} color={VISION_THEME.accent.dark} />
          <Text style={styles.primaryButtonText}>
            {isSubmitting ? '提交中...' : '启动 2D 转 3D'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1},
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
  },
  heroCard: {
    borderRadius: 16,
    backgroundColor: VISION_THEME.surface.base,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  heroTitle: {
    color: VISION_THEME.text.primary,
    fontSize: 21,
    fontWeight: '700',
  },
  heroAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(19, 65, 100, 0.78)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  heroActionText: {
    color: VISION_THEME.accent.strong,
    fontSize: 12,
    fontWeight: '600',
  },
  block: {
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: VISION_THEME.surface.card,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    padding: 11,
  },
  blockTitle: {
    color: VISION_THEME.text.primary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  uploadRow: {
    flexDirection: 'row',
    gap: 10,
  },
  uploadCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(12, 43, 68, 0.84)',
    paddingVertical: 16,
    alignItems: 'center',
    gap: 5,
  },
  uploadLabel: {
    color: VISION_THEME.text.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  segmented: {
    flexDirection: 'row',
    gap: 8,
  },
  segment: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(14, 47, 75, 0.72)',
    paddingVertical: 9,
    alignItems: 'center',
    gap: 2,
  },
  segmentActive: {
    backgroundColor: VISION_THEME.surface.active,
    borderColor: VISION_THEME.border.strong,
  },
  segmentLabel: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
  segmentLabelActive: {
    color: VISION_THEME.accent.strong,
  },
  segmentHint: {
    color: VISION_THEME.text.muted,
    fontSize: 10,
  },
  segmentHintActive: {
    color: VISION_THEME.text.secondary,
  },
  pipelineCard: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(10, 37, 58, 0.75)',
    padding: 10,
    gap: 7,
  },
  pipelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pipelineIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(121, 201, 255, 0.18)',
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipelineIndexText: {
    color: VISION_THEME.accent.strong,
    fontSize: 11,
    fontWeight: '800',
  },
  pipelineText: {
    flex: 1,
    color: VISION_THEME.text.secondary,
    fontSize: 12,
  },
  taskCard: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(10, 37, 58, 0.75)',
    padding: 10,
    gap: 8,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskName: {
    color: VISION_THEME.text.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  taskStatus: {
    color: VISION_THEME.feedback.success,
    fontSize: 11,
    fontWeight: '700',
  },
  progressRail: {
    width: '100%',
    height: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  progressValue: {
    width: '0%',
    height: '100%',
    backgroundColor: VISION_THEME.accent.main,
  },
  taskMeta: {
    color: VISION_THEME.text.muted,
    fontSize: 11,
  },
  errorText: {
    color: '#FF8A80',
    fontSize: 11,
    fontWeight: '600',
  },
  primaryButton: {
    marginTop: 2,
    borderRadius: 14,
    backgroundColor: VISION_THEME.accent.strong,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 13,
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: VISION_THEME.accent.dark,
    fontSize: 15,
    fontWeight: '800',
  },
});
