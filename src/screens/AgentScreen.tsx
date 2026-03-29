import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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
  type AgentWorkflowHistoryEntry,
  type AgentStrategyMetrics,
} from '../modules/api';
import {PageHero} from '../components/app/PageHero';
import {HERO_AGENT} from '../assets/design';
import {canvasText, canvasUi, cardSurfaceViolet, glassShadow} from '../theme/canvasDesign';
import {useAgentExecutionContextStore} from '../agent/executionContextStore';
import {
  areMissingContextGuidesResolved,
  buildCurrentPageSummary,
  buildMissingContextHintText,
  cancelPendingAgentWorkflow,
  executeAgentPlanCycle,
  runAgentGoalCycle,
  resumePendingAgentWorkflow,
  toActionStatusText,
  toResultStatusText,
  toWorkflowRunStatusText,
  type AgentClientTab,
  type AgentExecuteCycleResult,
  type MissingContextGuide,
  type AgentExecutionStrategy,
} from '../agent/dualEntryOrchestrator';
import {useAgentVoiceGoal} from '../agent/useAgentVoiceGoal';
import {useAgentWorkflowContinuationStore} from '../agent/workflowContinuationStore';

const STRATEGY_OPTIONS: Array<{value: AgentExecutionStrategy; label: string}> = [
  {value: 'adaptive', label: '自适应'},
  {value: 'fast', label: '快速'},
  {value: 'quality', label: '质量'},
  {value: 'cost', label: '成本'},
];

const strategyLabelMap: Record<AgentExecutionStrategy, string> = {
  adaptive: '自适应',
  fast: '快速',
  quality: '质量',
  cost: '成本',
};

const strategySourceLabelMap: Record<'user' | 'memory' | 'adaptive', string> = {
  user: '用户指定',
  memory: '记忆偏好',
  adaptive: '系统自适应',
};

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
  const [runHistory, setRunHistory] = useState<AgentWorkflowHistoryEntry[]>([]);
  const [loadingRunDetail, setLoadingRunDetail] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [loadingExecute, setLoadingExecute] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [missingContextGuides, setMissingContextGuides] = useState<MissingContextGuide[]>([]);
  const [executionStrategy, setExecutionStrategy] = useState<AgentExecutionStrategy>('adaptive');
  const [strategyMetrics, setStrategyMetrics] = useState<AgentStrategyMetrics | null>(null);
  const [loadingStrategyMetrics, setLoadingStrategyMetrics] = useState(false);
  const contextResumeKeyRef = useRef('');
  const asyncResumeKeyRef = useRef('');
  const colorContext = useAgentExecutionContextStore(state => state.colorContext);
  const modelingImageContext = useAgentExecutionContextStore(
    state => state.modelingImageContext,
  );
  const busy = loadingPlan || loadingExecute;
  const pendingWorkflow = useAgentWorkflowContinuationStore(state => state.pendingWorkflow);
  const persistedRunRef = useAgentWorkflowContinuationStore(state => state.persistedRunRef);
  const setPersistedRunRef = useAgentWorkflowContinuationStore(state => state.setPersistedRunRef);

  const agentCapability = capabilities.find(item => item.module === 'agent');

  const planStatusText = useMemo(() => {
    if (!plan) {
      return '等待生成计划';
    }
    const plannerSourceText = plan.plannerSource === 'cloud' ? '云端规划' : '本地规划';
    const summarySourceText = plan.summarySource === 'model' ? 'AI 摘要' : '规则摘要';
    const meta = [`${plan.estimatedSteps} 步`, plannerSourceText, summarySourceText];
    if (plan.fallback?.used) {
      meta.push('直答兜底');
    }
    return meta.join(' · ');
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
    if (executeResult.resultSummary?.done) {
      return `${executeResult.resultSummary.done} ${executeResult.resultSummary.why}`;
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

  const toolCallsSummary = useMemo(() => {
    if (!executeResult?.toolCalls?.length) {
      return [];
    }
    return executeResult.toolCalls.slice(0, 4).map(item => ({
      id: `${item.actionId}:${item.requestId}`,
      text: `${item.serverId}/${item.toolName} · ${toActionStatusText(item.status)} · ${item.latencyMs}ms · retry:${item.retryCount || 0}${item.errorCode ? ` · ${item.errorCode}` : ""} · ${item.requestId}`,
    }));
  }, [executeResult]);

  const resultCards = useMemo(() => executeResult?.resultCards || [], [executeResult]);

  const effectiveStrategyLabel = useMemo(() => {
    const applied = executeResult?.appliedStrategy || plan?.executionStrategy;
    if (applied && applied in strategyLabelMap) {
      return strategyLabelMap[applied as AgentExecutionStrategy];
    }
    return strategyLabelMap[executionStrategy];
  }, [executeResult?.appliedStrategy, executionStrategy, plan?.executionStrategy]);

  const effectiveStrategySourceLabel = useMemo(() => {
    if (plan?.strategySource && plan.strategySource in strategySourceLabelMap) {
      return strategySourceLabelMap[plan.strategySource];
    }
    return executionStrategy === 'adaptive' ? '系统自适应' : '用户指定';
  }, [executionStrategy, plan?.strategySource]);

  const loadStrategyMetrics = useCallback(async () => {
    setLoadingStrategyMetrics(true);
    try {
      const health = await agentApi.getAgentHealth();
      const metrics = (health?.metrics?.strategyMetrics || null) as AgentStrategyMetrics | null;
      setStrategyMetrics(metrics);
    } catch {
      setStrategyMetrics(null);
    } finally {
      setLoadingStrategyMetrics(false);
    }
  }, []);


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

  const toActionLabel = (action: AgentPlanResponse['actions'][number]): string => {
    const key = `${action.domain}.${action.operation}`;
    if (key === 'navigation.navigate_tab') {
      const tabRaw = String(action.args?.tab || '').trim().toLowerCase();
      const routeRaw = String(action.args?.route || '').trim().toLowerCase();
      if (tabRaw === 'community') {
        return '前往社区页';
      }
      if (routeRaw.includes('model')) {
        return '前往建模页';
      }
      if (routeRaw.includes('grading') || tabRaw === 'home') {
        return '前往调色页';
      }
      if (tabRaw === 'agent') {
        return '前往助手页';
      }
      return '执行页面跳转';
    }
    if (key === 'grading.apply_visual_suggest') {
      return '执行首轮智能调色';
    }
    if (key === 'convert.start_task') {
      return '启动 2D 转 3D 建模';
    }
    if (key === 'community.create_draft') {
      return '创建社区草稿';
    }
    if (key === 'community.publish_draft') {
      return '发布社区草稿';
    }
    if (key === 'app.summarize_current_page') {
      return '总结当前页面';
    }
    if (key === 'settings.apply_patch') {
      return '应用设置变更';
    }
    return `${action.domain}.${action.operation}`;
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
        await cancelPendingAgentWorkflow();
        setLoadingPlan(true);
        setLoadingExecute(true);
        setErrorText('');
        setMissingContextGuides([]);
        setExecuteResult(null);
        contextResumeKeyRef.current = '';
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
            executionStrategy,
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
      executionStrategy,
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

  useEffect(() => {
    loadStrategyMetrics().catch(() => undefined);
  }, [loadStrategyMetrics]);

  const createPlan = async () => {
    if (!prompt.trim()) {
      setErrorText('请输入任务目标');
      return;
    }
    try {
      await cancelPendingAgentWorkflow();
      setLoadingPlan(true);
      setErrorText('');
      setExecuteResult(null);
      setMissingContextGuides([]);
      contextResumeKeyRef.current = '';
      const nextPlan = await agentApi.createPlan(
        prompt.trim(),
        activeTab,
        'text',
        executionStrategy === 'adaptive' ? undefined : executionStrategy,
      );
      setPlan(nextPlan);
    } catch (error) {
      setErrorText(formatApiErrorMessage(error, '计划生成失败'));
    } finally {
      setLoadingPlan(false);
    }
  };

  const cancelWorkflow = async () => {
    setLoadingExecute(true);
    try {
      await cancelPendingAgentWorkflow();
      setExecuteResult(null);
      setRunHistory([]);
      setMissingContextGuides([]);
      setErrorText('');
    } finally {
      setLoadingExecute(false);
    }
  };

  const refreshRunDetail = useCallback(async () => {
    const runId =
      executeResult?.workflowRun?.runId ||
      pendingWorkflow?.workflowRun?.runId ||
      persistedRunRef?.runId ||
      '';
    if (!runId) {
      return;
    }
    setLoadingRunDetail(true);
    try {
      const [latest, history] = await Promise.all([
        agentApi.getWorkflowRun(runId),
        agentApi.getWorkflowRunHistory(runId),
      ]);
      setExecuteResult(latest);
      setRunHistory(Array.isArray(history.history) ? history.history : []);
      setPersistedRunRef({
        runId,
        status: latest.workflowRun?.status || latest.status,
        updatedAt: Date.parse(String(latest.workflowRun?.updatedAt || '')) || Date.now(),
      });
    } catch (error) {
      setErrorText(formatApiErrorMessage(error, '运行详情刷新失败'));
    } finally {
      setLoadingRunDetail(false);
    }
  }, [executeResult, pendingWorkflow, persistedRunRef, setPersistedRunRef]);

  const retryFailedActions = useCallback(async () => {
    const runId =
      executeResult?.workflowRun?.runId ||
      pendingWorkflow?.workflowRun?.runId ||
      persistedRunRef?.runId ||
      '';
    if (!runId) {
      return;
    }
    setLoadingExecute(true);
    try {
      const failedActionIds = (executeResult?.actionResults || [])
        .filter(item => item.status === 'failed')
        .map(item => item.action.actionId);
      const retried = await agentApi.retryWorkflowRun(runId, {
        actionIds: failedActionIds.length > 0 ? failedActionIds : undefined,
      });
      setExecuteResult(retried);
      await refreshRunDetail();
    } catch (error) {
      setErrorText(formatApiErrorMessage(error, '重试失败步骤失败'));
    } finally {
      setLoadingExecute(false);
    }
  }, [executeResult, pendingWorkflow, persistedRunRef, refreshRunDetail]);

  const executePlan = async () => {
    const pendingActionIds =
      executeResult?.status === 'pending_confirm'
        ? executeResult.actionResults
            .filter(item => item.status === 'pending_confirm')
            .map(item => item.action.actionId)
        : [];
    const resumableRunId =
      executeResult?.workflowRun?.runId ||
      pendingWorkflow?.workflowRun?.runId ||
      persistedRunRef?.runId ||
      '';
    if (!plan && !(resumableRunId && pendingActionIds.length > 0)) {
      setErrorText('请先生成计划');
      return;
    }
    try {
      setLoadingExecute(true);
      clearVoiceError();
      setErrorText('');
      contextResumeKeyRef.current = '';
      if (pendingActionIds.length > 0 && resumableRunId) {
        const resumed = await resumePendingAgentWorkflow({
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
            allowConfirmActions: true,
          },
        });
        if (resumed) {
          applyCycleResult(resumed);
        }
        return;
      }
      const cycle = await executeAgentPlanCycle({
        plan: plan!,
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
          executionStrategy,
        },
      });
      applyCycleResult(cycle);
    } catch (error) {
      setErrorText(formatApiErrorMessage(error, '计划执行失败'));
    } finally {
      setLoadingExecute(false);
    }
  };

  useEffect(() => {
    if (
      !persistedRunRef?.runId ||
      pendingWorkflow ||
      executeResult ||
      loadingPlan ||
      loadingExecute
    ) {
      return;
    }
    let cancelled = false;
    agentApi
      .getWorkflowRun(persistedRunRef.runId)
      .then(result => {
        if (cancelled) {
          return;
        }
        setExecuteResult(result);
        if (
          result.workflowRun?.status &&
          result.workflowRun.status !== 'waiting_async_result' &&
          result.workflowRun.status !== 'waiting_confirm' &&
          result.workflowRun.status !== 'waiting_context' &&
          result.workflowRun.status !== 'running'
        ) {
          setPersistedRunRef(null);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [
    executeResult,
    loadingExecute,
    loadingPlan,
    pendingWorkflow,
    persistedRunRef?.runId,
    setPersistedRunRef,
  ]);  useEffect(() => {
    const runId =
      executeResult?.workflowRun?.runId ||
      pendingWorkflow?.workflowRun?.runId ||
      persistedRunRef?.runId ||
      '';
    if (!runId) {
      setRunHistory([]);
      return;
    }

    let cancelled = false;
    agentApi
      .getWorkflowRunHistory(runId)
      .then(history => {
        if (cancelled) {
          return;
        }
        setRunHistory(Array.isArray(history.history) ? history.history : []);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [executeResult?.workflowRun?.runId, pendingWorkflow?.workflowRun?.runId, persistedRunRef?.runId]);


  useEffect(() => {
    const waitingAsyncRun =
      pendingWorkflow?.workflowRun?.status === 'waiting_async_result'
        ? pendingWorkflow.workflowRun
        : persistedRunRef?.status === 'waiting_async_result'
          ? persistedRunRef
          : null;
    if (!waitingAsyncRun || loadingPlan || loadingExecute) {
      return;
    }
    const taskId =
      pendingWorkflow?.workflowRun?.pendingTask?.taskId ||
      executeResult?.workflowRun?.pendingTask?.taskId ||
      '';
    const resumeKey = `${waitingAsyncRun.runId}:${taskId}:${pendingWorkflow?.updatedAt || persistedRunRef?.updatedAt || 0}`;
    if (asyncResumeKeyRef.current === resumeKey) {
      return;
    }
    asyncResumeKeyRef.current = resumeKey;

    let cancelled = false;
    const timer = setTimeout(() => {
      resumePendingAgentWorkflow({
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
      })
        .then(cycle => {
          if (cancelled || !cycle) {
            return;
          }
          applyCycleResult(cycle);
        })
        .catch(error => {
          if (!cancelled) {
            setErrorText(formatApiErrorMessage(error, '后台任务续跑失败'));
          }
        });
    }, pendingWorkflow?.workflowRun?.pendingTask?.pollAfterMs || executeResult?.workflowRun?.pendingTask?.pollAfterMs || 4000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    activeTab,
    applyCycleResult,
    colorContext,
    executeResult,
    loadingExecute,
    loadingPlan,
    modelingImageContext,
    onNavigateTab,
    pendingWorkflow,
    persistedRunRef,
    plan,
    setPersistedRunRef,
  ]);

  useEffect(() => {
    if (!plan || !missingContextGuides.length || loadingPlan || loadingExecute) {
      return;
    }
    if (
      !areMissingContextGuidesResolved(missingContextGuides, {
        colorContext,
        modelingImageContext,
      })
    ) {
      return;
    }

    const resumeKey = [
      plan.planId,
      executeResult?.executionId || 'root',
      missingContextGuides.map(item => item.operation).join(','),
      colorContext?.image?.base64 ? 'color' : 'no-color',
      modelingImageContext?.image?.base64 ? 'model' : 'no-model',
    ].join(':');
    if (contextResumeKeyRef.current === resumeKey) {
      return;
    }
    contextResumeKeyRef.current = resumeKey;

    let cancelled = false;
    const resume = async () => {
      try {
        setLoadingExecute(true);
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
        });
        if (!cancelled) {
          applyCycleResult(cycle);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorText(formatApiErrorMessage(error, '上下文补齐后继续执行失败'));
        }
      } finally {
        if (!cancelled) {
          setLoadingExecute(false);
        }
      }
    };
    resume().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    applyCycleResult,
    colorContext,
    executeResult,
    loadingExecute,
    loadingPlan,
    missingContextGuides,
    modelingImageContext,
    onNavigateTab,
    plan,
  ]);

  const triggerQuickExecute = () => {
    clearVoiceError();
    runGoal(prompt, 'text').catch(() => undefined);
  };

  const strategyTile = (key: 'fast' | 'quality' | 'cost' | 'adaptive') => {
    const item = strategyMetrics?.[key];
    if (!item) {
      return `${strategyLabelMap[key]}: -`;
    }
    return `${strategyLabelMap[key]} · P50 ${Math.round(item.planLatencyP50Ms)}ms · 成功率 ${Math.round(item.executeSuccessRate * 100)}% · 中断率 ${Math.round(item.interruptionRate * 100)}%`;
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
        <Text style={styles.metaText}>策略模式</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickChipRow}>
          {STRATEGY_OPTIONS.map(item => (
            <Pressable
              key={item.value}
              style={[styles.quickChip, executionStrategy === item.value ? styles.quickChipActive : null]}
              onPress={() => setExecutionStrategy(item.value)}>
              <Text style={styles.quickChipText}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={styles.metaText}>当前生效: {effectiveStrategyLabel} · 来源: {effectiveStrategySourceLabel}</Text>
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
        {pendingWorkflow?.workflowRun?.runId || persistedRunRef?.runId ? (
          <View style={styles.actionRow}>
            <Pressable style={styles.secondaryBtn} onPress={cancelWorkflow} disabled={loadingExecute}>
              <Icon name="close-circle-outline" size={15} color="#2F2926" />
              <Text style={styles.secondaryBtnText}>
                {loadingExecute ? '处理中...' : '取消当前流程'}
              </Text>
            </Pressable>
          </View>
        ) : null}
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
        {plan?.reasoningSummary ? (
          <Text style={styles.metaText}>{plan.reasoningSummary}</Text>
        ) : null}
        {plan?.decisionPath !== 'fallback_direct' && plan?.clarificationRequired && plan?.clarificationQuestion ? (
          <Text style={styles.metaText}>需要澄清: {plan.clarificationQuestion}</Text>
        ) : null}
        {plan ? (
          <View style={styles.stepWrap}>
            {plan.actions.map((action, index) => (
              <View key={action.actionId} style={styles.stepCard}>
                <View style={styles.stepHead}>
                  <Text style={styles.stepIndex}>#{index + 1}</Text>
                  <Text style={styles.stepDomain}>{toActionLabel(action)}</Text>
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
            <Icon name="stats-chart" size={13} color="#A34A3C" />
          </View>
          <Text style={styles.sectionTitle}>策略效果看板</Text>
        </View>
        <Text style={styles.metaText}>{strategyTile('adaptive')}</Text>
        <Text style={styles.metaText}>{strategyTile('fast')}</Text>
        <Text style={styles.metaText}>{strategyTile('quality')}</Text>
        <Text style={styles.metaText}>{strategyTile('cost')}</Text>
        <Pressable style={styles.secondaryBtn} onPress={loadStrategyMetrics} disabled={loadingStrategyMetrics}>
          <Icon name="refresh" size={15} color="#2F2926" />
          <Text style={styles.secondaryBtnText}>{loadingStrategyMetrics ? '刷新中...' : '刷新策略指标'}</Text>
        </Pressable>
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
            {executeResult.workflowRun ? (
              <Text style={styles.metaText}>
                运行态: {toWorkflowRunStatusText(executeResult.workflowRun.status)}
              </Text>
            ) : null}
            {resultSummaryText ? <Text style={styles.metaText}>{resultSummaryText}</Text> : null}
            {workflowProgressText ? (
              <Text style={styles.metaText}>链路进度: {workflowProgressText}</Text>
            ) : null}
            {typeof executeResult.completionScore === 'number' ? (
              <Text style={styles.metaText}>完成度: {Math.round(executeResult.completionScore * 100)}%</Text>
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
            {executeResult.auditId ? (
              <Text style={styles.metaText}>审计追踪: {executeResult.auditId}</Text>
            ) : null}
            {executeResult.traceId ? (
              <Text style={styles.metaText}>链路追踪: {executeResult.traceId}</Text>
            ) : null}
            {executeResult.workflowRun?.runId ? (
              <View style={styles.stepCard}>
                <Text style={styles.stepDomain}>运行详情</Text>
                <Text style={styles.stepMeta}>Run ID: {executeResult.workflowRun.runId}</Text>
                <Text style={styles.stepMeta}>
                  阻塞原因: {String(executeResult.workflowRun.blockedReason || '无')}
                </Text>
                {executeResult.workflowRun.nextPollAt ? (
                  <Text style={styles.stepMeta}>预计下次轮询: {executeResult.workflowRun.nextPollAt}</Text>
                ) : null}
                {executeResult.workflowRun.lastWorkerAt ? (
                  <Text style={styles.stepMeta}>最近 Worker 处理: {executeResult.workflowRun.lastWorkerAt}</Text>
                ) : null}
                <View style={styles.actionRow}>
                  <Pressable style={styles.secondaryBtn} onPress={refreshRunDetail} disabled={loadingRunDetail}>
                    <Icon name="refresh" size={15} color="#2F2926" />
                    <Text style={styles.secondaryBtnText}>{loadingRunDetail ? '刷新中...' : '刷新详情'}</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryBtn} onPress={retryFailedActions} disabled={loadingExecute}>
                    <Icon name="reload" size={15} color="#2F2926" />
                    <Text style={styles.secondaryBtnText}>{loadingExecute ? '处理中...' : '重试失败步骤'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {toolCallsSummary.length ? (
              <View style={styles.stepCard}>
                <Text style={styles.stepDomain}>MCP 工具调用</Text>
                {toolCallsSummary.map(item => (
                  <Text key={item.id} style={styles.stepMeta}>
                    {item.text}
                  </Text>
                ))}
              </View>
            ) : null}            {runHistory.length ? (
              <View style={styles.stepCard}>
                <Text style={styles.stepDomain}>运行时间线</Text>
                {runHistory
                  .slice()
                  .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
                  .slice(0, 12)
                  .map(item => (
                    <View key={item.id} style={styles.resultCard}>
                      <Text style={styles.resultCardTitle}>
                        {item.type} · {toResultStatusText(item.status || '-')}
                      </Text>
                      <Text style={styles.stepMeta}>{item.message}</Text>
                      <Text style={styles.stepMeta}>{item.createdAt}</Text>
                    </View>
                  ))}
              </View>
            ) : null}
            {executeResult.pageSummary ? (
              <View style={styles.stepCard}>
                <Text style={styles.stepDomain}>当前页摘要</Text>
                <Text style={styles.stepMeta}>{executeResult.pageSummary}</Text>
              </View>
            ) : null}
            {resultCards.length ? (
              <View style={styles.stepCard}>
                <Text style={styles.stepDomain}>结果卡</Text>
                {resultCards.map((card, index) => (
                  <View key={`${card.kind}:${index}`} style={styles.resultCard}>
                    <Text style={styles.resultCardTitle}>
                      {card.title} · {toActionStatusText(card.status)}
                    </Text>
                    <Text style={styles.stepMeta}>{card.summary}</Text>
                    {card.nextAction?.label ? (
                      <Text style={styles.stepMeta}>下一步: {String(card.nextAction.label)}</Text>
                    ) : null}
                    {card.recovery?.label ? (
                      <Text style={styles.stepMeta}>恢复建议: {String(card.recovery.label)}</Text>
                    ) : null}
                  </View>
                ))}
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
  resultCard: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(143,109,96,0.18)',
  },
  resultCardTitle: {
    color: '#2F2926',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
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













