const {Buffer} = require('node:buffer');
const {handleInterpret} = require('./colorIntelligence/services/interpretService');
const {validateImageUpload} = require('./imageTo3d/imageValidation');

const AGENT_IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const DEFAULT_ACTION_TIMEOUT_MS = 15000;
const KNOWN_ERROR_CODES = new Set([
  'invalid_action',
  'forbidden_scope',
  'confirmation_required',
  'timeout',
  'tool_error',
  'client_required',
]);

const CLIENT_REQUIRED_ACTIONS = new Set([
  'navigation::navigate_tab',
  'app::summarize_current_page',
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

const toActionKey = action => `${action.domain}::${action.operation}`;

const defaultClientRequiredAdapter = async ({action}) => ({
  status: 'client_required',
  message: `client_action_required:${action.domain}.${action.operation}`,
  errorCode: 'client_required',
  retryable: true,
});

const buildDefaultActionAdapters = ({
  resolveServices,
  colorInterpreter = handleInterpret,
}) => ({
  'community::create_draft': async ({action, userId, sharedContext}) => {
    const {communityRepo} = resolveServices();
    if (!communityRepo || typeof communityRepo.createDraft !== 'function') {
      throw new AgentExecutionError({
        code: 'tool_error',
        message: 'community_repository_unavailable',
      });
    }

    const args = isObject(action.args) ? action.args : {};
    const payload = {
      title:
        typeof args.title === 'string' && args.title.trim()
          ? args.title.trim().slice(0, 120)
          : 'AI 生成草稿',
      content: typeof args.content === 'string' ? args.content.trim().slice(0, 4000) : '',
      beforeUrl: typeof args.beforeUrl === 'string' ? args.beforeUrl.trim().slice(0, 1200) : '',
      afterUrl: typeof args.afterUrl === 'string' ? args.afterUrl.trim().slice(0, 1200) : '',
      tags: normalizeTags(args.tags),
      gradingParams: isObject(args.gradingParams) ? args.gradingParams : {},
    };

    const created = await communityRepo.createDraft(userId, payload);
    if (!created?.id) {
      throw new AgentExecutionError({
        code: 'tool_error',
        message: 'failed_to_create_draft',
      });
    }
    sharedContext.lastDraftId = String(created.id);
    return {
      status: 'applied',
      message: 'draft_created',
      output: {
        draftId: String(created.id),
      },
    };
  },

  'community::publish_draft': async ({action, userId, sharedContext}) => {
    const {communityRepo} = resolveServices();
    if (!communityRepo || typeof communityRepo.publishDraft !== 'function') {
      throw new AgentExecutionError({
        code: 'tool_error',
        message: 'community_repository_unavailable',
      });
    }

    const args = isObject(action.args) ? action.args : {};
    const candidateDraftIdRaw =
      args.draftId !== undefined && args.draftId !== null
        ? String(args.draftId).trim()
        : sharedContext.lastDraftId || '';
    if (!candidateDraftIdRaw) {
      throw new AgentExecutionError({
        code: 'invalid_action',
        message: 'missing_required_arg:args.draftId',
      });
    }
    const published = await communityRepo.publishDraft(userId, candidateDraftIdRaw);
    if (!published?.id) {
      throw new AgentExecutionError({
        code: 'invalid_action',
        message: 'draft_not_found_or_not_owned',
      });
    }
    sharedContext.lastPublishedPostId = String(published.id);
    return {
      status: 'applied',
      message: 'draft_published',
      output: {
        postId: String(published.id),
        draftId: candidateDraftIdRaw,
      },
    };
  },

  'settings::apply_patch': async ({action, userId}) => {
    const {settingsRepo} = resolveServices();
    if (!settingsRepo || typeof settingsRepo.updateMySettings !== 'function') {
      throw new AgentExecutionError({
        code: 'tool_error',
        message: 'settings_repository_unavailable',
      });
    }
    const patch = parseSettingsPatch(action.args);
    const updated = await settingsRepo.updateMySettings(userId, patch);
    return {
      status: 'applied',
      message: 'settings_updated',
      output: {
        settings: updated || null,
      },
    };
  },

  'grading::apply_visual_suggest': async ({action, sharedContext}) => {
    const args = parseGradeArgs(action.args);
    const result = await colorInterpreter(
      {
        ...args,
        mode: 'initial_visual_suggest',
        transcript: '',
      },
      {
        strictMode: true,
        responseShape: 'module',
        forceMode: 'initial_visual_suggest',
      },
    );
    if (!result || result.status !== 200) {
      const errorPayload = result?.payload?.error || {};
      throw new AgentExecutionError({
        code: 'tool_error',
        message: String(errorPayload.message || errorPayload.code || 'initial_suggest_failed'),
      });
    }
    sharedContext.lastGradingResult = result.payload;
    return {
      status: 'applied',
      message: 'initial_visual_suggest_applied',
      output: {
        confidence: Number(result.payload?.confidence || 0),
        actionsCount: Array.isArray(result.payload?.actions) ? result.payload.actions.length : 0,
      },
    };
  },

  'convert::start_task': async ({action}) => {
    const {modelingService, modelingConfig} = resolveServices();
    if (!modelingService || typeof modelingService.createTask !== 'function') {
      throw new AgentExecutionError({
        code: 'tool_error',
        message: 'modeling_service_unavailable',
      });
    }
    const maxUploadBytes = Number(modelingConfig?.maxUploadBytes || 10 * 1024 * 1024);
    const file = parseConvertArgs(action.args, maxUploadBytes);
    const task = await modelingService.createTask(file, {
      sourceImageRef: 'agent:convert.start_task',
    });
    return {
      status: 'applied',
      message: 'modeling_task_created',
      output: {
        taskId: String(task.taskId || ''),
        status: String(task.status || ''),
        pollAfterMs: Number(modelingConfig?.pollAfterMs || 5000),
      },
    };
  },
});

const normalizeActionErrorCode = code =>
  KNOWN_ERROR_CODES.has(code) ? code : 'tool_error';

const createAgentExecutionService = ({
  resolveServices = () => ({}),
  colorInterpreter = handleInterpret,
  actionAdapters = null,
} = {}) => {
  const idempotencyMap = new Map();
  const baseAdapters = actionAdapters || buildDefaultActionAdapters({resolveServices, colorInterpreter});

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
    const sharedContext = {};
    const actionResults = [];

    for (const action of filtered) {
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
          skillName: action.skillName || 'agent-permission-gate',
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
          skillName: action.skillName || 'agent-permission-gate',
        });
        continue;
      }

      const actionKey = toActionKey(action);
      if (CLIENT_REQUIRED_ACTIONS.has(actionKey)) {
        const startedAt = Date.now();
        const result = await defaultClientRequiredAdapter({action});
        actionResults.push({
          action,
          attempts: 1,
          durationMs: Date.now() - startedAt,
          status: result.status || 'client_required',
          message: result.message || 'client_action_required',
          errorCode: 'client_required',
          retryable: true,
          skillName: action.skillName || 'agent-tool-router',
        });
        continue;
      }

      const adapter = baseAdapters[actionKey];
      if (typeof adapter !== 'function') {
        actionResults.push({
          action,
          attempts: 1,
          durationMs: 0,
          status: 'failed',
          message: `unsupported_action:${action.domain}.${action.operation}`,
          errorCode: 'invalid_action',
          retryable: false,
          skillName: action.skillName || 'agent-tool-router',
        });
        continue;
      }

      const startedAt = Date.now();
      try {
        const timeoutMs =
          Number.isFinite(Number(action.timeoutMs)) && Number(action.timeoutMs) > 0
            ? Number(action.timeoutMs)
            : DEFAULT_ACTION_TIMEOUT_MS;
        const adapterResult = await withTimeout(
          Promise.resolve(
            adapter({
              action,
              userId,
              sharedContext,
            }),
          ),
          timeoutMs,
        );
        actionResults.push({
          action,
          attempts: 1,
          durationMs: Date.now() - startedAt,
          status: adapterResult?.status || 'applied',
          message: adapterResult?.message || 'applied',
          errorCode: adapterResult?.errorCode,
          retryable: Boolean(adapterResult?.retryable),
          output: adapterResult?.output,
          skillName: action.skillName || 'agent-tool-router',
        });
      } catch (error) {
        const failure =
          error instanceof AgentExecutionError
            ? error
            : new AgentExecutionError({
                code: 'tool_error',
                message: error?.message || 'tool_execution_failed',
              });
        actionResults.push({
          action,
          attempts: 1,
          durationMs: Date.now() - startedAt,
          status: failure.code === 'client_required' ? 'client_required' : 'failed',
          message: failure.message || 'tool_execution_failed',
          errorCode: normalizeActionErrorCode(failure.code),
          retryable: Boolean(failure.retryable),
          details: failure.details,
          skillName: action.skillName || 'agent-tool-router',
        });
      }
    }

    const appliedActions = actionResults
      .filter(item => item.status === 'applied')
      .map(item => item.action);
    const pendingActions = actionResults
      .filter(item => item.status === 'pending_confirm')
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

    const payload = {
      executionId: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      planId,
      namespace,
      actionResults,
      appliedActions,
      failedActions,
      pendingActions,
      clientRequiredActions,
      rollbackAvailable: appliedActions.length > 0,
      status:
        pendingActions.length > 0
          ? 'pending_confirm'
          : failedActions.length > 0
            ? 'failed'
            : clientRequiredActions.length > 0
              ? 'client_required'
              : 'applied',
    };
    if (dedupeKey) {
      idempotencyMap.set(dedupeKey, {
        payload,
        createdAt: Date.now(),
      });
    }
    return payload;
  };

  return {
    execute,
  };
};

module.exports = {
  createAgentExecutionService,
  AgentExecutionError,
};
