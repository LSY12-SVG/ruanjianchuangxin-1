import React, {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type {
  AgentExecuteResponse,
  AgentPlanAction,
  AgentPlanResponse,
} from '../../modules/api';

type WorkflowStepState = 'done' | 'active' | 'pending' | 'failed';
type WorkflowAccent = 'light' | 'dark';

interface WorkflowStepItem {
  id: string;
  title: string;
  detail: string;
  state: WorkflowStepState;
}

interface AgentWorkflowProgressProps {
  plan: AgentPlanResponse | null;
  executeResult: AgentExecuteResponse | null;
  actionsOverride?: AgentPlanAction[] | null;
  compact?: boolean;
  accent?: WorkflowAccent;
}

export const toWorkflowRequiredContextLabel = (
  value: string | null | undefined,
): string => {
  if (value === 'context.color.image') {
    return '调色图片';
  }
  if (value === 'context.modeling.image') {
    return '建模图片';
  }
  if (value === 'context.community.draftId') {
    return '社区草稿';
  }
  return value || '';
};

export const toWorkflowActionLabel = (action: AgentPlanAction): string => {
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
  return action.toolMeta?.displayName || `${action.domain}.${action.operation}`;
};

const toStepHeadline = (
  executeResult: AgentExecuteResponse | null,
  totalSteps: number,
): string => {
  if (!executeResult) {
    return totalSteps > 0 ? '计划已生成，等待开始' : '等待开始工作流';
  }
  if (executeResult.status === 'applied') {
    return '工作流已完成';
  }
  if (executeResult.status === 'failed') {
    return '工作流执行失败';
  }
  if (executeResult.status === 'cancelled') {
    return '工作流已取消';
  }
  if (executeResult.status === 'pending_confirm') {
    return '等待确认后继续';
  }
  if (executeResult.status === 'waiting_async_result') {
    return '后台处理中';
  }
  if (executeResult.status === 'client_required') {
    const requiredContext = toWorkflowRequiredContextLabel(
      executeResult.workflowState?.nextRequiredContext,
    );
    return requiredContext ? `等待补充${requiredContext}` : '等待补充上下文';
  }
  return '正在执行工作流';
};

const toActiveStepDetail = (
  executeResult: AgentExecuteResponse | null,
  fallbackMessage: string,
): string => {
  if (!executeResult) {
    return fallbackMessage;
  }
  if (executeResult.status === 'pending_confirm') {
    return '待确认';
  }
  if (executeResult.status === 'waiting_async_result') {
    return '后台处理中';
  }
  if (executeResult.status === 'client_required') {
    const requiredContext = toWorkflowRequiredContextLabel(
      executeResult.workflowState?.nextRequiredContext,
    );
    return requiredContext ? `等待${requiredContext}` : '等待补充上下文';
  }
  return fallbackMessage;
};

const isRecoverablePendingStatus = (status: string | undefined): boolean =>
  status === 'pending_confirm' ||
  status === 'client_required' ||
  status === 'waiting_async_result';

const clampProgress = (value: number): number => Math.max(0, Math.min(100, value));

export const AgentWorkflowProgress: React.FC<AgentWorkflowProgressProps> = ({
  plan,
  executeResult,
  actionsOverride,
  compact = false,
  accent = 'light',
}) => {
  const colors = accent === 'dark'
    ? {
        title: '#FDE9DB',
        detail: 'rgba(255,233,219,0.74)',
        counter: 'rgba(255,233,219,0.82)',
        track: 'rgba(255,204,180,0.16)',
        active: '#F0B48D',
        done: '#7ED5A2',
        pending: 'rgba(255,233,219,0.22)',
        failed: '#FF9D9D',
        card: 'rgba(255,255,255,0.04)',
      }
    : {
        title: '#2F2926',
        detail: 'rgba(110,90,80,0.82)',
        counter: '#A34A3C',
        track: 'rgba(163,74,60,0.12)',
        active: '#C86F54',
        done: '#4EAA78',
        pending: 'rgba(110,90,80,0.18)',
        failed: '#C35B63',
        card: 'rgba(255,255,255,0.72)',
      };

  const workflowData = useMemo(() => {
    const resolvedActions =
      (actionsOverride && actionsOverride.length > 0
        ? actionsOverride
        : plan?.actions?.length
          ? plan.actions
          : executeResult?.actionResults?.map(item => item.action)) || [];
    const resultMap = new Map(
      (executeResult?.actionResults || []).map(item => [item.action.actionId, item]),
    );

    let activeActionId = executeResult?.workflowRun?.waitingActionId || '';
    if (!activeActionId) {
      const pendingResult = (executeResult?.actionResults || []).find(item =>
        isRecoverablePendingStatus(item.status),
      );
      if (pendingResult) {
        activeActionId = pendingResult.action.actionId;
      }
    }
    if (!activeActionId && resolvedActions.length > 0) {
      const rawCurrentStep = Number(executeResult?.workflowState?.currentStep || 0);
      const currentIndex = Math.min(
        Math.max(rawCurrentStep - 1, 0),
        Math.max(resolvedActions.length - 1, 0),
      );
      if (
        executeResult &&
        (executeResult.status === 'pending_confirm' ||
          executeResult.status === 'client_required' ||
          executeResult.status === 'waiting_async_result')
      ) {
        activeActionId = resolvedActions[currentIndex]?.actionId || '';
      }
    }

    const steps: WorkflowStepItem[] = resolvedActions.map(action => {
      const result = resultMap.get(action.actionId);
      if (result?.status === 'failed') {
        return {
          id: action.actionId,
          title: toWorkflowActionLabel(action),
          detail: result.message || '执行失败',
          state: 'failed',
        };
      }
      if (result?.status === 'applied') {
        return {
          id: action.actionId,
          title: toWorkflowActionLabel(action),
          detail: '已完成',
          state: 'done',
        };
      }
      if (
        result &&
        (isRecoverablePendingStatus(result.status) || action.actionId === activeActionId)
      ) {
        return {
          id: action.actionId,
          title: toWorkflowActionLabel(action),
          detail: toActiveStepDetail(executeResult, result.message || '执行中'),
          state: 'active',
        };
      }
      if (action.actionId === activeActionId) {
        return {
          id: action.actionId,
          title: toWorkflowActionLabel(action),
          detail: toActiveStepDetail(executeResult, '执行中'),
          state: 'active',
        };
      }
      return {
        id: action.actionId,
        title: toWorkflowActionLabel(action),
        detail: '待执行',
        state: 'pending',
      };
    });

    const completedCount = steps.filter(item => item.state === 'done').length;
    const totalSteps = steps.length;
    const progressPercent = totalSteps > 0 ? clampProgress((completedCount / totalSteps) * 100) : 0;
    return {
      steps,
      completedCount,
      totalSteps,
      progressPercent,
      headline: toStepHeadline(executeResult, totalSteps),
    };
  }, [actionsOverride, executeResult, plan]);

  if (!plan && !executeResult && workflowData.totalSteps === 0) {
    return null;
  }

  return (
    <View style={[styles.container, compact ? styles.containerCompact : null]}>
      <View style={styles.headerRow}>
        <Text
          numberOfLines={1}
          style={[
            styles.headline,
            compact ? styles.headlineCompact : null,
            {color: colors.title},
          ]}>
          {workflowData.headline}
        </Text>
        <Text
          style={[
            styles.counter,
            compact ? styles.counterCompact : null,
            {color: colors.counter},
          ]}>
          {workflowData.completedCount}/{workflowData.totalSteps || 0}
        </Text>
      </View>
      <View style={[styles.progressTrack, {backgroundColor: colors.track}]}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${workflowData.progressPercent}%`,
              backgroundColor: workflowData.progressPercent >= 100 ? colors.done : colors.active,
            },
          ]}
        />
      </View>
      <View style={styles.steps}>
        {workflowData.steps.map((step, index) => {
          const isDone = step.state === 'done';
          const isActive = step.state === 'active';
          const isFailed = step.state === 'failed';
          const bulletColor = isDone
            ? colors.done
            : isFailed
              ? colors.failed
              : isActive
                ? colors.active
                : colors.pending;
          const iconName = isDone
            ? 'checkmark'
            : isFailed
              ? 'close'
              : isActive
                ? 'ellipse'
                : 'radio-button-off-outline';

          return (
            <View key={step.id} style={styles.stepRow}>
              <View style={styles.rail}>
                <View
                  style={[
                    styles.dot,
                    compact ? styles.dotCompact : null,
                    {
                      backgroundColor: isActive ? colors.card : bulletColor,
                      borderColor: bulletColor,
                    },
                  ]}>
                  <Icon
                    name={iconName}
                    size={compact ? 10 : 12}
                    color={isActive ? bulletColor : '#FFFFFF'}
                  />
                </View>
                {index < workflowData.steps.length - 1 ? (
                  <View
                    style={[
                      styles.connector,
                      compact ? styles.connectorCompact : null,
                      {backgroundColor: isDone ? colors.done : colors.pending},
                    ]}
                  />
                ) : null}
              </View>
              <View
                style={[
                  styles.stepCard,
                  compact ? styles.stepCardCompact : null,
                  {backgroundColor: colors.card},
                ]}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.stepTitle,
                    compact ? styles.stepTitleCompact : null,
                    {color: colors.title},
                  ]}>
                  {step.title}
                </Text>
                <Text
                  numberOfLines={2}
                  style={[
                    styles.stepDetail,
                    compact ? styles.stepDetailCompact : null,
                    {color: step.state === 'failed' ? colors.failed : colors.detail},
                  ]}>
                  {step.detail}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  containerCompact: {
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headline: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  headlineCompact: {
    fontSize: 12,
  },
  counter: {
    fontSize: 11,
    fontWeight: '700',
  },
  counterCompact: {
    fontSize: 10,
  },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  steps: {
    gap: 6,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  rail: {
    width: 18,
    alignItems: 'center',
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  dotCompact: {
    width: 16,
    height: 16,
  },
  connector: {
    marginTop: 4,
    width: 2,
    flex: 1,
    minHeight: 14,
    borderRadius: 999,
  },
  connectorCompact: {
    minHeight: 12,
  },
  stepCard: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  stepCardCompact: {
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  stepTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  stepTitleCompact: {
    fontSize: 11,
  },
  stepDetail: {
    fontSize: 11,
    lineHeight: 15,
  },
  stepDetailCompact: {
    fontSize: 10,
    lineHeight: 14,
  },
});
