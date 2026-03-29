import {
  agentApi,
  modelingApi,
  type AgentExecuteResponse,
  type AgentPlanAction,
  type AgentPlanResponse,
  type ClientPermissionKey,
  type AgentWorkflowRunState,
  type ColorRequestContext,
} from '../modules/api';
import type {AgentModelingImageContext} from './executionContextStore';
import {useAgentExecutionContextStore} from './executionContextStore';
import {useAgentWorkflowContinuationStore} from './workflowContinuationStore';
import {
  ensureClientPermissions,
  getClientPermissionLabel,
  openClientPermissionSettings,
  requestClientPermission,
} from '../permissions/clientPermissionBroker';
import {pickImageFromGallery, type ImagePickerResult} from '../hooks/useImagePicker';
import {defaultColorGradingParams} from '../types/colorGrading';
import {requestAgentLogin} from './authPromptStore';
import {saveRemoteFile} from '../native/fileTransfer';

export type AgentClientTab = 'create' | 'model' | 'agent' | 'community';
export type AgentExecutionStrategy = 'adaptive' | 'fast' | 'quality' | 'cost';

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
  requiredDevicePermissions?: ClientPermissionKey[];
}

export interface AgentExecuteCycleOptions {
  allowConfirmActions?: boolean;
  actionIds?: string[];
  executionStrategy?: AgentExecutionStrategy;
}

export interface AgentGoalCycleOptions extends AgentExecuteCycleOptions {
  inputSource?: 'text' | 'voice';
}

const toBackendExecutionStrategy = (value?: AgentExecutionStrategy): 'fast' | 'quality' | 'cost' | undefined => {
  if (!value || value === 'adaptive') {
    return undefined;
  }
  return value;
};

interface AgentExecuteClientHandlers {
  navigateToTab: (tab: AgentClientTab) => void;
  summarizeCurrentPage: () => string;
}

const buildResumeContextPatch = (
  context: Pick<AgentExecutionContextInput, 'colorContext' | 'modelingImageContext'>,
) => {
  const resolvedContext = resolveSharedExecutionContexts(context);
  const patch: {
    colorContext?: AgentExecutionContextInput['colorContext'];
    modelingImageContext?: AgentExecutionContextInput['modelingImageContext'];
  } = {};
  if (resolvedContext.colorContext?.image?.base64) {
    patch.colorContext = resolvedContext.colorContext;
  }
  if (resolvedContext.modelingImageContext?.image?.base64) {
    patch.modelingImageContext = resolvedContext.modelingImageContext;
  }
  return Object.keys(patch).length > 0 ? patch : undefined;
};

export interface AgentExecuteCycleResult {
  hydratedActions: AgentPlanAction[];
  missingContextGuides: MissingContextGuide[];
  executedActionIds: string[];
  executeResult: AgentExecuteResponse | null;
}

const WAITING_WORKFLOW_RUN_STATUSES = new Set<NonNullable<AgentWorkflowRunState['status']>>([
  'waiting_context',
  'waiting_async_result',
  'waiting_confirm',
  'running',
]);

const buildExecuteIdempotencyKey = (input: {
  planId: string;
  actionIds: string[];
  allowConfirmActions: boolean;
  latestExecutionId: string;
}): string => {
  const mode = input.allowConfirmActions ? 'confirm' : 'auto';
  const actionIds = input.actionIds.join(',');
  const seed = input.latestExecutionId || 'root';
  return `${input.planId}:${mode}:${actionIds}:${seed}`;
};

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
  const resolvedContext = resolveSharedExecutionContexts(context);
  let missingContextGuides: MissingContextGuide[] = [];
  const missingActionIds: string[] = [];
  const latestDraftId = resolveDraftIdFromExecuteResult(context.latestExecuteResult);
  const hydratedActions = actions.map(action => {
    if (action.domain === 'grading' && action.operation === 'apply_visual_suggest') {
      if (hasGradingArgs(action.args)) {
        return action;
      }
      if (!resolvedContext.colorContext) {
        missingActionIds.push(action.actionId);
        missingContextGuides = pushMissingGuide(missingContextGuides, {
          operation: 'grading.apply_visual_suggest',
          targetTab: 'create',
          message: '缺少调色图片上下文，已为你跳转到调色页。请上传图片后将自动继续工作流。',
          requiredDevicePermissions: action.toolMeta?.requiredDevicePermissions || ['photo_library'],
        });
        return action;
      }
      return {
        ...action,
        args: {
          locale: resolvedContext.colorContext.locale,
          currentParams: resolvedContext.colorContext.currentParams,
          image: resolvedContext.colorContext.image,
          imageStats: resolvedContext.colorContext.imageStats,
        },
      };
    }

    if (action.domain === 'convert' && action.operation === 'start_task') {
      if (hasConvertArgs(action.args)) {
        return action;
      }
      if (!resolvedContext.modelingImageContext?.image) {
        missingActionIds.push(action.actionId);
        missingContextGuides = pushMissingGuide(missingContextGuides, {
          operation: 'convert.start_task',
          targetTab: 'model',
          message: '缺少建模图片上下文，已为你跳转到建模页。请上传图片后将自动继续工作流。',
          requiredDevicePermissions: action.toolMeta?.requiredDevicePermissions || ['photo_library'],
        });
        return action;
      }
      return {
        ...action,
        args: {
          image: resolvedContext.modelingImageContext.image,
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
  return `执行前缺少上下文：${guides.map(item => item.operation).join('、')}。请上传图片后自动继续工作流。`;
};

export const areMissingContextGuidesResolved = (
  guides: MissingContextGuide[],
  context: Pick<AgentExecutionContextInput, 'colorContext' | 'modelingImageContext'>,
): boolean => {
  if (!guides.length) {
    return false;
  }
  const resolvedContext = resolveSharedExecutionContexts(context);
  return guides.every(guide => {
    if (guide.operation === 'grading.apply_visual_suggest') {
      return Boolean(resolvedContext.colorContext?.image?.base64);
    }
    if (guide.operation === 'convert.start_task') {
      return Boolean(resolvedContext.modelingImageContext?.image?.base64);
    }
    return true;
  });
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

const persistPendingWorkflow = async (input: {
  plan: AgentPlanResponse;
  hydratedActions: AgentPlanAction[];
  missingContextGuides: MissingContextGuide[];
  latestExecuteResult: AgentExecuteResponse | null;
}): Promise<void> => {
  const workflowRun = input.latestExecuteResult?.workflowRun || null;
  const shouldPersist =
    input.missingContextGuides.length > 0 ||
    (workflowRun?.status ? WAITING_WORKFLOW_RUN_STATUSES.has(workflowRun.status) : false);
  if (!shouldPersist) {
    useAgentWorkflowContinuationStore.getState().clearPendingWorkflow();
    return;
  }
  useAgentWorkflowContinuationStore.getState().setPendingWorkflow({
    plan: {
      ...input.plan,
      actions: input.hydratedActions,
    },
      latestExecuteResult: input.latestExecuteResult,
      missingContextGuides: input.missingContextGuides,
      workflowRun,
  });
  if (
    input.missingContextGuides.length > 0 &&
    input.latestExecuteResult &&
    workflowRun?.status === 'waiting_context'
  ) {
    try {
      const registered = await agentApi.registerWorkflowRun({
        planId: input.plan.planId,
        actions: input.hydratedActions,
        latestExecuteResult: input.latestExecuteResult,
        runId: workflowRun.runId,
      });
      useAgentWorkflowContinuationStore.getState().setPendingWorkflow({
        plan: {
          ...input.plan,
          actions: input.hydratedActions,
        },
        latestExecuteResult: registered,
        missingContextGuides: input.missingContextGuides,
        workflowRun: registered.workflowRun || null,
      });
    } catch {
      // fall back to local pending workflow if registration fails
    }
  }
};

const buildBlockedExecutionResult = (input: {
  planId: string;
  hydratedActions: AgentPlanAction[];
  missingActionIds: string[];
  missingContextGuides: MissingContextGuide[];
}): AgentExecuteResponse => {
  const actionById = new Map(input.hydratedActions.map(item => [item.actionId, item]));
  const operationMessageMap = new Map(
    input.missingContextGuides.map(item => [item.operation, item.message]),
  );
  const actionResults = input.missingActionIds
    .map(actionId => actionById.get(actionId))
    .filter((item): item is AgentPlanAction => Boolean(item))
    .map(action => {
      const operationKey = `${action.domain}.${action.operation}` as MissingContextGuide['operation'];
      return {
        status: 'client_required',
        message: operationMessageMap.get(operationKey) || '缺少上下文，请补齐后继续执行。',
        errorCode: 'client_required',
        action,
      };
    });
  const blockedIndex = input.hydratedActions.findIndex(action =>
    input.missingActionIds.includes(action.actionId),
  );

  return {
    executionId: `blocked_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    planId: input.planId,
    status: 'client_required',
    workflowRun: {
      runId: `blocked_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      status: 'waiting_context',
      currentStep: blockedIndex >= 0 ? blockedIndex + 1 : 1,
      totalSteps: input.hydratedActions.length,
      nextRequiredContext: toMissingContextKey(input.missingContextGuides[0]),
      blockedReason: 'waiting_context',
      updatedAt: new Date().toISOString(),
      waitingActionId: input.missingActionIds[0] || null,
      pendingTask: null,
    },
    actionResults,
    workflowState: {
      currentStep: blockedIndex >= 0 ? blockedIndex + 1 : 1,
      totalSteps: input.hydratedActions.length,
      nextRequiredContext: toMissingContextKey(input.missingContextGuides[0]),
    },
    resultCards: input.missingContextGuides.map(guide => ({
      kind: 'context_required',
      title: guide.targetTab === 'model' ? '需要建模图片' : '需要调色图片',
      summary: guide.message,
      status: 'client_required',
      nextAction: {
        type: 'navigate',
        tab: guide.targetTab,
        label: guide.targetTab === 'model' ? '去建模页补图' : '去调色页补图',
      },
    })),
  };
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

const normalizePermissionKeys = (value: unknown): ClientPermissionKey[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value.filter(
        (item): item is ClientPermissionKey =>
          typeof item === 'string' &&
          [
            'photo_library',
            'photo_library_write',
            'camera',
            'microphone',
            'notifications',
            'auth_session',
            'file_read',
            'file_write',
            'system_settings',
          ].includes(item),
      ),
    ),
  );
};

const resolveRequestedPermissions = (action: AgentPlanAction): ClientPermissionKey[] => {
  const explicitPermissions = normalizePermissionKeys(action.args?.permissions);
  if (explicitPermissions.length > 0) {
    return explicitPermissions;
  }
  if (typeof action.args?.permission === 'string') {
    return normalizePermissionKeys([action.args.permission]);
  }
  return Array.isArray(action.toolMeta?.requiredDevicePermissions)
    ? Array.from(new Set(action.toolMeta.requiredDevicePermissions))
    : [];
};

const inferFilePickTarget = (
  item: AgentExecuteResponse['actionResults'][number],
): AgentClientTab => {
  const action = item.action;
  const args = action.args || {};
  const output = item.output || {};
  const requiredContext = Array.isArray(action.toolMeta?.requiredContext)
    ? action.toolMeta.requiredContext
    : [];
  const raw = [
    args.target,
    args.context,
    args.usage,
    args.tab,
    args.route,
    output.target,
    output.nextRequiredContext,
    ...requiredContext,
  ]
    .map(value => String(value || '').trim().toLowerCase())
    .join(' ');
  if (
    raw.includes('context.modeling.image') ||
    raw.includes('model') ||
    raw.includes('3d') ||
    raw.includes('convert')
  ) {
    return 'model';
  }
  return 'create';
};

const cloneDefaultColorParams = () => ({
  basic: {...defaultColorGradingParams.basic},
  colorBalance: {...defaultColorGradingParams.colorBalance},
  pro: {
    curves: {
      master: [...defaultColorGradingParams.pro.curves.master],
      r: [...defaultColorGradingParams.pro.curves.r],
      g: [...defaultColorGradingParams.pro.curves.g],
      b: [...defaultColorGradingParams.pro.curves.b],
    },
    wheels: {
      shadows: {...defaultColorGradingParams.pro.wheels.shadows},
      midtones: {...defaultColorGradingParams.pro.wheels.midtones},
      highlights: {...defaultColorGradingParams.pro.wheels.highlights},
    },
  },
});

const createModelingImageContext = (input: {
  mimeType?: string;
  fileName?: string;
  base64?: string;
  width?: number;
  height?: number;
}): AgentModelingImageContext | null => {
  const base64 = String(input.base64 || '').trim();
  const mimeType = String(input.mimeType || '').trim();
  if (!base64 || !mimeType) {
    return null;
  }
  const width = Number(input.width || 0);
  const height = Number(input.height || 0);
  return {
    image: {
      mimeType,
      fileName: String(input.fileName || '').trim() || 'agent-shared-image.jpg',
      base64,
      width: width > 0 ? width : undefined,
      height: height > 0 ? height : undefined,
    },
  };
};

const createColorContextFromImage = (result: {
  base64?: string;
  type?: string;
  width?: number;
  height?: number;
}): ColorRequestContext | null => {
  if (!result.base64 || !result.type || !result.width || !result.height) {
    return null;
  }
  return {
    locale: 'zh-CN',
    currentParams: cloneDefaultColorParams(),
    image: {
      mimeType: result.type,
      width: result.width,
      height: result.height,
      base64: result.base64,
    },
    imageStats: {
      lumaMean: 0,
      lumaStd: 0,
      highlightClipPct: 0,
      shadowClipPct: 0,
      saturationMean: 0,
      skinPct: 0,
      skyPct: 0,
      greenPct: 0,
    },
  };
};

const createModelingImageContextFromImageResult = (
  result: Pick<ImagePickerResult, 'type' | 'fileName' | 'base64' | 'width' | 'height'>,
): AgentModelingImageContext | null =>
  createModelingImageContext({
    mimeType: result.type,
    fileName: result.fileName,
    base64: result.base64,
    width: result.width,
    height: result.height,
  });

const createModelingImageContextFromColorContext = (
  colorContext: ColorRequestContext | null,
): AgentModelingImageContext | null => {
  const image = colorContext?.image;
  if (!image?.base64) {
    return null;
  }
  return createModelingImageContext({
    mimeType: image.mimeType,
    fileName: 'agent-shared-image.jpg',
    base64: image.base64,
    width: image.width,
    height: image.height,
  });
};

const createColorContextFromModelingImageContext = (
  modelingImageContext: AgentModelingImageContext | null,
): ColorRequestContext | null => {
  const image = modelingImageContext?.image;
  if (!image?.base64 || !image?.mimeType || !image?.width || !image?.height) {
    return null;
  }
  return createColorContextFromImage({
    base64: image.base64,
    type: image.mimeType,
    width: image.width,
    height: image.height,
  });
};

const resolveSharedExecutionContexts = (
  context: Pick<AgentExecutionContextInput, 'colorContext' | 'modelingImageContext'>,
): Pick<AgentExecutionContextInput, 'colorContext' | 'modelingImageContext'> => {
  const colorContext =
    context.colorContext || createColorContextFromModelingImageContext(context.modelingImageContext);
  const modelingImageContext =
    context.modelingImageContext || createModelingImageContextFromColorContext(context.colorContext);
  return {
    colorContext,
    modelingImageContext,
  };
};

const resolveActionFileUrl = (item: AgentExecuteResponse['actionResults'][number]): string => {
  const candidates = [
    item.output?.downloadUrl,
    item.output?.previewUrl,
    item.output?.url,
    item.action.args?.downloadUrl,
    item.action.args?.previewUrl,
    item.action.args?.url,
  ];
  const viewerFileUrl = Array.isArray(item.output?.viewerFiles)
    ? String((item.output?.viewerFiles as Array<{url?: string}>)[0]?.url || '')
    : '';
  for (const candidate of [...candidates, viewerFileUrl]) {
    const normalized = String(candidate || '').trim();
    if (normalized) {
      return normalized;
    }
  }
  return '';
};

type ClientActionHandler = (input: {
  item: AgentExecuteResponse['actionResults'][number];
  handlers: AgentExecuteClientHandlers;
}) => Promise<{
  status: 'applied' | 'failed' | 'client_required';
  message: string;
  errorCode?: string;
  output?: Record<string, unknown>;
  pageSummary?: string;
}>;

const CLIENT_REQUIRED_HANDLERS: Record<string, ClientActionHandler> = {
  'navigation.navigate_tab': async ({item, handlers}) => {
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
  'app.summarize_current_page': async ({item, handlers}) => {
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
  'permission.request': async ({item}) => {
    const requestedPermissions = resolveRequestedPermissions(item.action);
    if (requestedPermissions.length === 0) {
      return {
        status: 'applied',
        message: '客户端无需额外授权',
        output: {
          ...(item.output || {}),
          clientHandled: true,
          permissions: [],
        },
      };
    }
    const permissionResult = await ensureClientPermissions(requestedPermissions);
    if (permissionResult.granted) {
      return {
        status: 'applied',
        message: `已完成客户端授权：${requestedPermissions
          .map(getClientPermissionLabel)
          .join('、')}`,
        output: {
          ...(item.output || {}),
          clientHandled: true,
          permissions: requestedPermissions,
          permissionResults: permissionResult.results,
        },
      };
    }
    const denied = permissionResult.firstDenied;
    return {
      status: 'client_required',
      message:
        denied?.message ||
        `仍缺少客户端权限：${requestedPermissions.map(getClientPermissionLabel).join('、')}`,
      errorCode: denied?.errorCode || 'client_required',
      output: {
        ...(item.output || {}),
        clientHandled: true,
        permissions: requestedPermissions,
        permissionResults: permissionResult.results,
        canOpenSettings: denied?.canOpenSettings || false,
      },
    };
  },
  'auth.require_login': async ({item, handlers}) => {
    const authResult = await requestClientPermission('auth_session');
    if (authResult.granted) {
      return {
        status: 'applied',
        message: '当前账号已具备登录态，可继续执行任务。',
        output: {
          ...(item.output || {}),
          clientHandled: true,
          authenticated: true,
        },
      };
    }
    handlers.navigateToTab('agent');
    const didLogin = await requestAgentLogin(authResult.message);
    if (didLogin) {
      return {
        status: 'applied',
        message: '已完成登录，当前任务将继续执行。',
        output: {
          ...(item.output || {}),
          clientHandled: true,
          authenticated: true,
          resumed: true,
        },
      };
    }
    return {
      status: 'client_required',
      message: authResult.message || '需要先登录账号后再继续当前任务。',
      errorCode: authResult.errorCode || 'client_required',
      output: {
        ...(item.output || {}),
        clientHandled: true,
        authenticated: false,
        permission: 'auth_session',
        targetTab: 'agent',
      },
    };
  },
  'file.pick': async ({item, handlers}) => {
    const targetTab = inferFilePickTarget(item);
    const picked = await pickImageFromGallery();
    if (!picked.success) {
      return {
        status: 'client_required',
        message: picked.error || '文件选择未完成，请重新选择图片后继续。',
        errorCode: picked.errorCode || 'client_required',
        output: {
          ...(item.output || {}),
          clientHandled: true,
          targetTab,
          permissionState: picked.permissionState,
        },
      };
    }
    const executionContextStore = useAgentExecutionContextStore.getState();
    const colorContext = createColorContextFromImage(picked);
    const modelingImageContext = createModelingImageContextFromImageResult(picked);
    if (colorContext && !executionContextStore.colorContext?.image?.base64) {
      executionContextStore.setColorContext(colorContext);
    }
    if (modelingImageContext && !executionContextStore.modelingImageContext?.image?.base64) {
      executionContextStore.setModelingImageContext(modelingImageContext);
    }
    handlers.navigateToTab(targetTab);
    return {
      status: 'applied',
      message: targetTab === 'model' ? '已完成建模图片选择。' : '已完成调色图片选择。',
      output: {
        ...(item.output || {}),
        clientHandled: true,
        targetTab,
        fileName: picked.fileName,
        mimeType: picked.type,
      },
    };
  },
  'file.write': async ({item}) => {
    const mimeType = String(item.output?.mimeType || item.action.args?.mimeType || '').trim();
    const targetRaw = String(item.action.args?.target || item.output?.target || '').trim();
    const target =
      targetRaw === 'photos' || targetRaw === 'documents' || targetRaw === 'downloads'
        ? targetRaw
        : mimeType.startsWith('image/')
          ? 'photos'
          : 'downloads';
    const permissionKeys: ClientPermissionKey[] =
      target === 'photos' ? ['file_write', 'photo_library_write'] : ['file_write'];
    const writePermission = await ensureClientPermissions(permissionKeys);
    const url = resolveActionFileUrl(item);
    if (!writePermission.granted) {
      return {
        status: 'client_required',
        message:
          writePermission.firstDenied?.message ||
          `${permissionKeys.map(getClientPermissionLabel).join('、')} 权限未完成授权。`,
        errorCode: writePermission.firstDenied?.errorCode || 'client_required',
        output: {
          ...(item.output || {}),
          clientHandled: true,
          permissions: permissionKeys,
        },
      };
    }
    if (!url) {
      return {
        status: 'failed',
        message: '当前没有可写回或可导出的文件地址。',
        errorCode: 'tool_error',
      };
    }
    const saveResult = await saveRemoteFile({
      url,
      fileName:
        String(item.output?.fileName || item.action.args?.fileName || '').trim() || undefined,
      mimeType: mimeType || undefined,
      target,
    });
    return {
      status: 'applied',
      message:
        saveResult.savedTo === 'photos'
          ? '已保存到系统相册。'
          : saveResult.savedTo === 'documents'
            ? '已保存到应用文档目录。'
            : '已保存到系统下载目录。',
      output: {
        ...(item.output || {}),
        clientHandled: true,
        url,
        savedUri: saveResult.uri,
        savedTo: saveResult.savedTo,
        fileName: saveResult.fileName,
      },
    };
  },
  'settings.open': async ({item}) => {
    await openClientPermissionSettings();
    return {
      status: 'applied',
      message: item.action.args?.target === 'notifications' ? '已打开系统设置，请完成通知授权后返回应用。' : '已打开系统设置，请完成所需操作后返回应用。',
      output: {
        ...(item.output || {}),
        clientHandled: true,
        target: item.action.args?.target || 'system',
      },
    };
  },
};

export const applyClientRequiredActions = async (
  result: AgentExecuteResponse,
  handlers: AgentExecuteClientHandlers,
): Promise<AgentExecuteResponse> => {
  if (!Array.isArray(result.actionResults) || result.actionResults.length === 0) {
    return result;
  }

  const clientHandledActions: NonNullable<AgentExecuteResponse['clientHandledActions']> = [];
  let summaryText = '';
  const actionResults = await Promise.all(result.actionResults.map(async item => {
    if (item.status !== 'client_required') {
      return item;
    }
    const key = `${item.action.domain}.${item.action.operation}`;
    const handler = CLIENT_REQUIRED_HANDLERS[key];
    if (!handler) {
      return item;
    }
    const handled = await handler({item, handlers});
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
  }));

  const hasPendingConfirm = actionResults.some(item => item.status === 'pending_confirm');
  const hasFailed = actionResults.some(item => item.status === 'failed');
  const hasClientRequired = actionResults.some(item => item.status === 'client_required');
  const hasWaitingAsync = actionResults.some(item => item.status === 'waiting_async_result');
  const status: AgentExecuteResponse['status'] = hasPendingConfirm
    ? 'pending_confirm'
    : hasWaitingAsync
      ? 'waiting_async_result'
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
    workflowRun: result.workflowRun
      ? {
          ...result.workflowRun,
          status:
            status === 'pending_confirm'
              ? 'waiting_confirm'
              : status === 'client_required'
                ? 'waiting_context'
                : status === 'waiting_async_result'
                  ? 'waiting_async_result'
                  : status === 'failed'
                    ? 'failed'
                    : 'succeeded',
          updatedAt: new Date().toISOString(),
        }
      : result.workflowRun,
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
    case 'waiting_async_result':
      return '后台处理中';
    case 'cancelled':
      return '已取消';
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
    case 'cancelled':
      return '已取消';
    case 'pending_confirm':
      return '待确认';
    case 'client_required':
      return '客户端已处理';
    case 'waiting_async_result':
      return '后台处理中';
    case 'blocked':
      return '等待前置步骤';
    case 'skipped':
      return '已跳过';
    default:
      return status || '-';
  }
};

export const toWorkflowRunStatusText = (
  status: AgentWorkflowRunState['status'] | null | undefined,
): string => {
  switch (status) {
    case 'queued':
      return '已排队';
    case 'running':
      return '执行中';
    case 'waiting_context':
      return '等待补充上下文';
    case 'waiting_confirm':
      return '等待确认';
    case 'waiting_async_result':
      return '后台处理中';
    case 'succeeded':
      return '已完成';
    case 'failed':
      return '失败';
    case 'cancelled':
      return '已取消';
    case 'partial_succeeded':
      return '部分完成';
    default:
      return status || '-';
  }
};

export const buildExecuteStatusPresentation = (result: AgentExecuteResponse): {
  statusLine: string;
  assistantReply: string;
} => {
  const nextLabel =
    typeof result.nextAction?.label === 'string' && result.nextAction.label.trim()
      ? result.nextAction.label.trim()
      : '';
  const summaryDone = result.resultSummary?.done || '';
  const summaryNext = result.resultSummary?.next || '';
  if (result.status === 'pending_confirm') {
    return {
      statusLine: '已执行可用步骤，等待确认。',
      assistantReply: nextLabel
        ? `我已完成可执行步骤，下一步请${nextLabel}。`
        : '我已完成可执行步骤，下一步请确认后继续。',
    };
  }
  if (result.status === 'waiting_async_result') {
    return {
      statusLine: '长任务已进入后台处理。',
      assistantReply: nextLabel
        ? `任务已进入后台处理，下一步请${nextLabel}。`
        : '任务已进入后台处理，我会继续自动续跑。',
    };
  }
  if (result.status === 'client_required') {
    return {
      statusLine: '需要补齐上下文或权限。',
      assistantReply: nextLabel
        ? `当前仍需客户端动作，下一步请${nextLabel}。`
        : summaryNext || '当前仍需客户端动作，完成后将自动续跑。',
    };
  }
  if (result.status === 'failed') {
    return {
      statusLine: '执行未完成。',
      assistantReply: nextLabel
        ? `执行未完成，建议先${nextLabel}。`
        : summaryNext || '执行未完成，可重试或补齐上下文后继续。',
    };
  }
  return {
    statusLine: '执行完成。',
    assistantReply: summaryDone ? `${summaryDone}${summaryNext ? ` ${summaryNext}` : ''}` : '执行完成。',
  };
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
    workflowRun: result.workflowRun
      ? {
          ...result.workflowRun,
          currentStep:
            typeof hints.currentStep === 'number'
              ? hints.currentStep
              : result.workflowRun.currentStep,
          totalSteps:
            typeof hints.totalSteps === 'number'
              ? hints.totalSteps
              : result.workflowRun.totalSteps,
          nextRequiredContext:
            hints.nextRequiredContext !== undefined
              ? hints.nextRequiredContext
              : result.workflowRun.nextRequiredContext ?? null,
          updatedAt: new Date().toISOString(),
        }
      : result.workflowRun,
  };
};

const mergeExecuteResults = (
  base: AgentExecuteResponse,
  next: AgentExecuteResponse,
): AgentExecuteResponse => {
  const byActionId = new Map(
    (Array.isArray(base.actionResults) ? base.actionResults : []).map(item => [item.action.actionId, item]),
  );
  for (const item of Array.isArray(next.actionResults) ? next.actionResults : []) {
    byActionId.set(item.action.actionId, item);
  }
  const mergedResults = Array.from(byActionId.values());
  const hasPendingConfirm = mergedResults.some(item => item.status === 'pending_confirm');
  const hasWaitingAsync = mergedResults.some(item => item.status === 'waiting_async_result');
  const hasFailed = mergedResults.some(item => item.status === 'failed');
  const hasClientRequired = mergedResults.some(item => item.status === 'client_required');
  const mergedStatus: AgentExecuteResponse['status'] = hasPendingConfirm
    ? 'pending_confirm'
    : hasWaitingAsync
      ? 'waiting_async_result'
      : hasFailed
        ? 'failed'
        : hasClientRequired
          ? 'client_required'
          : 'applied';
  return {
    ...base,
    ...next,
    status: mergedStatus,
    actionResults: mergedResults,
    toolCalls: [...(base.toolCalls || []), ...(next.toolCalls || [])],
    clientHandledActions: [
      ...(base.clientHandledActions || []),
      ...(next.clientHandledActions || []),
    ],
    pageSummary: next.pageSummary || base.pageSummary,
  };
};

const findWaitingAsyncModelingAction = (
  result: AgentExecuteResponse | null,
): {
  actionId: string;
  taskId: string;
  pollAfterMs: number;
} | null => {
  if (!result || !Array.isArray(result.actionResults)) {
    return null;
  }
  const pending = result.actionResults.find(
    item =>
      item.status === 'waiting_async_result' &&
      item.action?.domain === 'convert' &&
      item.action?.operation === 'start_task',
  );
  const taskId = String(pending?.output?.taskId || '').trim();
  if (!pending?.action?.actionId || !taskId) {
    return null;
  }
  return {
    actionId: pending.action.actionId,
    taskId,
    pollAfterMs: Math.max(1500, Number(pending.output?.pollAfterMs || 5000)),
  };
};

const finalizeAsyncModelingResult = (
  result: AgentExecuteResponse,
  pending: {actionId: string; taskId: string; pollAfterMs: number},
  nextActionStatus: 'applied' | 'waiting_async_result' | 'failed',
  payload: {taskStatus: string; message: string},
): AgentExecuteResponse => {
  const nextActionResults = result.actionResults.map(item => {
    if (item.action.actionId !== pending.actionId) {
      return item;
    }
    return {
      ...item,
      status: nextActionStatus,
      message: payload.message,
      errorCode: nextActionStatus === 'failed' ? 'tool_error' : undefined,
      output: {
        ...(item.output || {}),
        taskId: pending.taskId,
        status: payload.taskStatus,
        pollAfterMs: pending.pollAfterMs,
      },
    };
  });
  const nextStatus =
    nextActionResults.some(item => item.status === 'pending_confirm')
      ? 'pending_confirm'
      : nextActionResults.some(item => item.status === 'waiting_async_result')
        ? 'waiting_async_result'
        : nextActionResults.some(item => item.status === 'failed')
          ? 'failed'
          : nextActionResults.some(item => item.status === 'client_required')
            ? 'client_required'
            : 'applied';
  return {
    ...result,
    status: nextStatus,
    actionResults: nextActionResults,
    workflowRun: result.workflowRun
      ? {
          ...result.workflowRun,
          status:
            nextStatus === 'waiting_async_result'
              ? 'waiting_async_result'
              : nextStatus === 'failed'
                ? 'failed'
                : 'running',
          updatedAt: new Date().toISOString(),
          pendingTask:
            nextStatus === 'waiting_async_result'
              ? {
                  taskId: pending.taskId,
                  taskStatus: payload.taskStatus,
                  pollAfterMs: pending.pollAfterMs,
                }
              : null,
        }
      : result.workflowRun,
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
    if (missingContextGuides.length > 0 && missingContextGuides[0]) {
      input.clientHandlers.navigateToTab(missingContextGuides[0].targetTab);
      const blockedResult = buildBlockedExecutionResult({
        planId: input.plan.planId,
        hydratedActions,
        missingActionIds,
        missingContextGuides,
      });
      await persistPendingWorkflow({
        plan: input.plan,
        hydratedActions,
        missingContextGuides,
        latestExecuteResult: blockedResult,
      });
      return {
        hydratedActions,
        missingContextGuides,
        executedActionIds: [],
        executeResult: blockedResult,
      };
    }
    useAgentWorkflowContinuationStore.getState().clearPendingWorkflow();
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
    executionStrategy: toBackendExecutionStrategy(input.options?.executionStrategy),
    idempotencyKey: buildExecuteIdempotencyKey({
      planId: input.plan.planId,
      actionIds: executableActionIds,
      allowConfirmActions: input.options?.allowConfirmActions === true,
      latestExecutionId: input.context.latestExecuteResult?.executionId || '',
    }),
  });
  let normalizedResult = await applyClientRequiredActions(executeResult, input.clientHandlers);
  const blockedFollowUpActionIds = normalizedResult.actionResults
    .filter(item => item.status === 'blocked')
    .map(item => item.action.actionId);
  if (
    blockedFollowUpActionIds.length > 0 &&
    (normalizedResult.clientHandledActions?.length || 0) > 0
  ) {
    const followUpResult = await agentApi.executePlan(input.plan.planId, hydratedActions, {
      actionIds: blockedFollowUpActionIds,
      allowConfirmActions: input.options?.allowConfirmActions === true,
      executionStrategy: toBackendExecutionStrategy(input.options?.executionStrategy),
      idempotencyKey: buildExecuteIdempotencyKey({
        planId: input.plan.planId,
        actionIds: blockedFollowUpActionIds,
        allowConfirmActions: input.options?.allowConfirmActions === true,
        latestExecutionId: normalizedResult.executionId || '',
      }),
    });
    normalizedResult = mergeExecuteResults(
      normalizedResult,
      await applyClientRequiredActions(followUpResult, input.clientHandlers),
    );
  }
  if (missingContextGuides.length > 0) {
    if (missingContextGuides[0]) {
      input.clientHandlers.navigateToTab(missingContextGuides[0].targetTab);
    }
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
  await persistPendingWorkflow({
    plan: input.plan,
    hydratedActions,
    missingContextGuides,
    latestExecuteResult: normalizedResult,
  });
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
    toBackendExecutionStrategy(input.options?.executionStrategy),
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

export const resumePendingAgentWorkflow = async (input: {
  context: AgentExecutionContextInput;
  clientHandlers: {
    navigateToTab: (tab: AgentClientTab) => void;
    summarizeCurrentPage: () => string;
  };
  options?: {
    allowConfirmActions?: boolean;
  };
}): Promise<AgentExecuteCycleResult | null> => {
  const workflowStore = useAgentWorkflowContinuationStore.getState();
  const pendingWorkflow = workflowStore.pendingWorkflow;
  const persistedRunRef = workflowStore.persistedRunRef;
  const resumeContextPatch = buildResumeContextPatch(input.context);
  const canResumeViaServer =
    pendingWorkflow?.workflowRun?.status
      ? pendingWorkflow.workflowRun.status !== 'waiting_context' || Boolean(resumeContextPatch)
      : Boolean(persistedRunRef?.runId || input.context.latestExecuteResult?.workflowRun?.runId);
  const resumeRunId =
    canResumeViaServer
      ? pendingWorkflow?.workflowRun?.runId ||
        input.context.latestExecuteResult?.workflowRun?.runId ||
        persistedRunRef?.runId ||
        ''
      : '';

  if (resumeRunId) {
    try {
      const resumed = await applyClientRequiredActions(
        await agentApi.resumeWorkflowRun(resumeRunId, {
          allowConfirmActions: input.options?.allowConfirmActions === true,
          contextPatch: resumeContextPatch,
        }),
        input.clientHandlers,
      );
      if (pendingWorkflow) {
        await persistPendingWorkflow({
          plan: pendingWorkflow.plan,
          hydratedActions: pendingWorkflow.plan.actions,
          missingContextGuides: pendingWorkflow.missingContextGuides,
          latestExecuteResult: resumed,
        });
      } else if (resumed.workflowRun?.status) {
        if (
          resumed.workflowRun.status === 'waiting_async_result' ||
          resumed.workflowRun.status === 'waiting_confirm' ||
          resumed.workflowRun.status === 'waiting_context' ||
          resumed.workflowRun.status === 'running'
        ) {
          workflowStore.setPersistedRunRef({
            runId: resumed.workflowRun.runId,
            planId: resumed.planId,
            status: resumed.workflowRun.status,
            updatedAt: Date.now(),
          });
        } else {
          workflowStore.setPersistedRunRef(null);
        }
      }
      return {
        hydratedActions: pendingWorkflow?.plan.actions || [],
        missingContextGuides: pendingWorkflow?.missingContextGuides || [],
        executedActionIds: [],
        executeResult: resumed,
      };
    } catch (error) {
      const code = String((error as {code?: unknown})?.code || '').trim();
      const status = Number((error as {status?: unknown})?.status || 0);
      const message = String((error as Error)?.message || '').trim();
      const isRunNotFound =
        code === 'RUN_NOT_FOUND' ||
        status === 404 ||
        code === 'HTTP_404' ||
        /run_not_found|agent_workflow_run_not_found/i.test(message);
      if (!pendingWorkflow || !isRunNotFound) {
        throw error;
      }
      // Fall back to local continuation if server-side run registration is missing.
    }
  }

  if (!pendingWorkflow) {
    return null;
  }
  const pendingAsyncAction = findWaitingAsyncModelingAction(
    pendingWorkflow.latestExecuteResult || input.context.latestExecuteResult,
  );
  if (pendingAsyncAction) {
    const nextJob = await modelingApi.getJob(pendingAsyncAction.taskId);
    if (nextJob.status === 'queued' || nextJob.status === 'processing') {
      const waitingResult = finalizeAsyncModelingResult(
        pendingWorkflow.latestExecuteResult || input.context.latestExecuteResult!,
        pendingAsyncAction,
        'waiting_async_result',
        {
          taskStatus: nextJob.status,
          message: '建模任务仍在后台处理中',
        },
      );
      await persistPendingWorkflow({
        plan: pendingWorkflow.plan,
        hydratedActions: pendingWorkflow.plan.actions,
        missingContextGuides: pendingWorkflow.missingContextGuides,
        latestExecuteResult: waitingResult,
      });
      return {
        hydratedActions: pendingWorkflow.plan.actions,
        missingContextGuides: pendingWorkflow.missingContextGuides,
        executedActionIds: [],
        executeResult: waitingResult,
      };
    }
    if (nextJob.status === 'failed' || nextJob.status === 'expired') {
      const failedResult = finalizeAsyncModelingResult(
        pendingWorkflow.latestExecuteResult || input.context.latestExecuteResult!,
        pendingAsyncAction,
        'failed',
        {
          taskStatus: nextJob.status,
          message: nextJob.message || '建模任务失败',
        },
      );
      await persistPendingWorkflow({
        plan: pendingWorkflow.plan,
        hydratedActions: pendingWorkflow.plan.actions,
        missingContextGuides: [],
        latestExecuteResult: failedResult,
      });
      return {
        hydratedActions: pendingWorkflow.plan.actions,
        missingContextGuides: [],
        executedActionIds: [],
        executeResult: failedResult,
      };
    }
    if (nextJob.status === 'succeeded') {
      const resumedLatest = finalizeAsyncModelingResult(
        pendingWorkflow.latestExecuteResult || input.context.latestExecuteResult!,
        pendingAsyncAction,
        'applied',
        {
          taskStatus: nextJob.status,
          message: '建模任务已完成，继续后续工作流',
        },
      );
      const cycle = await executeAgentPlanCycle({
        plan: pendingWorkflow.plan,
        context: {
          ...input.context,
          latestExecuteResult: resumedLatest,
        },
        clientHandlers: input.clientHandlers,
      });
      return cycle;
    }
  }
  if (
    !areMissingContextGuidesResolved(pendingWorkflow.missingContextGuides, {
      colorContext: input.context.colorContext,
      modelingImageContext: input.context.modelingImageContext,
    })
  ) {
    return null;
  }
  const cycle = await executeAgentPlanCycle({
    plan: pendingWorkflow.plan,
    context: {
      ...input.context,
      latestExecuteResult: pendingWorkflow.latestExecuteResult || input.context.latestExecuteResult,
    },
    clientHandlers: input.clientHandlers,
    options: input.options,
  });
  return cycle;
};

export const cancelPendingAgentWorkflow = async (): Promise<AgentExecuteResponse | null> => {
  const workflowStore = useAgentWorkflowContinuationStore.getState();
  const runId =
    workflowStore.pendingWorkflow?.workflowRun?.runId ||
    workflowStore.persistedRunRef?.runId ||
    '';
  if (!runId) {
    workflowStore.clearPendingWorkflow();
    return null;
  }
  try {
    const result = await agentApi.cancelWorkflowRun(runId);
    workflowStore.clearPendingWorkflow();
    return result;
  } catch {
    workflowStore.clearPendingWorkflow();
    return null;
  }
};
