import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  agentApi,
  formatApiErrorMessage,
  type AgentExecuteResponse,
  type AgentPlanResponse,
  type ModuleCapabilityItem,
} from '../modules/api';
import {PageHero} from '../components/app/PageHero';
import {HERO_AGENT} from '../assets/design';
import {canvasText, canvasUi, cardSurfaceViolet, glassShadow} from '../theme/canvasDesign';
import {useAgentExecutionContextStore} from '../agent/executionContextStore';
import {
  buildCurrentPageSummary,
  buildMissingContextHintText,
  executeAgentPlanCycle,
  runAgentGoalCycle,
  toActionStatusText,
  toResultStatusText,
  type AgentClientTab,
  type AgentExecuteCycleResult,
  type MissingContextGuide,
} from '../agent/dualEntryOrchestrator';
import {useAgentVoiceGoal} from '../agent/useAgentVoiceGoal';

const QUICK_PROMPTS: Array<{
  icon: string;
  label: string;
  prompt: string;
}> = [
  {
    icon: 'color-palette',
    label: '批量调色',
    prompt: '根据当前状态给我一个调色优化执行计划',
  },
  {
    icon: 'cube',
    label: '3D 任务',
    prompt: '先规划 2D 转 3D 任务，再给出下一步建议',
  },
  {
    icon: 'paper-plane',
    label: '社区发布',
    prompt: '帮我规划并执行一次社区草稿发布流程',
  },
];

interface AgentScreenProps {
  capabilities: ModuleCapabilityItem[];
  activeTab: AgentClientTab;
  onNavigateTab: (tab: AgentClientTab) => void;
}

const toJumpButtonText = (guide: MissingContextGuide): string =>
  guide.targetTab === 'model' ? '去建模页补图' : '去调色页补图';

export const AgentScreen: React.FC<AgentScreenProps> = ({
  capabilities,
  activeTab,
  onNavigateTab,
}) => {
  const [prompt, setPrompt] = useState('');
  const [plan, setPlan] = useState<AgentPlanResponse | null>(null);
  const [executeResult, setExecuteResult] = useState<AgentExecuteResponse | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [loadingExecute, setLoadingExecute] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [missingContextGuides, setMissingContextGuides] = useState<MissingContextGuide[]>([]);
  const colorContext = useAgentExecutionContextStore(state => state.colorContext);
  const modelingImageContext = useAgentExecutionContextStore(
    state => state.modelingImageContext,
  );
  const busy = loadingPlan || loadingExecute;

  const agentCapability = capabilities.find(item => item.module === 'agent');

  const planStatusText = useMemo(() => {
    if (!plan) {
      return '等待生成计划';
    }
    const plannerSourceText = plan.plannerSource === 'cloud' ? '云端规划' : '本地规划';
    return `${plan.estimatedSteps} 步 · ${plannerSourceText}`;
  }, [plan]);

  const executeProgress = useMemo(() => {
    if (!executeResult || !executeResult.actionResults.length) {
      return 0;
    }
    const completed = executeResult.actionResults.filter(
      item => item.status === 'applied',
    ).length;
    return Math.round((completed / executeResult.actionResults.length) * 100);
  }, [executeResult]);

  const workflowProgressText = useMemo(() => {
    const total = Number(executeResult?.workflowState?.totalSteps || 0);
    if (!executeResult || total <= 0) {
      return '';
    }
    const current = Math.max(0, Number(executeResult.workflowState?.currentStep || 0));
    return `${Math.min(Math.max(current, 0), total)}/${total}`;
  }, [executeResult]);

  const toContextLabel = (key: string | null | undefined): string => {
    if (key === 'context.color.image') {
      return '调色图片';
    }
    if (key === 'context.modeling.image') {
      return '建模图片';
    }
    if (key === 'context.community.draftId') {
      return '社区草稿';
    }
    return key || '-';
  };

  const resultSummaryText = useMemo(() => {
    if (!executeResult) {
      return '';
    }
    const clientHandledCount = executeResult.clientHandledActions?.length || 0;
    const appliedCount = executeResult.actionResults.filter(item => item.status === 'applied').length;
    const serviceAppliedCount = Math.max(0, appliedCount - clientHandledCount);
    if (serviceAppliedCount > 0 && clientHandledCount > 0) {
      return `服务端已执行 ${serviceAppliedCount} 项，客户端补执行 ${clientHandledCount} 项。`;
    }
    if (clientHandledCount > 0) {
      return `客户端补执行 ${clientHandledCount} 项。`;
    }
    if (appliedCount > 0) {
      return `已执行 ${appliedCount} 项动作。`;
    }
    return '';
  }, [executeResult]);

  const toRiskText = (riskLevel: string): string => {
    switch (riskLevel) {
      case 'low':
        return '低';
      case 'medium':
        return '中';
      case 'high':
        return '高';
      default:
        return riskLevel || '-';
    }
  };

  const applyCycleResult = useCallback(
    (cycle: AgentExecuteCycleResult) => {
      setPlan(prev => (prev ? {...prev, actions: cycle.hydratedActions} : prev));
      if (cycle.executeResult) {
        setExecuteResult(cycle.executeResult);
      }
      if (cycle.missingContextGuides.length > 0) {
        setMissingContextGuides(cycle.missingContextGuides);
        setErrorText(buildMissingContextHintText(cycle.missingContextGuides));
        return;
      }
      setMissingContextGuides([]);
      if (!cycle.executeResult) {
        return;
      }
      if (cycle.executeResult.status === 'failed') {
        const firstFailure =
          cycle.executeResult.actionResults.find(item => item.status === 'failed')?.message ||
          '执行失败';
        setErrorText(firstFailure);
        return;
      }
      setErrorText('');
    },
    [],
  );

  const runGoal = useCallback(
    async (goal: string, inputSource: 'text' | 'voice') => {
      const finalGoal = goal.trim();
      if (!finalGoal) {
        setErrorText('请输入任务目标');
        return;
      }
      try {
        setLoadingPlan(true);
        setLoadingExecute(true);
        setErrorText('');
        setMissingContextGuides([]);
        setExecuteResult(null);
        const {plan: nextPlan, cycle} = await runAgentGoalCycle({
          goal: finalGoal,
          context: {
            currentTab: activeTab,
            colorContext,
            modelingImageContext,
            latestExecuteResult: executeResult,
          },
          clientHandlers: {
            navigateToTab: tab => {
              setTimeout(() => onNavigateTab(tab), 0);
            },
            summarizeCurrentPage: () =>
              buildCurrentPageSummary({
                currentTab: activeTab,
                colorContext,
                modelingImageContext,
                latestPlan: nextPlan,
                latestExecuteResult: executeResult,
              }),
          },
          options: {
            inputSource,
          },
        });
        setPlan({...nextPlan, actions: cycle.hydratedActions});
        applyCycleResult(cycle);
      } catch (error) {
        setErrorText(formatApiErrorMessage(error, '执行失败'));
      } finally {
        setLoadingPlan(false);
        setLoadingExecute(false);
      }
    },
    [
      activeTab,
      applyCycleResult,
      colorContext,
      executeResult,
      modelingImageContext,
      onNavigateTab,
    ],
  );

  const {
    recording,
    phase: voicePhase,
    liveTranscript,
    errorText: voiceErrorText,
    onPressIn: onVoicePressIn,
    onPressOut: onVoicePressOut,
    clearError: clearVoiceError,
  } = useAgentVoiceGoal({
    busy,
    onTranscript: transcript => {
      setPrompt(transcript);
      runGoal(transcript, 'voice').catch(() => undefined);
    },
  });

  useEffect(() => {
    if (voiceErrorText) {
      setErrorText(voiceErrorText);
    }
  }, [voiceErrorText]);

  const createPlan = async () => {
    if (!prompt.trim()) {
      setErrorText('请输入任务目标');
      return;
    }
    try {
      setLoadingPlan(true);
      setErrorText('');
      setExecuteResult(null);
      setMissingContextGuides([]);
      const nextPlan = await agentApi.createPlan(prompt.trim(), activeTab, 'text');
      setPlan(nextPlan);
    } catch (error) {
      setErrorText(formatApiErrorMessage(error, '计划生成失败'));
    } finally {
      setLoadingPlan(false);
    }
  };

  const executePlan = async () => {
    if (!plan) {
      setErrorText('请先生成计划');
      return;
    }
    const pendingActionIds =
      executeResult?.status === 'pending_confirm'
        ? executeResult.actionResults
            .filter(item => item.status === 'pending_confirm')
            .map(item => item.action.actionId)
        : [];
    try {
      setLoadingExecute(true);
      clearVoiceError();
      setErrorText('');
      const cycle = await executeAgentPlanCycle({
        plan,
        context: {
          currentTab: activeTab,
          colorContext,
          modelingImageContext,
          latestExecuteResult: executeResult,
        },
        clientHandlers: {
          navigateToTab: tab => {
            setTimeout(() => onNavigateTab(tab), 0);
          },
          summarizeCurrentPage: () =>
            buildCurrentPageSummary({
              currentTab: activeTab,
              colorContext,
              modelingImageContext,
              latestPlan: plan,
              latestExecuteResult: executeResult,
            }),
        },
        options: {
          actionIds: pendingActionIds.length ? pendingActionIds : undefined,
          allowConfirmActions: pendingActionIds.length > 0,
        },
      });
      applyCycleResult(cycle);
    } catch (error) {
      setErrorText(formatApiErrorMessage(error, '计划执行失败'));
    } finally {
      setLoadingExecute(false);
    }
  };

  const triggerQuickExecute = () => {
    clearVoiceError();
    runGoal(prompt, 'text').catch(() => undefined);
  };

  const toVoicePhaseText = (phase: string): string => {
    if (phase === 'listening') {
      return '正在收音';
    }
    if (phase === 'transcribing') {
      return '转写中';
    }
    if (phase === 'error') {
      return '识别异常';
    }
    return '空闲';
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <PageHero
        image={HERO_AGENT}
        title="AI Agent"
        subtitle="计划 → 复核 → 执行"
        variant="editorial"
        overlayStrength="normal"
      />

      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionIconBadge}>
            <Icon name="compass" size={13} color="#A34A3C" />
          </View>
          <Text style={styles.sectionTitle}>任务目标</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickChipRow}>
          {QUICK_PROMPTS.map(item => (
            <Pressable key={item.label} style={styles.quickChip} onPress={() => setPrompt(item.prompt)}>
              <Icon name={item.icon} size={14} color="#A34A3C" />
              <Text style={styles.quickChipText}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          style={styles.input}
          multiline
          placeholder="例如：先自动调色，再生成3D模型并准备社区发布草稿"
          placeholderTextColor="rgba(134,112,100,0.7)"
        />
        <View style={styles.actionRow}>
          <Pressable style={styles.primaryBtn} onPress={createPlan} disabled={loadingPlan}>
            <Icon name="sparkles" size={15} color="#FFF6F2" />
            <Text style={styles.primaryBtnText}>{loadingPlan ? '生成中...' : '生成计划'}</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={executePlan} disabled={!plan || loadingExecute}>
            <Icon name="play" size={15} color="#3B2F29" />
            <Text style={styles.secondaryBtnText}>
              {loadingExecute
                ? '执行中...'
                : executeResult?.status === 'pending_confirm'
                  ? '确认待执行'
                  : '确认执行'}
            </Text>
          </Pressable>
        </View>
        <View style={styles.actionRow}>
          <Pressable style={styles.secondaryBtn} onPress={triggerQuickExecute} disabled={busy}>
            <Icon name="flash" size={15} color="#2F2926" />
            <Text style={styles.secondaryBtnText}>{busy ? '执行中...' : '一句话执行'}</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryBtn, recording && styles.voiceBtnActive]}
            onPressIn={onVoicePressIn}
            onPressOut={onVoicePressOut}
            disabled={busy}>
            <Icon name={recording ? 'mic' : 'mic-outline'} size={15} color="#2F2926" />
            <Text style={styles.secondaryBtnText}>{recording ? '松开结束' : '按住说话'}</Text>
          </Pressable>
        </View>
        <Text style={styles.metaText}>
          语音阶段: {toVoicePhaseText(voicePhase)}
          {liveTranscript ? ` | ${liveTranscript}` : ''}
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionIconBadge}>
            <Icon name="list" size={13} color="#A34A3C" />
          </View>
          <Text style={styles.sectionTitle}>计划摘要</Text>
        </View>
        <Text style={styles.metaText}>{planStatusText}</Text>
        {plan ? (
          <View style={styles.stepWrap}>
            {plan.actions.map((action, index) => (
              <View key={action.actionId} style={styles.stepCard}>
                <View style={styles.stepHead}>
                  <Text style={styles.stepIndex}>#{index + 1}</Text>
                  <Text style={styles.stepDomain}>领域: {action.domain}</Text>
                  <Text style={styles.stepOp}>操作: {action.operation}</Text>
                </View>
                <Text style={styles.stepMeta}>
                  风险: {toRiskText(action.riskLevel)} | 需确认:{' '}
                  {action.requiresConfirmation ? '是' : '否'}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.metaText}>生成计划后会展示步骤</Text>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionIconBadge}>
            <Icon name="checkmark-done" size={13} color="#A34A3C" />
          </View>
          <Text style={styles.sectionTitle}>执行结果</Text>
        </View>
        {executeResult ? (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, {width: `${executeProgress}%`}]} />
            </View>
            <Text style={styles.progressText}>{executeProgress}%</Text>
          </View>
        ) : null}
        {executeResult ? (
          <View style={styles.stepWrap}>
            <Text style={styles.metaText}>状态: {toResultStatusText(executeResult.status)}</Text>
            {resultSummaryText ? <Text style={styles.metaText}>{resultSummaryText}</Text> : null}
            {workflowProgressText ? (
              <Text style={styles.metaText}>链路进度: {workflowProgressText}</Text>
            ) : null}
            {executeResult.workflowState?.nextRequiredContext ? (
              <Text style={styles.metaText}>
                下一步需要: {toContextLabel(executeResult.workflowState.nextRequiredContext)}
              </Text>
            ) : null}
            {executeResult.clientHandledActions?.length ? (
              <Text style={styles.metaText}>
                客户端补执行: {executeResult.clientHandledActions.length} 项
              </Text>
            ) : null}
            {executeResult.pageSummary ? (
              <View style={styles.stepCard}>
                <Text style={styles.stepDomain}>当前页摘要</Text>
                <Text style={styles.stepMeta}>{executeResult.pageSummary}</Text>
              </View>
            ) : null}
            {executeResult.actionResults.map(result => (
              <View key={result.action.actionId} style={styles.stepCard}>
                <Text style={styles.stepDomain}>
                  领域: {result.action.domain} · 操作: {result.action.operation}
                </Text>
                <Text style={styles.stepMeta}>
                  {toActionStatusText(result.status)} {result.errorCode ? `（${result.errorCode}）` : ''}
                </Text>
                <Text style={styles.stepMeta}>{result.message}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.metaText}>等待执行</Text>
        )}
        {errorText ? <Text style={styles.errorText}>错误: {errorText}</Text> : null}
        {missingContextGuides[0] ? (
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => onNavigateTab(missingContextGuides[0].targetTab)}>
            <Icon name="arrow-forward-circle" size={15} color="#2F2926" />
            <Text style={styles.secondaryBtnText}>{toJumpButtonText(missingContextGuides[0])}</Text>
          </Pressable>
        ) : null}
        <Text style={styles.metaText}>
          严格模式: {agentCapability?.strictMode ? '开启' : '未知'} | 认证:{' '}
          {agentCapability?.auth?.required ? 'JWT' : '无'}
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {gap: 14, paddingBottom: 24},
  card: {
    ...cardSurfaceViolet,
    ...glassShadow,
    padding: 14,
    gap: 12,
  },
  sectionTitle: {
    ...canvasText.sectionTitle,
    color: '#2F2926',
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
    minHeight: 90,
    textAlignVertical: 'top',
    color: '#2F2926',
    ...canvasText.body,
  },
  quickChipRow: {
    gap: 8,
    paddingRight: 10,
  },
  quickChip: {
    ...canvasUi.chip,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  quickChipText: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
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
    flexDirection: 'row',
    gap: 6,
  },
  voiceBtnActive: {
    opacity: 0.84,
  },
  secondaryBtnText: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
  },
  stepWrap: {
    gap: 9,
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTrack: {
    ...canvasUi.progressTrack,
    flex: 1,
  },
  progressFill: {
    ...canvasUi.progressFill,
  },
  progressText: {
    ...canvasText.caption,
    color: '#A34A3C',
    minWidth: 32,
    textAlign: 'right',
  },
  stepCard: {
    ...canvasUi.subtleCard,
    borderRadius: 14,
    padding: 11,
    gap: 5,
  },
  stepHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepIndex: {
    ...canvasText.caption,
    color: '#A34A3C',
  },
  stepDomain: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
  },
  stepOp: {
    ...canvasText.bodyMuted,
    color: 'rgba(110,90,80,0.82)',
  },
  stepMeta: {
    ...canvasText.bodyMuted,
    color: 'rgba(110,90,80,0.82)',
    lineHeight: 16,
  },
  metaText: {
    ...canvasText.body,
    color: 'rgba(110,90,80,0.82)',
    lineHeight: 18,
  },
  errorText: {
    ...canvasText.body,
    color: '#C35B63',
  },
});

