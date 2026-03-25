import {agentApi, type AgentExecuteResponse, type AgentPlanAction, type AgentPlanResponse, type ColorRequestContext} from '../modules/api';
import type {AgentModelingImageContext} from './executionContextStore';

export type AgentClientTab = 'create' | 'model' | 'agent' | 'community';

export interface AgentExecutionContextInput {
  currentTab: AgentClientTab;
  colorContext: ColorRequestContext | null;
  modelingImageContext: AgentModelingImageContext | null;
  latestExecuteResult: AgentExecuteResponse | null;
}

export interface MissingContextGuide {
  operation: 'grading.apply_visual_suggest' | 'convert.start_task';
  targetTab: AgentClientTab;
  message: string;
}

export interface AgentExecuteCycleOptions {
  allowConfirmActions?: boolean;
  actionIds?: string[];
}

export interface AgentGoalCycleOptions extends AgentExecuteCycleOptions {
  inputSource?: 'text' | 'voice';
}

interface AgentExecuteClientHandlers {
  navigateToTab: (tab: AgentClientTab) => void;
  summarizeCurrentPage: () => string;
}

export interface AgentExecuteCycleResult {
  hydratedActions: AgentPlanAction[];
  missingContextGuides: MissingContextGuide[];
  executedActionIds: string[];
  executeResult: AgentExecuteResponse | null;
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

export const resolveDraftIdFromExecuteResult = (result: AgentExecuteResponse | null): string => {
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
    const output = item.output as {draftId?: string | number} | undefined;
    if (output?.draftId !== undefined && output?.draftId !== null) {
      const normalized = String(output.draftId).trim();
      if (normalized) {
        return normalized;
      }
    }
  }
  return '';
};

const pushMissingGuide = (
  guides: MissingContextGuide[],
  next: MissingContextGuide,
): MissingContextGuide[] => {
  if (guides.some(item => item.operation === next.operation)) {
    return guides;
  }
  return [...guides, next];
};

const hydratePlanActions = (
  actions: AgentPlanAction[],
  context: AgentExecutionContextInput,
): {
  hydratedActions: AgentPlanAction[];
  missingContextGuides: MissingContextGuide[];
  missingActionIds: string[];
} => {
  let missingContextGuides: MissingContextGuide[] = [];
  const missingActionIds: string[] = [];
  const latestDraftId = resolveDraftIdFromExecuteResult(context.latestExecuteResult);
  const hydratedActions = actions.map(action => {
    if (action.domain === 'grading' && action.operation === 'apply_visual_suggest') {
      if (hasGradingArgs(action.args)) {
        return action;
      }
      if (!context.colorContext) {
        missingActionIds.push(action.actionId);
        missingContextGuides = pushMissingGuide(missingContextGuides, {
          operation: 'grading.apply_visual_suggest',
          targetTab: 'create',
          message: '缺少调色图片上下文，请先到调色页选择图片。',
        });
        return action;
      }
      return {
        ...action,
        args: {
          locale: context.colorContext.locale,
          currentParams: context.colorContext.currentParams,
          image: context.colorContext.image,
          imageStats: context.colorContext.imageStats,
        },
      };
    }

    if (action.domain === 'convert' && action.operation === 'start_task') {
      if (hasConvertArgs(action.args)) {
        return action;
      }
      if (!context.modelingImageContext?.image) {
        missingActionIds.push(action.actionId);
        missingContextGuides = pushMissingGuide(missingContextGuides, {
          operation: 'convert.start_task',
          targetTab: 'model',
          message: '缺少建模图片上下文，请先到建模页选择图片。',
        });
        return action;
      }
      return {
        ...action,
        args: {
          image: context.modelingImageContext.image,
        },
      };
    }

    if (action.domain === 'community' && action.operation === 'publish_draft') {
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

  return {
    hydratedActions,
    missingContextGuides,
    missingActionIds,
  };
};

const toTabLabel = (tab: AgentClientTab): string => {
  if (tab === 'create') {
    return '调色页';
  }
  if (tab === 'model') {
    return '建模页';
  }
  if (tab === 'community') {
    return '社区页';
  }
  return '助手页';
};

export const buildMissingContextHintText = (guides: MissingContextGuide[]): string => {
  if (!guides.length) {
    return '';
  }
  if (guides.length === 1) {
    return guides[0].message;
  }
  return `执行前缺少上下文：${guides.map(item => item.operation).join('、')}。请先补齐图片后重试。`;
};

const toMissingContextKey = (guide: MissingContextGuide | undefined): string | null => {
  if (!guide) {
    return null;
  }
  if (guide.operation === 'grading.apply_visual_suggest') {
    return 'context.color.image';
  }
  if (guide.operation === 'convert.start_task') {
    return 'context.modeling.image';
  }
  return null;
};

const resolvePendingActionIds = (
  plan: AgentPlanResponse,
  context: AgentExecutionContextInput,
  options?: AgentExecuteCycleOptions,
): string[] => {
  if (Array.isArray(options?.actionIds) && options.actionIds.length > 0) {
    return options.actionIds;
  }
  const latest = context.latestExecuteResult;
  if (!latest || latest.planId !== plan.planId) {
    return plan.actions.map(item => item.actionId);
  }
  const statusByActionId = new Map(
    (latest.actionResults || []).map(item => [item.action.actionId, item.status]),
  );
  const remaining = plan.actions
    .filter(action => {
      const status = statusByActionId.get(action.actionId);
      return status !== 'applied' && status !== 'skipped';
    })
    .map(action => action.actionId);
  return remaining.length > 0 ? remaining : plan.actions.map(item => item.actionId);
};

const resolveNavigationTarget = (args?: Record<string, unknown>): AgentClientTab => {
  const tabRaw = String(args?.tab || args?.mainTab || '').trim().toLowerCase();
  const routeRaw = String(args?.route || args?.homeRoute || '').trim().toLowerCase();

  if (tabRaw === 'community') {
    return 'community';
  }
  if (tabRaw === 'agent' || tabRaw === 'assistant' || tabRaw === 'profile') {
    return 'agent';
  }
  if (tabRaw === 'model') {
    return 'model';
  }
  if (tabRaw === 'create' || tabRaw === 'home') {
    if (routeRaw.includes('model')) {
      return 'model';
    }
    return 'create';
  }
  if (routeRaw.includes('model')) {
    return 'model';
  }
  if (routeRaw.includes('community')) {
    return 'community';
  }
  return 'agent';
};

export const buildCurrentPageSummary = (input: {
  currentTab: AgentClientTab;
  colorContext: ColorRequestContext | null;
  modelingImageContext: AgentModelingImageContext | null;
  latestPlan: AgentPlanResponse | null;
  latestExecuteResult: AgentExecuteResponse | null;
}): string => {
  const tabText = toTabLabel(input.currentTab);
  const pieces: string[] = [`当前页面：${tabText}`];
  if (input.currentTab === 'create') {
    pieces.push(input.colorContext ? '已加载调色图片上下文' : '未加载调色图片上下文');
  }
  if (input.currentTab === 'model') {
    pieces.push(input.modelingImageContext?.image ? '已加载建模图片上下文' : '未加载建模图片上下文');
  }
  if (input.latestPlan) {
    pieces.push(`最近计划步骤数：${input.latestPlan.actions.length}`);
  }
  if (input.latestExecuteResult) {
    pieces.push(`最近执行状态：${input.latestExecuteResult.status}`);
  }
  return pieces.join('；');
};

type ClientActionHandler = (input: {
  item: AgentExecuteResponse['actionResults'][number];
  handlers: AgentExecuteClientHandlers;
}) => {
  status: 'applied' | 'failed';
  message: string;
  errorCode?: string;
  output?: Record<string, unknown>;
  pageSummary?: string;
};

const CLIENT_REQUIRED_HANDLERS: Record<string, ClientActionHandler> = {
  'navigation.navigate_tab': ({item, handlers}) => {
    const targetTab = resolveNavigationTarget(item.action.args);
    handlers.navigateToTab(targetTab);
    return {
      status: 'applied',
      message: `客户端已完成跳转：${toTabLabel(targetTab)}`,
      output: {
        ...(item.output || {}),
        targetTab,
        clientHandled: true,
      },
    };
  },
  'app.summarize_current_page': ({item, handlers}) => {
    const summary = handlers.summarizeCurrentPage().trim();
    if (!summary) {
      return {
        status: 'failed',
        message: '客户端未能生成当前页摘要',
        errorCode: 'tool_error',
      };
    }
    return {
      status: 'applied',
      message: summary,
      output: {
        ...(item.output || {}),
        summary,
        clientHandled: true,
      },
      pageSummary: summary,
    };
  },
};

export const applyClientRequiredActions = (
  result: AgentExecuteResponse,
  handlers: AgentExecuteClientHandlers,
): AgentExecuteResponse => {
  if (!Array.isArray(result.actionResults) || result.actionResults.length === 0) {
    return result;
  }

  const clientHandledActions: NonNullable<AgentExecuteResponse['clientHandledActions']> = [];
  let summaryText = '';
  const actionResults = result.actionResults.map(item => {
    if (item.status !== 'client_required') {
      return item;
    }
    const key = `${item.action.domain}.${item.action.operation}`;
    const handler = CLIENT_REQUIRED_HANDLERS[key];
    if (!handler) {
      return item;
    }
    const handled = handler({item, handlers});
    if (handled.pageSummary) {
      summaryText = handled.pageSummary;
    }
    clientHandledActions.push({
      actionId: item.action.actionId,
      domain: item.action.domain,
      operation: item.action.operation,
      message: handled.message,
      output: handled.output,
    });

    return {
      ...item,
      status: handled.status,
      message: handled.message,
      errorCode: handled.errorCode,
      output: handled.output ?? item.output,
    };
  });

  const hasPendingConfirm = actionResults.some(item => item.status === 'pending_confirm');
  const hasFailed = actionResults.some(item => item.status === 'failed');
  const hasClientRequired = actionResults.some(item => item.status === 'client_required');
  const status: AgentExecuteResponse['status'] = hasPendingConfirm
    ? 'pending_confirm'
    : hasFailed
      ? 'failed'
      : hasClientRequired
        ? 'client_required'
        : 'applied';

  return {
    ...result,
    status,
    actionResults,
    clientHandledActions,
    pageSummary: summaryText || undefined,
  };
};

export const toResultStatusText = (status: AgentExecuteResponse['status']): string => {
  switch (status) {
    case 'applied':
      return '已应用';
    case 'failed':
      return '执行失败';
    case 'pending_confirm':
      return '待确认';
    case 'client_required':
      return '需客户端处理';
    default:
      return status || '-';
  }
};

export const toActionStatusText = (status: string): string => {
  switch (status) {
    case 'applied':
      return '已完成';
    case 'failed':
      return '失败';
    case 'pending_confirm':
      return '待确认';
    case 'client_required':
      return '客户端已处理';
    case 'skipped':
      return '已跳过';
    default:
      return status || '-';
  }
};

const withWorkflowStateHint = (
  result: AgentExecuteResponse,
  hints: {
    nextRequiredContext?: string | null;
    totalSteps?: number;
    currentStep?: number;
  } = {},
): AgentExecuteResponse => {
  const baseState = result.workflowState || {
    currentStep: 0,
    totalSteps: hints.totalSteps || 0,
    nextRequiredContext: null,
  };
  return {
    ...result,
    workflowState: {
      currentStep:
        typeof hints.currentStep === 'number' ? hints.currentStep : baseState.currentStep,
      totalSteps: typeof hints.totalSteps === 'number' ? hints.totalSteps : baseState.totalSteps,
      nextRequiredContext:
        hints.nextRequiredContext !== undefined
          ? hints.nextRequiredContext
          : baseState.nextRequiredContext ?? null,
    },
  };
};

export const executeAgentPlanCycle = async (input: {
  plan: AgentPlanResponse;
  context: AgentExecutionContextInput;
  clientHandlers: AgentExecuteClientHandlers;
  options?: AgentExecuteCycleOptions;
}): Promise<AgentExecuteCycleResult> => {
  const {hydratedActions, missingContextGuides, missingActionIds} = hydratePlanActions(
    input.plan.actions,
    input.context,
  );
  const candidateActionIds = resolvePendingActionIds(
    {
      ...input.plan,
      actions: hydratedActions,
    },
    input.context,
    input.options,
  );
  const actionIndexById = new Map(
    hydratedActions.map((item, index) => [item.actionId, index]),
  );
  let executableActionIds = candidateActionIds;
  if (missingActionIds.length > 0) {
    const firstBlockedIndex = Math.min(
      ...missingActionIds
        .map(actionId => actionIndexById.get(actionId))
        .filter((value): value is number => typeof value === 'number'),
    );
    if (Number.isFinite(firstBlockedIndex)) {
      executableActionIds = candidateActionIds.filter(actionId => {
        const index = actionIndexById.get(actionId);
        return typeof index === 'number' && index < firstBlockedIndex;
      });
    }
  }

  if (executableActionIds.length === 0) {
    return {
      hydratedActions,
      missingContextGuides,
      executedActionIds: [],
      executeResult: null,
    };
  }

  const executeResult = await agentApi.executePlan(input.plan.planId, hydratedActions, {
    actionIds: executableActionIds,
    allowConfirmActions: input.options?.allowConfirmActions === true,
  });
  let normalizedResult = applyClientRequiredActions(executeResult, input.clientHandlers);
  if (missingContextGuides.length > 0) {
    const firstGuide = missingContextGuides[0];
    const nextRequiredContext = toMissingContextKey(firstGuide);
    const blockedIndex = actionIndexById.get(missingActionIds[0]);
    normalizedResult = withWorkflowStateHint(normalizedResult, {
      nextRequiredContext,
      totalSteps: hydratedActions.length,
      currentStep:
        typeof blockedIndex === 'number'
          ? Math.max(1, blockedIndex + 1)
          : normalizedResult.workflowState?.currentStep || 1,
    });
  } else {
    normalizedResult = withWorkflowStateHint(normalizedResult, {
      totalSteps: hydratedActions.length,
    });
  }
  return {
    hydratedActions,
    missingContextGuides,
    executedActionIds: executableActionIds,
    executeResult: normalizedResult,
  };
};

export const runAgentGoalCycle = async (input: {
  goal: string;
  context: AgentExecutionContextInput;
  clientHandlers: AgentExecuteClientHandlers;
  options?: AgentGoalCycleOptions;
}): Promise<{
  plan: AgentPlanResponse;
  cycle: AgentExecuteCycleResult;
}> => {
  const plan = await agentApi.createPlan(
    input.goal,
    input.context.currentTab,
    input.options?.inputSource === 'voice' ? 'voice' : 'text',
  );
  const cycle = await executeAgentPlanCycle({
    plan,
    context: input.context,
    clientHandlers: input.clientHandlers,
    options: input.options,
  });
  return {
    plan,
    cycle,
  };
};
