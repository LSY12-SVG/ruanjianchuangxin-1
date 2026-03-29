const {Buffer} = require('node:buffer');
const crypto = require('node:crypto');
const {handleInterpret} = require('./colorIntelligence/services/interpretService');
const {validateImageUpload} = require('./imageTo3d/imageValidation');
const {
  ACTION_TOOL_REF_MAP,
  DEFAULT_BUILTIN_MCP_SERVER_ID,
  resolveActionToolRef,
  resolveActionToolMeta,
  toActionKey,
} = require('./agentToolRefs');
const {createMcpGateway} = require('./mcp/mcpGateway');

const AGENT_IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const DEFAULT_ACTION_TIMEOUT_MS = 15000;
const MAX_IDEMPOTENT_RETRY_ATTEMPTS = 2;
const KNOWN_ERROR_CODES = new Set([
  'invalid_action',
  'forbidden_scope',
  'confirmation_required',
  'timeout',
  'tool_error',
  'client_required',
]);

const HIGH_PRIVILEGE_ACTIONS = new Set([
  'community::publish_draft',
  'settings::apply_patch',
  'convert::start_task',
]);

class AgentExecutionError extends Error {
  constructor({code = 'tool_error', message = 'execution_failed', retryable = false, details = undefined} = {}) {
    super(message);
    this.name = 'AgentExecutionError';
    this.code = KNOWN_ERROR_CODES.has(code) ? code : 'tool_error';
    this.retryable = Boolean(retryable);
    this.details = details;
  }
}

const normalizeScopeList = scopes =>
  (Array.isArray(scopes) ? scopes : [])
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean);

const hasScope = (grantedSet, required) => {
  if (grantedSet.has('*')) {
    return true;
  }
  if (grantedSet.has(required)) {
    return true;
  }
  const namespace = required.split(':')[0];
  if (namespace && grantedSet.has(`${namespace}:*`)) {
    return true;
  }
  return false;
};

const evaluatePermission = (action, authContext) => {
  if (authContext.debugOverride) {
    return {
      allowed: true,
      missingScopes: [],
    };
  }
  const requiredScopes = normalizeScopeList(action.requiredScopes);
  if (requiredScopes.length === 0) {
    return {
      allowed: true,
      missingScopes: [],
    };
  }
  const grantedSet = new Set(normalizeScopeList(authContext.grantedScopes));
  const missingScopes = requiredScopes.filter(scope => !hasScope(grantedSet, scope));
  return {
    allowed: missingScopes.length === 0,
    missingScopes,
  };
};

const isObject = value => typeof value === 'object' && value !== null;

const OPEN_ACTION_STATUSES = new Set([
  'failed',
  'pending_confirm',
  'client_required',
  'waiting_async_result',
  'blocked',
]);

const withTimeout = async (promise, timeoutMs) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new AgentExecutionError({
              code: 'timeout',
              message: 'action_timeout',
              retryable: true,
            }),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const normalizeBase64Payload = raw => {
  const source = String(raw || '').trim();
  if (!source) {
    return '';
  }
  return source.replace(/^data:[^;]+;base64,/, '').trim();
};

const decodeBase64Image = raw => {
  const normalized = normalizeBase64Payload(raw);
  if (!normalized) {
    throw new AgentExecutionError({
      code: 'invalid_action',
      message: 'missing_required_arg:image.base64',
    });
  }
  try {
    const buffer = Buffer.from(normalized, 'base64');
    if (!buffer.length) {
      throw new Error('empty_buffer');
    }
    return buffer;
  } catch {
    throw new AgentExecutionError({
      code: 'invalid_action',
      message: 'invalid_base64_image_payload',
    });
  }
};

const normalizeTags = input =>
  (Array.isArray(input) ? input : [])
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 12);

const requireObject = (value, name) => {
  if (!isObject(value)) {
    throw new AgentExecutionError({
      code: 'invalid_action',
      message: `missing_required_arg:${name}`,
    });
  }
  return value;
};

const requireString = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AgentExecutionError({
      code: 'invalid_action',
      message: `missing_required_arg:${name}`,
    });
  }
  return value.trim();
};

const requireNumber = (value, name) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AgentExecutionError({
      code: 'invalid_action',
      message: `missing_required_arg:${name}`,
    });
  }
  return parsed;
};

const parseGradeArgs = args => {
  const payload = requireObject(args, 'args');
  const image = requireObject(payload.image, 'args.image');
  return {
    locale: requireString(payload.locale, 'args.locale'),
    currentParams: requireObject(payload.currentParams, 'args.currentParams'),
    image: {
      mimeType: requireString(image.mimeType, 'args.image.mimeType'),
      width: requireNumber(image.width, 'args.image.width'),
      height: requireNumber(image.height, 'args.image.height'),
      base64: requireString(image.base64, 'args.image.base64'),
    },
    imageStats: isObject(payload.imageStats) ? payload.imageStats : undefined,
  };
};

const NON_RECOVERABLE_GRADING_FAILURE_PATTERN =
  /(bad_request|invalid_request|missing_required_arg|invalid image|bad payload|http_400|http_422)/i;
const RECOVERABLE_GRADING_FAILURE_PATTERN =
  /(timeout|time out|deadline|model_chain_failed|provider request|http_5|service unavailable|network|real_model_required|model unavailable|econn|enotfound|dns)/i;

const toGradingFailureMessage = result => {
  const payloadError = result?.payload?.error;
  return String(payloadError?.message || payloadError?.code || 'initial_suggest_failed');
};

const isRecoverableGradingFailure = message => {
  const text = String(message || '');
  if (!text) {
    return false;
  }
  if (NON_RECOVERABLE_GRADING_FAILURE_PATTERN.test(text)) {
    return false;
  }
  return RECOVERABLE_GRADING_FAILURE_PATTERN.test(text);
};
const parseConvertArgs = (args, maxUploadBytes) => {
  const payload = requireObject(args, 'args');
  const image = requireObject(payload.image, 'args.image');
  const file = {
    originalname: requireString(image.fileName, 'args.image.fileName'),
    mimetype: requireString(image.mimeType, 'args.image.mimeType'),
    buffer: decodeBase64Image(image.base64),
  };
  file.size = file.buffer.length;
  const validationError = validateImageUpload(file, maxUploadBytes);
  if (validationError) {
    throw new AgentExecutionError({
      code: 'invalid_action',
      message: `${validationError.code}:${validationError.message}`,
      details: validationError.details,
    });
  }
  return file;
};

const parseSettingsPatch = args => {
  const payload = requireObject(args, 'args');
  const patch = {};
  if (typeof payload.syncOnWifi === 'boolean') {
    patch.syncOnWifi = payload.syncOnWifi;
  }
  if (typeof payload.communityNotify === 'boolean') {
    patch.communityNotify = payload.communityNotify;
  }
  if (typeof payload.voiceAutoApply === 'boolean') {
    patch.voiceAutoApply = payload.voiceAutoApply;
  }
  if (!Object.keys(patch).length) {
    throw new AgentExecutionError({
      code: 'invalid_action',
      message: 'missing_required_arg:args.settings_patch',
    });
  }
  return patch;
};

const normalizeActionErrorCode = code =>
  KNOWN_ERROR_CODES.has(code) ? code : 'tool_error';

const summarizeArgShape = (input, prefix = '', depth = 0) => {
  if (!isObject(input) || depth > 2) {
    return [];
  }
  const keys = Object.keys(input).slice(0, 10);
  let paths = [];
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    paths.push(path);
    const value = input[key];
    if (isObject(value)) {
      paths = paths.concat(summarizeArgShape(value, path, depth + 1));
    }
  }
  return paths.slice(0, 24);
};

const buildWorkflowState = ({actions, actionResults, status}) => {
  const totalSteps = Array.isArray(actions) ? actions.length : 0;
  if (!totalSteps) {
    return {
      currentStep: 0,
      totalSteps: 0,
      nextRequiredContext: null,
    };
  }
  const indexByActionId = new Map(
    actions.map((item, index) => [String(item.actionId || item.id || index), index]),
  );
  const firstOpenResult = actionResults.find(
    item => OPEN_ACTION_STATUSES.has(item.status),
  );
  let currentStep = totalSteps;
  if (firstOpenResult) {
    const index = indexByActionId.get(String(firstOpenResult.action?.actionId || firstOpenResult.action?.id || ''));
    if (Number.isFinite(index)) {
      currentStep = Number(index) + 1;
    }
  } else if (status === 'applied') {
    currentStep = totalSteps;
  }

  const nextRequiredContext =
    firstOpenResult?.output?.nextRequiredContext ||
    firstOpenResult?.action?.toolMeta?.requiredContext?.[0] ||
    firstOpenResult?.action?.preconditions?.[0] ||
    null;
  return {
    currentStep,
    totalSteps,
    nextRequiredContext,
  };
};

const buildWorkflowRunSnapshot = ({planId, executionId, workflowState, actionResults, status}) => {
  const firstOpenResult = (Array.isArray(actionResults) ? actionResults : []).find(item =>
    OPEN_ACTION_STATUSES.has(item.status),
  );
  const blockedReason =
    firstOpenResult?.status === 'client_required'
      ? 'waiting_context'
      : firstOpenResult?.status === 'pending_confirm'
        ? 'waiting_confirm'
        : firstOpenResult?.status === 'waiting_async_result'
          ? 'waiting_async_result'
          : firstOpenResult?.status === 'blocked'
            ? 'waiting_dependency'
            : firstOpenResult?.status === 'failed'
              ? 'failed'
              : null;
  const runStatus =
    blockedReason === 'waiting_context'
      ? 'waiting_context'
      : blockedReason === 'waiting_confirm'
        ? 'waiting_confirm'
        : blockedReason === 'waiting_async_result'
          ? 'waiting_async_result'
          : status === 'failed'
            ? 'failed'
            : status === 'applied'
              ? 'succeeded'
              : 'running';
  return {
    runId: executionId,
    status: runStatus,
    currentStep: workflowState?.currentStep || 0,
    totalSteps: workflowState?.totalSteps || 0,
    nextRequiredContext: workflowState?.nextRequiredContext || null,
    blockedReason,
    updatedAt: new Date().toISOString(),
    waitingActionId: firstOpenResult?.action?.actionId || null,
    pendingTask:
      firstOpenResult?.status === 'waiting_async_result'
        ? {
            taskId: String(firstOpenResult?.output?.taskId || ''),
            taskStatus: String(firstOpenResult?.output?.status || ''),
            pollAfterMs: Number(firstOpenResult?.output?.pollAfterMs || 5000),
          }
        : null,
  };
};

const CONTEXT_LABELS = {
  'context.color.image': '调色图片',
  'context.modeling.image': '建模图片',
  'context.community.draftId': '社区草稿',
};

const PERMISSION_LABELS = {
  photo_library: '相册读取',
  photo_library_write: '相册写入',
  camera: '相机',
  microphone: '麦克风',
  notifications: '通知',
  auth_session: '登录态',
  file_read: '文件读取',
  file_write: '文件写入',
  system_settings: '系统设置',
};

const CLIENT_ACTION_RESULT_CARD_KIND = {
  'navigation.navigate_tab': 'client_action',
  'app.summarize_current_page': 'summary',
  'permission.request': 'permission_required',
  'auth.require_login': 'auth_required',
  'file.pick': 'context_required',
  'file.write': 'file_saved',
  'settings.open': 'client_action',
};

const toContextLabel = value => CONTEXT_LABELS[String(value || '').trim()] || String(value || '').trim();

const toPermissionLabel = value =>
  PERMISSION_LABELS[String(value || '').trim()] || String(value || '').trim();


const ensureResultCards = ({status, cards, workflowState, actionResults}) => {
  const safeCards = Array.isArray(cards) ? cards.filter(Boolean) : [];
  if (safeCards.length > 0) {
    return safeCards;
  }
  const firstFailed = (Array.isArray(actionResults) ? actionResults : []).find(
    item => item?.status === 'failed',
  );
  if (status === 'pending_confirm') {
    return [
      {
        kind: 'confirm_required',
        title: '等待确认',
        summary: '存在中高风险动作，确认后将继续执行后续步骤。',
        status: 'pending_confirm',
        nextAction: {
          type: 'confirm',
          label: '去确认',
        },
      },
    ];
  }
  if (status === 'waiting_async_result') {
    return [
      {
        kind: 'task_running',
        title: '后台处理中',
        summary: '任务已进入后台处理，完成后会自动继续。',
        status: 'waiting_async_result',
        nextAction: {
          type: 'wait_async',
          label: '继续等待',
        },
      },
    ];
  }
  if (status === 'client_required' || workflowState?.nextRequiredContext) {
    return [
      {
        kind: 'context_required',
        title: '需要补齐上下文',
        summary: workflowState?.nextRequiredContext
          ? `继续执行前需要：${toContextLabel(workflowState.nextRequiredContext)}。`
          : '需要在客户端补齐条件后继续。',
        status: 'client_required',
        nextAction: {
          type: 'provide_context',
          label: '去补图/补权限',
          requiredContext: workflowState?.nextRequiredContext || undefined,
        },
      },
    ];
  }
  if (status === 'failed') {
    return [
      {
        kind: 'failure',
        title: '执行未完成',
        summary: firstFailed?.message || '执行失败，请根据恢复建议继续。',
        status: 'failed',
        recovery: {
          type: 'retry',
          label: '重试',
        },
      },
    ];
  }
  return [
    {
      kind: 'completed',
      title: '执行完成',
      summary: '已完成当前可执行步骤。',
      status: 'applied',
    },
  ];
};

const buildResultCards = ({status, actionResults, workflowState}) => {
  const cards = [];
  const safeResults = Array.isArray(actionResults) ? actionResults : [];

  for (const item of safeResults) {
    const action = item?.action || {};
    const key = `${String(action.domain || '')}.${String(action.operation || '')}`;
    const output = isObject(item?.output) ? item.output : {};
    const resultCardKind = String(action?.toolMeta?.resultCardKind || '').trim();

    if (item?.status === 'applied' && key === 'community.create_draft' && output.draftId) {
      cards.push({
        kind: 'draft_ready',
        title: '社区草稿已创建',
        summary: `草稿已生成，可以继续编辑或确认发布。`,
        status: 'applied',
        artifact: {
          draftId: String(output.draftId),
        },
        nextAction: {
          type: 'publish_draft',
          draftId: String(output.draftId),
          label: '确认后发布',
        },
      });
      continue;
    }

    if (item?.status === 'applied' && key === 'community.publish_draft' && output.postId) {
      cards.push({
        kind: 'community_published',
        title: '社区内容已发布',
        summary: '发布已完成，你可以前往社区页查看结果。',
        status: 'applied',
        artifact: {
          postId: String(output.postId),
          draftId: output.draftId ? String(output.draftId) : undefined,
        },
        nextAction: {
          type: 'navigate',
          tab: 'community',
          label: '前往社区页',
        },
      });
      continue;
    }

    if (
      (item?.status === 'applied' || item?.status === 'waiting_async_result') &&
      key === 'convert.start_task'
    ) {
      const viewerFiles = Array.isArray(output.viewerFiles) ? output.viewerFiles : [];
      const hasArtifact =
        typeof output.downloadUrl === 'string' ||
        typeof output.previewUrl === 'string' ||
        viewerFiles.length > 0;
      if (hasArtifact) {
        cards.push({
          kind: 'model_ready',
          title: '3D 模型已生成',
          summary: '模型已完成，可以预览、下载，或继续去社区发布。',
          status: 'applied',
          artifact: {
            taskId: output.taskId ? String(output.taskId) : undefined,
            downloadUrl: output.downloadUrl,
            previewUrl: output.previewUrl,
            viewerFiles,
          },
          nextAction: {
            type: 'navigate',
            tab: 'community',
            label: '去社区准备发布',
          },
        });
      } else if (item?.status === 'waiting_async_result') {
        cards.push({
          kind: 'task_running',
          title: '建模任务进行中',
          summary: '建模任务已启动，结果返回后会继续后续工作流。',
          status: 'waiting_async_result',
          artifact: {
            taskId: output.taskId ? String(output.taskId) : undefined,
            taskStatus: output.status ? String(output.status) : undefined,
            pollAfterMs: Number(output.pollAfterMs || 0) || undefined,
          },
        });
      }
      continue;
    }

    if (item?.status === 'pending_confirm') {
        cards.push({
          kind: resultCardKind || 'confirm_required',
        title: '等待确认',
        summary: item.message || '存在中高风险动作，确认后会继续执行。',
        status: 'pending_confirm',
        nextAction: {
          type: 'resume',
          actionId: String(action.actionId || ''),
          label: '确认继续',
        },
      });
      continue;
    }

    if (item?.status === 'client_required') {
      const requiredPermissions = Array.isArray(action?.toolMeta?.requiredDevicePermissions)
        ? action.toolMeta.requiredDevicePermissions
        : Array.isArray(output.permissions)
          ? output.permissions
          : typeof output.permission === 'string' && output.permission.trim()
            ? [output.permission.trim()]
            : [];
      const explicitNextContext =
        typeof output.nextRequiredContext === 'string' && output.nextRequiredContext.trim()
          ? output.nextRequiredContext.trim()
          : '';
      const looksLikeContextGap =
        explicitNextContext ||
        String(item.message || '').includes('context') ||
        (Array.isArray(action?.preconditions) && action.preconditions.length > 0);
      if (looksLikeContextGap) {
        cards.push({
          kind: resultCardKind || 'context_required',
          title: '需要补齐上下文',
          summary:
            explicitNextContext
              ? `继续执行前需要：${toContextLabel(explicitNextContext)}。补齐后会自动继续。`
              : item.message || '请先补齐当前步骤需要的上下文，补齐后会自动继续。',
          status: 'client_required',
          nextAction: {
            type: 'provide_context',
            context: explicitNextContext || undefined,
            actionId: String(action.actionId || ''),
          },
        });
      } else if (requiredPermissions.length > 0) {
        cards.push({
          kind: resultCardKind || 'permission_required',
          title: '需要客户端权限',
          summary: `继续执行前需要：${requiredPermissions.map(toPermissionLabel).join('、')}。授权后会自动继续。`,
          status: 'client_required',
          nextAction: {
            type: 'request_permission',
            permissions: requiredPermissions,
            label: '授权后继续',
          },
          recovery: {
            type: 'open_settings',
            label: '去系统设置',
          },
        });
      } else {
        cards.push({
          kind: resultCardKind || CLIENT_ACTION_RESULT_CARD_KIND[key] || 'client_action',
          title: '需要客户端补执行',
          summary: item.message || '当前步骤需要客户端协助完成，完成后会继续后续动作。',
          status: 'client_required',
          nextAction: {
            type: 'provide_context',
            actionId: String(action.actionId || ''),
          },
        });
      }
      continue;
    }

    if (item?.status === 'failed') {
      cards.push({
        kind: 'failure',
        title: '执行未完成',
        summary: item.message || '当前动作执行失败。',
        status: 'failed',
        recovery: {
          type: 'retry',
          actionId: String(action.actionId || ''),
          errorCode: item.errorCode || 'tool_error',
          label: item.retryable ? '可重试' : '请补齐条件后重试',
        },
      });
      continue;
    }

    if (item?.status === 'applied' && key === 'file.write') {
      cards.push({
        kind: resultCardKind || 'file_saved',
        title: '文件已写回',
        summary:
          typeof output.savedTo === 'string' && output.savedTo.trim()
            ? `文件已保存到${output.savedTo}。`
            : item.message || '文件已保存。',
        status: 'applied',
        artifact: {
          savedUri: typeof output.savedUri === 'string' ? output.savedUri : undefined,
          savedTo: typeof output.savedTo === 'string' ? output.savedTo : undefined,
          fileName: typeof output.fileName === 'string' ? output.fileName : undefined,
        },
      });
    }
  }

  if (
    workflowState?.nextRequiredContext &&
    !cards.some(card => card.kind === 'context_required' || card.kind === 'permission_required')
  ) {
    cards.push({
      kind: 'context_required',
      title: '等待补齐执行条件',
      summary: `下一步需要：${toContextLabel(workflowState.nextRequiredContext)}。补齐后会自动继续。`,
      status: status === 'client_required' ? 'client_required' : 'waiting_context',
      nextAction: {
        type: 'provide_context',
        context: workflowState.nextRequiredContext,
        label: '补齐后继续',
      },
    });
  }

  return cards;
};

const calculateCompletionScore = ({status, actionResults, resultCards}) => {
  const total = Array.isArray(actionResults) ? actionResults.length : 0;
  if (!total) {
    return status === 'applied' ? 1 : 0;
  }
  const applied = actionResults.filter(item => item?.status === 'applied').length;
  const waiting = actionResults.filter(item => item?.status === 'waiting_async_result').length;
  const failed = actionResults.filter(item => item?.status === 'failed').length;
  const pending = actionResults.filter(item => item?.status === 'pending_confirm').length;
  const client = actionResults.filter(item => item?.status === 'client_required').length;

  let score = (applied + waiting * 0.6 + pending * 0.45 + client * 0.35 - failed * 0.8) / total;
  if (Array.isArray(resultCards) && resultCards.some(card => card?.kind === 'model_ready' || card?.kind === 'community_published')) {
    score += 0.15;
  }
  if (status === 'applied') {
    score += 0.12;
  }
  if (status === 'failed') {
    score -= 0.18;
  }
  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
};

const buildRecoverySuggestions = ({status, actionResults, workflowState}) => {
  const suggestions = [];
  const firstFailed = (Array.isArray(actionResults) ? actionResults : []).find(item => item?.status === 'failed');
  const firstClientRequired = (Array.isArray(actionResults) ? actionResults : []).find(
    item => item?.status === 'client_required',
  );
  const firstPendingConfirm = (Array.isArray(actionResults) ? actionResults : []).find(
    item => item?.status === 'pending_confirm',
  );

  if (workflowState?.nextRequiredContext) {
    suggestions.push({
      type: 'provide_context',
      label: `补齐${toContextLabel(workflowState.nextRequiredContext)}并续跑`,
      actionRef: {
        context: workflowState.nextRequiredContext,
      },
    });
  }

  if (firstClientRequired) {
    suggestions.push({
      type: 'provide_context',
      label: '去补图/授权后自动续跑',
      actionRef: {
        actionId: firstClientRequired.action?.actionId || '',
        domain: firstClientRequired.action?.domain || '',
        operation: firstClientRequired.action?.operation || '',
      },
    });
  }

  if (firstPendingConfirm) {
    suggestions.push({
      type: 'resume',
      label: '确认高风险步骤后继续执行',
      actionRef: {
        actionId: firstPendingConfirm.action?.actionId || '',
      },
    });
  }

  if (firstFailed) {
    suggestions.push({
      type: 'retry',
      label: firstFailed.retryable ? '重试失败步骤' : '补齐条件后重试',
      actionRef: {
        actionId: firstFailed.action?.actionId || '',
        errorCode: firstFailed.errorCode || 'tool_error',
      },
    });
  }

  if (status === 'waiting_async_result') {
    suggestions.push({
      type: 'resume',
      label: '后台处理中，稍后自动续跑',
      actionRef: {
        pollAfterMs: Number((Array.isArray(actionResults) ? actionResults : []).find(item => item?.status === 'waiting_async_result')?.output?.pollAfterMs || 5000),
      },
    });
  }

  const deduped = [];
  const seen = new Set();
  for (const item of suggestions) {
    const key = `${item.type}:${item.label}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }
  return deduped.slice(0, 3);
};


const buildUnifiedNextAction = ({status, actionResults, workflowState, workflowRun, recoverySuggestions}) => {
  const safeResults = Array.isArray(actionResults) ? actionResults : [];
  const firstPending = safeResults.find(item => item?.status === 'pending_confirm');
  const firstClient = safeResults.find(item => item?.status === 'client_required');
  const firstWaiting = safeResults.find(item => item?.status === 'waiting_async_result');
  const firstFailed = safeResults.find(item => item?.status === 'failed');
  const runId = String(workflowRun?.runId || '').trim() || undefined;
  const nextPollAt = workflowRun?.nextPollAt || undefined;

  if (status === 'pending_confirm' && firstPending) {
    return {
      type: 'confirm',
      label: '去确认',
      actionId: String(firstPending.action?.actionId || '').trim() || undefined,
      runId,
    };
  }
  if (status === 'client_required') {
    const output = isObject(firstClient?.output) ? firstClient.output : {};
    const targetTab =
      typeof output.targetTab === 'string' && output.targetTab.trim()
        ? output.targetTab.trim()
        : undefined;
    const requiredContext =
      typeof output.nextRequiredContext === 'string' && output.nextRequiredContext.trim()
        ? output.nextRequiredContext.trim()
        : workflowState?.nextRequiredContext || undefined;
    return {
      type: 'provide_context',
      label: '去补图/去授权',
      targetTab,
      requiredContext,
      actionId: String(firstClient?.action?.actionId || '').trim() || undefined,
      runId,
    };
  }
  if (status === 'waiting_async_result') {
    const pollAfterMs = Number(firstWaiting?.output?.pollAfterMs || workflowRun?.pendingTask?.pollAfterMs || 5000);
    return {
      type: 'wait_async',
      label: '继续等待',
      pollAfterMs: Number.isFinite(pollAfterMs) && pollAfterMs > 0 ? pollAfterMs : 5000,
      nextPollAt,
      runId,
    };
  }
  if (status === 'failed') {
    const retryRef = (Array.isArray(recoverySuggestions) ? recoverySuggestions : []).find(
      item => item?.type === 'retry' || item?.type === 'resume' || item?.type === 'provide_context',
    );
    return {
      type: retryRef?.type || (workflowState?.nextRequiredContext ? 'provide_context' : 'retry'),
      label: retryRef?.label || (workflowState?.nextRequiredContext ? '去补图后续跑' : '重试'),
      requiredContext: workflowState?.nextRequiredContext || undefined,
      actionId: String(firstFailed?.action?.actionId || '').trim() || undefined,
      runId,
    };
  }
  return {
    type: 'resume',
    label: '继续下一步',
    runId,
  };
};

const buildResultSummary = ({status, completionScore, actionResults, workflowState}) => {
  const appliedCount = (Array.isArray(actionResults) ? actionResults : []).filter(item => item?.status === 'applied').length;
  const done =
    status === 'applied'
      ? `已完成 ${appliedCount} 项动作`
      : status === 'waiting_async_result'
        ? '任务已启动，后台继续处理中'
        : status === 'pending_confirm'
          ? '流程已推进，等待你的确认'
          : status === 'client_required'
            ? '需要客户端补齐条件后继续'
            : '本次执行未完成';
  const why =
    status === 'failed'
      ? '至少一个关键步骤失败，系统已给出恢复建议。'
      : `完成度评分 ${(completionScore * 100).toFixed(0)}%，基于已执行动作、阻塞状态和产物情况计算。`;
  const next =
    workflowState?.nextRequiredContext
      ? `下一步请补齐：${toContextLabel(workflowState.nextRequiredContext)}。`
      : status === 'pending_confirm'
        ? '确认高风险步骤后将继续执行。'
        : status === 'waiting_async_result'
          ? '等待异步任务完成后会自动续跑。'
          : status === 'applied'
            ? '你可以继续下一个目标，或让助手基于结果自动扩展流程。'
            : '可按恢复建议重试当前任务。';
  return {done, why, next};
};

const parseExternalMcpServers = raw => {
  if (typeof raw !== 'string' || !raw.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(item => {
        if (!isObject(item)) {
          return null;
        }
        const serverId = typeof item.serverId === 'string' ? item.serverId.trim() : '';
        const endpoint = typeof item.endpoint === 'string' ? item.endpoint.trim() : '';
        const allowTools = Array.isArray(item.allowTools)
          ? item.allowTools.filter(tool => typeof tool === 'string' && tool.trim())
          : [];
        if (!serverId || !endpoint || allowTools.length === 0) {
          return null;
        }
        return {
          serverId,
          endpoint,
          enabled: item.enabled === true,
          credentialEnv:
            typeof item.credentialEnv === 'string' && item.credentialEnv.trim()
              ? item.credentialEnv.trim()
              : undefined,
          allowTools,
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
};

const toExecutionFailure = error => {
  const failure =
    error instanceof AgentExecutionError
      ? error
      : new AgentExecutionError({
          code: 'tool_error',
          message: error?.message || 'tool_execution_failed',
          retryable: true,
        });
  return {
    status: failure.code === 'client_required' ? 'client_required' : 'failed',
    message: failure.message || 'tool_execution_failed',
    errorCode: normalizeActionErrorCode(failure.code),
    retryable: Boolean(failure.retryable),
    details: failure.details,
    output: undefined,
  };
};

const buildDefaultMcpToolHandlers = ({
  resolveServices,
  colorInterpreter = handleInterpret,
}) => ({
  'navigation.navigate_tab': async ({context}) => ({
    status: 'client_required',
    message: `client_action_required:${context.action.domain}.${context.action.operation}`,
    errorCode: 'client_required',
    retryable: true,
  }),

  'app.summarize_current_page': async ({context}) => ({
    status: 'client_required',
    message: `client_action_required:${context.action.domain}.${context.action.operation}`,
    errorCode: 'client_required',
    retryable: true,
  }),

  'permission.request': async ({args, context}) => {
    const permissions = Array.isArray(args?.permissions)
      ? args.permissions.filter(item => typeof item === 'string' && item.trim())
      : typeof args?.permission === 'string' && args.permission.trim()
        ? [args.permission.trim()]
        : Array.isArray(context.action?.toolMeta?.requiredDevicePermissions)
          ? context.action.toolMeta.requiredDevicePermissions
          : [];
    return {
      status: 'client_required',
      message: permissions.length > 0 ? 'permission_request_required' : 'client_action_required:permission.request',
      errorCode: 'client_required',
      retryable: true,
      output: {
        permissions,
        permission: permissions[0],
      },
    };
  },

  'auth.require_login': async () => ({
    status: 'client_required',
    message: 'auth_login_required',
    errorCode: 'client_required',
    retryable: true,
    output: {
      resumeHint: 'login_then_resume',
    },
  }),

  'file.pick': async ({args, context}) => ({
    status: 'client_required',
    message: 'file_pick_required',
    errorCode: 'client_required',
    retryable: true,
    output: {
      target:
        typeof args?.target === 'string' && args.target.trim()
          ? args.target.trim()
          : context.action?.stage === 'convert'
            ? 'modeling'
            : 'grading',
      nextRequiredContext:
        typeof args?.context === 'string' && args.context.trim()
          ? args.context.trim()
          : context.action?.toolMeta?.requiredContext?.[0] || null,
    },
  }),

  'file.write': async ({args}) => ({
    status: 'client_required',
    message: 'file_write_required',
    errorCode: 'client_required',
    retryable: true,
    output: {
      target:
        typeof args?.target === 'string' && args.target.trim() ? args.target.trim() : 'downloads',
      fileName:
        typeof args?.fileName === 'string' && args.fileName.trim() ? args.fileName.trim() : undefined,
    },
  }),

  'settings.open': async ({args}) => ({
    status: 'client_required',
    message: 'open_system_settings_required',
    errorCode: 'client_required',
    retryable: true,
    output: {
      target: typeof args?.target === 'string' && args.target.trim() ? args.target.trim() : 'system',
      screen: typeof args?.screen === 'string' && args.screen.trim() ? args.screen.trim() : undefined,
    },
  }),

  'community.create_draft': async ({args, context}) => {
    const {communityRepo} = resolveServices();
    if (!communityRepo || typeof communityRepo.createDraft !== 'function') {
      throw new AgentExecutionError({
        code: 'tool_error',
        message: 'community_repository_unavailable',
      });
    }

    const payloadArgs = isObject(args) ? args : {};
    const payload = {
      title:
        typeof payloadArgs.title === 'string' && payloadArgs.title.trim()
          ? payloadArgs.title.trim().slice(0, 120)
          : 'AI 生成草稿',
      content: typeof payloadArgs.content === 'string' ? payloadArgs.content.trim().slice(0, 4000) : '',
      beforeUrl: typeof payloadArgs.beforeUrl === 'string' ? payloadArgs.beforeUrl.trim().slice(0, 1200) : '',
      afterUrl: typeof payloadArgs.afterUrl === 'string' ? payloadArgs.afterUrl.trim().slice(0, 1200) : '',
      tags: normalizeTags(payloadArgs.tags),
      gradingParams: isObject(payloadArgs.gradingParams) ? payloadArgs.gradingParams : {},
    };

    const created = await communityRepo.createDraft(context.userId, payload);
    if (!created?.id) {
      throw new AgentExecutionError({
        code: 'tool_error',
        message: 'failed_to_create_draft',
      });
    }
    context.sharedContext.lastDraftId = String(created.id);
    return {
      status: 'applied',
      message: 'draft_created',
      output: {
        draftId: String(created.id),
      },
    };
  },

  'community.publish_draft': async ({args, context}) => {
    const {communityRepo} = resolveServices();
    if (!communityRepo || typeof communityRepo.publishDraft !== 'function') {
      throw new AgentExecutionError({
        code: 'tool_error',
        message: 'community_repository_unavailable',
      });
    }

    const payloadArgs = isObject(args) ? args : {};
    const candidateDraftIdRaw =
      payloadArgs.draftId !== undefined && payloadArgs.draftId !== null
        ? String(payloadArgs.draftId).trim()
        : context.sharedContext.lastDraftId || '';
    if (!candidateDraftIdRaw) {
      throw new AgentExecutionError({
        code: 'invalid_action',
        message: 'missing_required_arg:args.draftId',
      });
    }
    const published = await communityRepo.publishDraft(context.userId, candidateDraftIdRaw);
    if (!published?.id) {
      throw new AgentExecutionError({
        code: 'invalid_action',
        message: 'draft_not_found_or_not_owned',
      });
    }
    context.sharedContext.lastPublishedPostId = String(published.id);
    return {
      status: 'applied',
      message: 'draft_published',
      output: {
        postId: String(published.id),
        draftId: candidateDraftIdRaw,
      },
    };
  },

  'settings.apply_patch': async ({args, context}) => {
    const {settingsRepo} = resolveServices();
    if (!settingsRepo || typeof settingsRepo.updateMySettings !== 'function') {
      throw new AgentExecutionError({
        code: 'tool_error',
        message: 'settings_repository_unavailable',
      });
    }
    const patch = parseSettingsPatch(args);
    const updated = await settingsRepo.updateMySettings(context.userId, patch);
    return {
      status: 'applied',
      message: 'settings_updated',
      output: {
        settings: updated || null,
      },
    };
  },

  'grading.apply_visual_suggest': async ({args, context}) => {
    const gradeArgs = parseGradeArgs(args);
    const requestPayload = {
      ...gradeArgs,
      mode: 'initial_visual_suggest',
      transcript: '',
    };
    const strictResult = await colorInterpreter(
      requestPayload,
      {
        strictMode: true,
        responseShape: 'module',
        forceMode: 'initial_visual_suggest',
      },
    );
    if (strictResult && strictResult.status === 200) {
      context.sharedContext.lastGradingResult = strictResult.payload;
      return {
        status: 'applied',
        message: 'initial_visual_suggest_applied',
        output: {
          confidence: Number(strictResult.payload?.confidence || 0),
          actionsCount: Array.isArray(strictResult.payload?.actions)
            ? strictResult.payload.actions.length
            : 0,
          fallbackUsed: false,
        },
      };
    }

    const strictReason = toGradingFailureMessage(strictResult);
    if (!isRecoverableGradingFailure(strictReason)) {
      throw new AgentExecutionError({
        code: 'tool_error',
        message: strictReason,
      });
    }

    const relaxedResult = await colorInterpreter(
      requestPayload,
      {
        strictMode: false,
        responseShape: 'module',
        forceMode: 'initial_visual_suggest',
      },
    );

    if (relaxedResult && relaxedResult.status === 200) {
      context.sharedContext.lastGradingResult = relaxedResult.payload;
      const relaxedSource = String(relaxedResult.payload?.source || '').toLowerCase();
      const relaxedRoute = String(relaxedResult.payload?.modelRoute || '').toLowerCase();
      const fallbackUsed =
        relaxedSource === 'fallback' ||
        relaxedRoute.includes('fallback') ||
        relaxedRoute.includes('degraded');
      return {
        status: 'applied',
        message: fallbackUsed
          ? 'initial_visual_suggest_applied_degraded'
          : 'initial_visual_suggest_applied',
        output: {
          confidence: Number(relaxedResult.payload?.confidence || 0),
          actionsCount: Array.isArray(relaxedResult.payload?.actions)
            ? relaxedResult.payload.actions.length
            : 0,
          fallbackUsed,
          fallbackReason: strictReason,
        },
      };
    }

    const relaxedReason = toGradingFailureMessage(relaxedResult);
    context.sharedContext.lastGradingResult = {
      actions: [],
      confidence: 0,
      source: 'fallback',
      message: 'visual_suggest_temporarily_degraded',
      reasoningSummary: strictReason,
    };
    return {
      status: 'applied',
      message: 'initial_visual_suggest_degraded',
      output: {
        confidence: 0,
        actionsCount: 0,
        fallbackUsed: true,
        fallbackReason: relaxedReason || strictReason,
      },
    };
  },

  'convert.start_task': async ({args}) => {
    const {modelingService, modelingConfig} = resolveServices();
    if (!modelingService || typeof modelingService.createTask !== 'function') {
      throw new AgentExecutionError({
        code: 'tool_error',
        message: 'modeling_service_unavailable',
      });
    }
    const maxUploadBytes = Number(modelingConfig?.maxUploadBytes || 10 * 1024 * 1024);
    const file = parseConvertArgs(args, maxUploadBytes);
    const task = await modelingService.createTask(file, {
      sourceImageRef: 'agent:convert.start_task',
    });
    return {
      status:
        String(task.status || '').trim() === 'succeeded' ? 'applied' : 'waiting_async_result',
      message:
        String(task.status || '').trim() === 'succeeded'
          ? 'modeling_task_succeeded'
          : 'modeling_task_created',
      output: {
        taskId: String(task.taskId || ''),
        status: String(task.status || ''),
        pollAfterMs: Number(modelingConfig?.pollAfterMs || 5000),
      },
    };
  },
});

const mergeLegacyActionAdapters = (toolHandlers, actionAdapters) => {
  if (!isObject(actionAdapters)) {
    return toolHandlers;
  }
  const merged = {...toolHandlers};
  for (const [actionKey, adapter] of Object.entries(actionAdapters)) {
    if (typeof adapter !== 'function') {
      continue;
    }
    const mappedToolRef = ACTION_TOOL_REF_MAP[actionKey];
    if (!mappedToolRef) {
      continue;
    }
    merged[mappedToolRef.toolName] = ({args, context}) =>
      adapter({
        action: {
          ...context.action,
          args,
        },
        userId: context.userId,
        sharedContext: context.sharedContext,
      });
  }
  return merged;
};

const createAgentExecutionService = ({
  resolveServices = () => ({}),
  colorInterpreter = handleInterpret,
  actionAdapters = null,
  mcpGateway = null,
  externalMcpServers = null,
} = {}) => {
  const idempotencyMap = new Map();
  const builtinServerId =
    typeof process.env.AGENT_MCP_BUILTIN_SERVER_ID === 'string' &&
    process.env.AGENT_MCP_BUILTIN_SERVER_ID.trim()
      ? process.env.AGENT_MCP_BUILTIN_SERVER_ID.trim()
      : DEFAULT_BUILTIN_MCP_SERVER_ID;
  const baseToolHandlers = mergeLegacyActionAdapters(
    buildDefaultMcpToolHandlers({resolveServices, colorInterpreter}),
    actionAdapters,
  );
  const dispatcher =
    mcpGateway ||
    createMcpGateway({
      emergencyDisabled: String(process.env.AGENT_MCP_EMERGENCY_DISABLED || '').trim() === 'true',
      builtInServers: [
        {
          serverId: builtinServerId,
          allowTools: Object.keys(baseToolHandlers),
          invokeTool: async ({toolName, args, context}) => {
            const handler = baseToolHandlers[toolName];
            if (typeof handler !== 'function') {
              throw new AgentExecutionError({
                code: 'invalid_action',
                message: `unsupported_mcp_tool:${toolName}`,
              });
            }
            return handler({args, context});
          },
        },
      ],
      externalServers:
        Array.isArray(externalMcpServers) && externalMcpServers.length > 0
          ? externalMcpServers
          : parseExternalMcpServers(process.env.AGENT_MCP_EXTERNAL_SERVERS),
    });

  const cleanupIdempotency = () => {
    const now = Date.now();
    for (const [key, value] of idempotencyMap.entries()) {
      if (now - value.createdAt > AGENT_IDEMPOTENCY_TTL_MS) {
        idempotencyMap.delete(key);
      }
    }
  };

  const execute = async ({
    userId = '',
    namespace = 'app.agent',
    planId,
    actions,
    actionIds = [],
    idempotencyKey = '',
    allowConfirmActions = false,
    grantedScopes = [],
    debugOverride = false,
  }) => {
    cleanupIdempotency();
    const dedupeKey = idempotencyKey ? `${userId || 'anonymous'}::${namespace}::${planId}::${idempotencyKey}` : '';
    if (dedupeKey && idempotencyMap.has(dedupeKey)) {
      return idempotencyMap.get(dedupeKey).payload;
    }

    const filtered = actionIds.length
      ? actions.filter(action => actionIds.includes(action.actionId))
      : actions;
    const executionId = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const traceId = `trace_${crypto.randomBytes(6).toString('hex')}`;
    const filteredActionIdSet = new Set(filtered.map(action => action.actionId));
    const sharedContext = {};
    const actionResults = [];
    const actionStatusById = new Map();
    const toolCalls = [];
    const auditEntries = [];

    for (const action of filtered) {
      const actionKey = toActionKey(action);
      const toolMeta = isObject(action.toolMeta) ? action.toolMeta : resolveActionToolMeta(action);
      const resolvedToolRef = resolveActionToolRef(action) || {
        serverId: builtinServerId,
        toolName: '',
      };
      const requiresAudit =
        HIGH_PRIVILEGE_ACTIONS.has(actionKey) ||
        action.requiresConfirmation === true ||
        action.riskLevel === 'medium' ||
        action.riskLevel === 'high';
      const argsSummary = summarizeArgShape(isObject(action.args) ? action.args : {});
      const pushAuditEntry = (entry = {}) => {
        if (!requiresAudit) {
          return;
        }
        auditEntries.push({
          executionId,
          userId,
          planId,
          actionId: action.actionId,
          domain: action.domain,
          operation: action.operation,
          riskLevel: action.riskLevel,
          requiresConfirmation: Boolean(action.requiresConfirmation),
          toolRef: resolvedToolRef,
          argsSummary,
          ...entry,
          createdAt: new Date().toISOString(),
        });
      };

      const dependencyIds = Array.isArray(action.dependsOn)
        ? action.dependsOn.filter(item => typeof item === 'string' && item.trim())
        : [];
      const unresolvedDependencies = dependencyIds.filter(dependencyId => {
        if (!filteredActionIdSet.has(dependencyId)) {
          return false;
        }
        const dependencyStatus = actionStatusById.get(dependencyId);
        return dependencyStatus !== 'applied' && dependencyStatus !== 'skipped';
      });
      if (unresolvedDependencies.length > 0) {
        actionResults.push({
          action,
          attempts: 0,
          durationMs: 0,
          status: 'blocked',
          message: `waiting_on_dependencies:${unresolvedDependencies.join(',')}`,
          retryable: true,
          output: {
            blockedBy: unresolvedDependencies,
            nextRequiredContext:
              toolMeta?.requiredContext?.[0] || action.preconditions?.[0] || null,
          },
          skillName: action.skillName || 'agent-workflow-runtime',
        });
        actionStatusById.set(action.actionId, 'blocked');
        pushAuditEntry({
          status: 'blocked',
          message: `waiting_on_dependencies:${unresolvedDependencies.join(',')}`,
        });
        continue;
      }

      const permission = evaluatePermission(action, {
        grantedScopes,
        debugOverride,
      });
      if (!permission.allowed) {
        actionResults.push({
          action,
          attempts: 1,
          durationMs: 0,
          status: 'failed',
          message: `forbidden_scope:${permission.missingScopes.join(',')}`,
          errorCode: 'forbidden_scope',
          retryable: false,
          output: {
            nextRequiredContext:
              toolMeta?.requiredContext?.[0] || action.preconditions?.[0] || null,
          },
          skillName: action.skillName || 'agent-permission-gate',
        });
        actionStatusById.set(action.actionId, 'failed');
        pushAuditEntry({
          status: 'failed',
          errorCode: 'forbidden_scope',
          message: `forbidden_scope:${permission.missingScopes.join(',')}`,
        });
        continue;
      }

      if ((action.requiresConfirmation || action.riskLevel !== 'low') && !allowConfirmActions) {
        actionResults.push({
          action,
          attempts: 1,
          durationMs: 0,
          status: 'pending_confirm',
          message: 'confirmation_required',
          errorCode: 'confirmation_required',
          retryable: true,
          output: {
            nextRequiredContext:
              toolMeta?.requiredContext?.[0] || action.preconditions?.[0] || null,
          },
          skillName: action.skillName || 'agent-permission-gate',
        });
        actionStatusById.set(action.actionId, 'pending_confirm');
        pushAuditEntry({
          status: 'pending_confirm',
          errorCode: 'confirmation_required',
          message: 'confirmation_required',
        });
        continue;
      }

      if (!resolvedToolRef || !resolvedToolRef.serverId || !resolvedToolRef.toolName) {
        actionResults.push({
          action,
          attempts: 1,
          durationMs: 0,
          status: 'failed',
          message: `unsupported_action:${action.domain}.${action.operation}`,
          errorCode: 'invalid_action',
          retryable: false,
          output: {
            nextRequiredContext:
              toolMeta?.requiredContext?.[0] || action.preconditions?.[0] || null,
          },
          skillName: action.skillName || 'agent-tool-router',
        });
        actionStatusById.set(action.actionId, 'failed');
        pushAuditEntry({
          status: 'failed',
          errorCode: 'invalid_action',
          message: `unsupported_action:${action.domain}.${action.operation}`,
        });
        continue;
      }

      const timeoutMs =
        Number.isFinite(Number(action.timeoutMs)) && Number(action.timeoutMs) > 0
          ? Number(action.timeoutMs)
          : DEFAULT_ACTION_TIMEOUT_MS;
      const maxAttempts = action.idempotent === true ? MAX_IDEMPOTENT_RETRY_ATTEMPTS : 1;
      const startedAt = Date.now();
      let attempt = 0;
      let finalResult = null;
      let finalFailureDetails = undefined;

      while (attempt < maxAttempts) {
        attempt += 1;
        try {
          const call = await withTimeout(
            Promise.resolve(
              dispatcher.invokeTool({
                serverId: resolvedToolRef.serverId,
                toolName: resolvedToolRef.toolName,
                args: isObject(action.args) ? action.args : {},
                context: {
                  userId,
                  planId,
                  actionId: action.actionId,
                  action,
                  sharedContext,
                },
                timeoutMs,
              }),
            ),
            timeoutMs,
          );
          toolCalls.push({
            actionId: action.actionId,
            serverId: call.serverId || resolvedToolRef.serverId,
            toolName: call.toolName || resolvedToolRef.toolName,
            status: call.status || 'failed',
            latencyMs: Number(call.latencyMs || 0),
            requestId: call.requestId || '',
            retryCount: Math.max(0, attempt - 1),
            errorCode: call.errorCode,
          });
          finalResult = call;
          if (call.status !== 'failed' || !call.retryable || attempt >= maxAttempts) {
            break;
          }
        } catch (error) {
          const failure = toExecutionFailure(error);
          finalFailureDetails = failure.details;
          toolCalls.push({
            actionId: action.actionId,
            serverId: resolvedToolRef.serverId,
            toolName: resolvedToolRef.toolName,
            status: failure.status || 'failed',
            latencyMs: 0,
            requestId: `local_${crypto.randomBytes(4).toString('hex')}`,
            retryCount: Math.max(0, attempt - 1),
            errorCode: failure.errorCode,
          });
          finalResult = failure;
          if (!failure.retryable || attempt >= maxAttempts) {
            break;
          }
        }
      }

      const normalizedStatus =
        finalResult?.status === 'applied' ||
        finalResult?.status === 'client_required' ||
        finalResult?.status === 'pending_confirm' ||
        finalResult?.status === 'waiting_async_result'
          ? finalResult.status
          : 'failed';
      const normalizedErrorCode = finalResult?.errorCode
        ? normalizeActionErrorCode(finalResult.errorCode)
        : normalizedStatus === 'failed'
          ? 'tool_error'
          : undefined;

      actionResults.push({
        action,
        attempts: attempt || 1,
        durationMs: Date.now() - startedAt,
        status: normalizedStatus,
        message: finalResult?.message || (normalizedStatus === 'applied' ? 'applied' : 'tool_execution_failed'),
        errorCode: normalizedErrorCode,
        retryable: Boolean(finalResult?.retryable),
        output: finalResult?.output,
        details: finalFailureDetails,
        skillName: action.skillName || 'agent-tool-router',
      });
      actionStatusById.set(action.actionId, normalizedStatus);
      pushAuditEntry({
        status: normalizedStatus,
        resultStatus: normalizedStatus,
        errorCode: normalizedErrorCode,
        message: finalResult?.message || '',
        requestId: toolCalls[toolCalls.length - 1]?.requestId || '',
        serverId: toolCalls[toolCalls.length - 1]?.serverId || resolvedToolRef.serverId,
        toolName: toolCalls[toolCalls.length - 1]?.toolName || resolvedToolRef.toolName,
      });
    }

    const appliedActions = actionResults
      .filter(item => item.status === 'applied')
      .map(item => item.action);
    const pendingActions = actionResults
      .filter(item => item.status === 'pending_confirm')
      .map(item => item.action);
    const waitingAsyncActions = actionResults
      .filter(item => item.status === 'waiting_async_result')
      .map(item => item.action);
    const failedActions = actionResults
      .filter(item => item.status === 'failed')
      .map(item => ({
        action: item.action,
        reason: item.message || 'execution_failed',
        errorCode: item.errorCode || 'tool_error',
        retryable: Boolean(item.retryable),
      }));
    const clientRequiredActions = actionResults
      .filter(item => item.status === 'client_required')
      .map(item => item.action);
    const status =
      pendingActions.length > 0
        ? 'pending_confirm'
        : waitingAsyncActions.length > 0
          ? 'waiting_async_result'
        : failedActions.length > 0
          ? 'failed'
          : clientRequiredActions.length > 0
            ? 'client_required'
            : 'applied';
    const workflowState = buildWorkflowState({
      actions: filtered,
      actionResults,
      status,
    });
    const auditId = auditEntries.length > 0
      ? `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
      : undefined;
    if (auditId) {
      console.log(
        '[agent-audit]',
        JSON.stringify({
          auditId,
          traceId,
          executionId,
          userId,
          planId,
          namespace,
          entryCount: auditEntries.length,
          entries: auditEntries,
        }),
      );
    }

    const rawResultCards = buildResultCards({
      status,
      actionResults,
      workflowState,
    });
    const resultCards = ensureResultCards({
      status,
      cards: rawResultCards,
      workflowState,
      actionResults,
    });
    const completionScore = calculateCompletionScore({
      status,
      actionResults,
      resultCards,
    });
    const rawRecoverySuggestions = buildRecoverySuggestions({
      status,
      actionResults,
      workflowState,
    });
    const recoverySuggestions =
      Array.isArray(rawRecoverySuggestions) && rawRecoverySuggestions.length > 0
        ? rawRecoverySuggestions
        : [
            {
              type: workflowState?.nextRequiredContext ? 'provide_context' : status === 'failed' ? 'retry' : 'resume',
              label:
                workflowState?.nextRequiredContext
                  ? `补齐${toContextLabel(workflowState.nextRequiredContext)}后续跑`
                  : status === 'failed'
                    ? '重试失败步骤'
                    : '继续执行',
            },
          ];

    const payload = {
      executionId,
      traceId,
      planId,
      namespace,
      actionResults,
      appliedActions,
      failedActions,
      pendingActions,
      clientRequiredActions,
      rollbackAvailable: appliedActions.length > 0,
      workflowState,
      status,
      workflowRun: null,
      toolCalls,
      auditId,
      resultCards,
      completionScore,
      recoverySuggestions,
      resultSummary: buildResultSummary({
        status,
        completionScore,
        actionResults,
        workflowState,
      }),
    };
    payload.workflowRun = buildWorkflowRunSnapshot({
      planId,
      executionId: payload.executionId,
      workflowState,
      actionResults,
      status,
    });
    payload.nextAction = buildUnifiedNextAction({
      status,
      actionResults,
      workflowState,
      workflowRun: payload.workflowRun,
      recoverySuggestions: payload.recoverySuggestions,
    });
    if (dedupeKey) {
      idempotencyMap.set(dedupeKey, {
        payload,
        createdAt: Date.now(),
      });
    }
    return payload;
  };

  const listMcpServerIds = () =>
    typeof dispatcher?.listServerIds === 'function' ? dispatcher.listServerIds() : [builtinServerId];
  const hasEnabledExternalMcpServers = () =>
    typeof dispatcher?.hasEnabledExternalServers === 'function'
      ? dispatcher.hasEnabledExternalServers()
      : false;

  return {
    execute,
    listMcpServerIds,
    hasEnabledExternalMcpServers,
  };
};

module.exports = {
  createAgentExecutionService,
  AgentExecutionError,
  buildWorkflowState,
  buildWorkflowRunSnapshot,
  buildResultCards,
  calculateCompletionScore,
  buildRecoverySuggestions,
  buildUnifiedNextAction,
  buildResultSummary,
};




