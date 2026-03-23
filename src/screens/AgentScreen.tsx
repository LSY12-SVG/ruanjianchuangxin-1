import React, {useMemo, useState} from 'react';
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
  type AgentPlanAction,
  type AgentPlanResponse,
  type ModuleCapabilityItem,
} from '../modules/api';
import {PageHero} from '../components/app/PageHero';
import {HERO_AGENT} from '../assets/design';
import {canvasText, canvasUi, cardSurfaceViolet, glassShadow} from '../theme/canvasDesign';
import {useAgentExecutionContextStore} from '../agent/executionContextStore';

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
}

const hasGradingArgs = (args?: Record<string, unknown>): boolean => {
  if (!args || typeof args !== 'object') {
    return false;
  }
  const image = args.image as Record<string, unknown> | undefined;
  return Boolean(
    typeof args.locale === 'string' &&
      args.locale &&
      args.currentParams &&
      image &&
      typeof image.mimeType === 'string' &&
      image.mimeType &&
      Number.isFinite(Number(image.width)) &&
      Number.isFinite(Number(image.height)) &&
      typeof image.base64 === 'string' &&
      image.base64,
  );
};

const hasConvertArgs = (args?: Record<string, unknown>): boolean => {
  if (!args || typeof args !== 'object') {
    return false;
  }
  const image = args.image as Record<string, unknown> | undefined;
  return Boolean(
    image &&
      typeof image.mimeType === 'string' &&
      image.mimeType &&
      typeof image.fileName === 'string' &&
      image.fileName &&
      typeof image.base64 === 'string' &&
      image.base64,
  );
};

const resolveDraftIdFromExecuteResult = (
  result: AgentExecuteResponse | null,
): string => {
  if (!result || !Array.isArray(result.actionResults)) {
    return '';
  }
  for (const item of result.actionResults) {
    if (
      item.status !== 'applied' ||
      item.action?.domain !== 'community' ||
      item.action?.operation !== 'create_draft'
    ) {
      continue;
    }
    const output = item.output as
      | {
          draftId?: string | number;
        }
      | undefined;
    if (output?.draftId !== undefined && output?.draftId !== null) {
      const normalized = String(output.draftId).trim();
      if (normalized) {
        return normalized;
      }
    }
  }
  return '';
};

export const AgentScreen: React.FC<AgentScreenProps> = ({capabilities}) => {
  const [prompt, setPrompt] = useState('');
  const [plan, setPlan] = useState<AgentPlanResponse | null>(null);
  const [executeResult, setExecuteResult] = useState<AgentExecuteResponse | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [loadingExecute, setLoadingExecute] = useState(false);
  const [errorText, setErrorText] = useState('');
  const colorContext = useAgentExecutionContextStore(state => state.colorContext);
  const modelingImageContext = useAgentExecutionContextStore(
    state => state.modelingImageContext,
  );

  const agentCapability = capabilities.find(item => item.module === 'agent');

  const planStatusText = useMemo(() => {
    if (!plan) {
      return '等待生成计划';
    }
    return `${plan.estimatedSteps} steps · ${plan.plannerSource}`;
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

  const createPlan = async () => {
    if (!prompt.trim()) {
      setErrorText('请输入任务目标');
      return;
    }
    try {
      setLoadingPlan(true);
      setErrorText('');
      setExecuteResult(null);
      const nextPlan = await agentApi.createPlan(prompt.trim());
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
    const missingContextActions: string[] = [];
    const hydratedActions: AgentPlanAction[] = plan.actions.map(action => {
      if (action.domain === 'grading' && action.operation === 'apply_visual_suggest') {
        if (hasGradingArgs(action.args)) {
          return action;
        }
        if (!colorContext) {
          missingContextActions.push('grading.apply_visual_suggest');
          return action;
        }
        return {
          ...action,
          args: {
            locale: colorContext.locale,
            currentParams: colorContext.currentParams,
            image: colorContext.image,
            imageStats: colorContext.imageStats,
          },
        };
      }
      if (action.domain === 'convert' && action.operation === 'start_task') {
        if (hasConvertArgs(action.args)) {
          return action;
        }
        if (!modelingImageContext?.image) {
          missingContextActions.push('convert.start_task');
          return action;
        }
        return {
          ...action,
          args: {
            image: modelingImageContext.image,
          },
        };
      }
      return action;
    });
    const pendingActionIds =
      executeResult?.status === 'pending_confirm'
        ? executeResult.actionResults
            .filter(item => item.status === 'pending_confirm')
            .map(item => item.action.actionId)
        : [];
    const allowConfirmActions = pendingActionIds.length > 0;
    const latestDraftId = resolveDraftIdFromExecuteResult(executeResult);
    const executeActions: AgentPlanAction[] = hydratedActions.map(action => {
      if (
        allowConfirmActions &&
        action.domain === 'community' &&
        action.operation === 'publish_draft'
      ) {
        const args = action.args && typeof action.args === 'object' ? action.args : {};
        const draftIdRaw = (args as {draftId?: string | number}).draftId;
        const hasDraftId =
          draftIdRaw !== undefined && draftIdRaw !== null && String(draftIdRaw).trim().length > 0;
        if (!hasDraftId && latestDraftId) {
          return {
            ...action,
            args: {
              ...args,
              draftId: latestDraftId,
            },
          };
        }
      }
      return action;
    });

    try {
      setLoadingExecute(true);
      if (missingContextActions.length) {
        setErrorText(
          `执行上下文缺失：${missingContextActions.join(
            ', ',
          )}。请先在创作/建模页选择图片后重试。`,
        );
      } else {
        setErrorText('');
      }
      setPlan(prev => (prev ? {...prev, actions: executeActions} : prev));
      const result = await agentApi.executePlan(plan.planId, executeActions, {
        actionIds: pendingActionIds.length ? pendingActionIds : undefined,
        allowConfirmActions,
      });
      setExecuteResult(result);
    } catch (error) {
      setErrorText(formatApiErrorMessage(error, '计划执行失败'));
    } finally {
      setLoadingExecute(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <PageHero
        image={HERO_AGENT}
        title="AI Agent"
        subtitle="plan → review → execute"
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
                  <Text style={styles.stepDomain}>{action.domain}</Text>
                  <Text style={styles.stepOp}>{action.operation}</Text>
                </View>
                <Text style={styles.stepMeta}>
                  risk: {action.riskLevel} | confirm: {action.requiresConfirmation ? 'yes' : 'no'}
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
            <Text style={styles.metaText}>status: {executeResult.status}</Text>
            {executeResult.actionResults.map(result => (
              <View key={result.action.actionId} style={styles.stepCard}>
                <Text style={styles.stepDomain}>
                  {result.action.domain} · {result.action.operation}
                </Text>
                <Text style={styles.stepMeta}>
                  {result.status} {result.errorCode ? `(${result.errorCode})` : ''}
                </Text>
                <Text style={styles.stepMeta}>{result.message}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.metaText}>等待执行</Text>
        )}
        {errorText ? <Text style={styles.errorText}>错误: {errorText}</Text> : null}
        <Text style={styles.metaText}>
          strictMode: {agentCapability?.strictMode ? 'ON' : 'UNKNOWN'} | auth:{' '}
          {agentCapability?.auth?.required ? 'JWT' : 'none'}
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

