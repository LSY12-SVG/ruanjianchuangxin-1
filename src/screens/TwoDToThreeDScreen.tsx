import React, {useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import {VISION_THEME} from '../theme/visionTheme';

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

export const TwoDToThreeDScreen: React.FC<TwoDToThreeDScreenProps> = ({
  onAgentBridgeReady,
}) => {
  const [modelLevel, setModelLevel] = useState<ModelLevel>('balanced');
  const [taskProgress, setTaskProgress] = useState(67);
  const [taskName, setTaskName] = useState('shoe_scan_021');
  const [statusText, setStatusText] = useState('重建中');

  React.useEffect(() => {
    if (!onAgentBridgeReady) {
      return;
    }

    onAgentBridgeReady({
      startTask: async (level?: ModelLevel) => {
        if (level) {
          setModelLevel(level);
        }
        const finalLevel = level || modelLevel;
        const nextProgress = finalLevel === 'preview' ? 38 : finalLevel === 'balanced' ? 22 : 12;
        setTaskProgress(nextProgress);
        setTaskName(`agent_job_${Date.now().toString().slice(-6)}`);
        setStatusText('任务已启动');
        return {
          ok: true,
          message: `已按${finalLevel}模式启动 2D 转 3D 任务。`,
        };
      },
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
  }, [modelLevel, onAgentBridgeReady, statusText, taskProgress]);

  return (
    <LinearGradient
      colors={[
        VISION_THEME.background.top,
        VISION_THEME.background.mid,
        VISION_THEME.background.bottom,
      ]}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View>
            <Text style={styles.heroTitle}>2D 转 3D 工作台</Text>
            <Text style={styles.heroSubtitle}>单图/多图重建 | Mesh + PBR</Text>
          </View>
          <TouchableOpacity style={styles.heroAction} activeOpacity={0.86}>
            <Icon name="help-circle-outline" size={16} color={VISION_THEME.accent.strong} />
            <Text style={styles.heroActionText}>流程说明</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>素材输入</Text>
          <View style={styles.uploadRow}>
            <TouchableOpacity style={styles.uploadCard} activeOpacity={0.85}>
              <Icon name="image-outline" size={26} color={VISION_THEME.accent.main} />
              <Text style={styles.uploadLabel}>单图重建</Text>
              <Text style={styles.uploadHint}>适合快速原型</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.uploadCard} activeOpacity={0.85}>
              <Icon name="images-outline" size={26} color={VISION_THEME.accent.main} />
              <Text style={styles.uploadLabel}>多图重建</Text>
              <Text style={styles.uploadHint}>精度更稳定</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.block}>
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
        </View>

        <View style={styles.block}>
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
        </View>

        <View style={styles.block}>
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
            <Text style={styles.taskMeta}>预计剩余 1 分 42 秒 · 导出格式 GLB / FBX</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.primaryButton} activeOpacity={0.9}>
          <Icon name="sparkles-outline" size={18} color={VISION_THEME.accent.dark} />
          <Text style={styles.primaryButtonText}>启动 2D 转 3D</Text>
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
  heroSubtitle: {
    marginTop: 4,
    color: VISION_THEME.text.secondary,
    fontSize: 12,
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
  uploadHint: {
    color: VISION_THEME.text.muted,
    fontSize: 11,
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
    width: '67%',
    height: '100%',
    backgroundColor: VISION_THEME.accent.main,
  },
  taskMeta: {
    color: VISION_THEME.text.muted,
    fontSize: 11,
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
  primaryButtonText: {
    color: VISION_THEME.accent.dark,
    fontSize: 15,
    fontWeight: '800',
  },
});

