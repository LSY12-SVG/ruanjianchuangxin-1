const express = require('express');
const path = require('path');
const {
  validateAgentPlanRequest,
  normalizeAgentPlanResponse,
  validateExecuteRequest,
  validateMemoryUpsertRequest,
  validateMemoryQueryRequest,
  normalizeAgentAction,
} = require('../agentContracts');
const {planAgentActions} = require('../agentPlanner');
const {
  createAgentExecutionService,
  buildWorkflowState,
  buildWorkflowRunSnapshot,
  buildResultCards,
  calculateCompletionScore,
  buildRecoverySuggestions,
  buildUnifiedNextAction,
  buildResultSummary,
} = require('../agentExecution');
const {createAgentMemoryStore} = require('../agentMemoryStore');
const {createAgentRunStore} = require('../agentRunStore');
const {createAgentAsyncRecoveryRegistry} = require('../agentAsyncRecovery');
const {createAgentRunWorker} = require('../agentRunWorker');
const {chooseExecutionStrategyWithSource, normalizeStrategy} = require('../agentSkillPacks');
const {getAuthBypassUser, isAuthBypassEnabled} = require('../authBypass');
const {sendError} = require('./errorResponse');
const {sanitizeAgentPayloadForTransport} = require('../agentPayloadSanitizer');

const MODULE_NAME = 'agent';
const BASE_PATH = '/v1/modules/agent';

const requiredEnv = ['AGENT_MEMORY_PATH', 'AGENT_RUNS_PATH'];

const cloneJson = value => JSON.parse(JSON.stringify(value));

const MEMORY_KEY_USER_PREFERENCES = 'user_preferences.v1';
const MEMORY_KEY_TASK_OUTCOMES = 'task_outcomes.v1';
const MAX_TASK_OUTCOMES = 50;

const normalizeExecutionStrategyValue = value => normalizeStrategy(value) || null;

const buildOutcomeFingerprint = outcome =>
  [
    String(outcome?.planId || ''),
    String(outcome?.status || ''),
    String(outcome?.topResultCardKind || ''),
    String(outcome?.errorCode || ''),
  ].join('::');

const VALID_PLAN_ACTION_DOMAINS = new Set([
  'navigation',
  'grading',
  'convert',
  'community',
  'settings',
  'app',
  'permission',
  'auth',
  'file',
]);
const DIRECT_RESPONSE_TEXT_KEYS = [
  'reasoningSummary',
  'reasoning_summary',
  'response',
  'answer',
  'finalAnswer',
  'final_answer',
  'message',
  'summary',
  'content',
  'text',
];
const CLARIFICATION_CONTEXT_HINT_PATTERN = /上下文|context|权限|permission|登录|login|图片|image|草稿|draft|token|账号|授权/i;

const isObject = value => typeof value === 'object' && value !== null;

const toText = value => (typeof value === 'string' ? value.trim() : '');

const ensurePlanId = payload => {
  const fromCamel = toText(payload?.planId);
  if (fromCamel) {
    return fromCamel;
  }
  const fromSnake = toText(payload?.plan_id);
  if (fromSnake) {
    return fromSnake;
  }
  return `plan_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
};

const extractDirectResponseText = payload => {
  if (!isObject(payload)) {
    return '';
  }
  for (const key of DIRECT_RESPONSE_TEXT_KEYS) {
    const candidate = toText(payload[key]);
    if (candidate) {
      return candidate;
    }
  }
  if (isObject(payload.response)) {
    const responseText = toText(payload.response.text || payload.response.message || payload.response.summary);
    if (responseText) {
      return responseText;
    }
  }
  return '';
};

const parseActionSignature = value => {
  const raw = toText(value);
  if (!raw) {
    return null;
  }
  const compact = raw.replace(/\s+/g, '');
  const normalized = compact.includes('::') ? compact.replace('::', '.') : compact;
  const dotIndex = normalized.indexOf('.');
  if (dotIndex <= 0 || dotIndex >= normalized.length - 1) {
    return null;
  }
  const domain = normalized.slice(0, dotIndex).toLowerCase();
  const operation = normalized.slice(dotIndex + 1).toLowerCase();
  if (!VALID_PLAN_ACTION_DOMAINS.has(domain) || !operation) {
    return null;
  }
  return {
    domain,
    operation,
  };
};

const buildDirectResponseAction = ({planId, currentTab, responseText}) => {
  const actionId = `${planId}_fallback_direct_1`;
  const args = {
    currentTab: toText(currentTab) || 'agent',
  };
  if (responseText) {
    args.responseHint = responseText;
  }
  return {
    actionId,
    id: actionId,
    domain: 'app',
    operation: 'summarize_current_page',
    args,
    riskLevel: 'low',
    requiresConfirmation: false,
    idempotent: true,
    requiredScopes: ['app:read'],
    stage: 'app',
    skillName: 'agent-task-planner',
    dependsOn: [],
    preconditions: [],
  };
};

const collectPlannerRawActions = payload => {
  if (!isObject(payload)) {
    return [];
  }
  const candidates = [
    payload.actions,
    payload.plan?.actions,
    payload.planActions,
    payload.plan_actions,
    payload.steps,
    payload.plan?.steps,
    payload.plan_steps,
    payload.tasks,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
};

const capabilityKey = (domain, operation) =>
  `${String(domain || '').trim().toLowerCase()}::${String(operation || '').trim().toLowerCase()}`;

const buildRequestedCapabilitySet = requestBody =>
  new Set(
    (Array.isArray(requestBody?.capabilities) ? requestBody.capabilities : [])
      .filter(item => isObject(item))
      .map(item => capabilityKey(item.domain, item.operation))
      .filter(Boolean),
  );
const coercePlannerAction = ({value, index, planId, currentTab, responseText}) => {
  if (typeof value === 'string' && value.trim()) {
    return buildDirectResponseAction({
      planId,
      currentTab,
      responseText: value.trim() || responseText,
    });
  }

  const source =
    isObject(value) && isObject(value.action)
      ? {
          ...value.action,
          args: isObject(value.action.args)
            ? value.action.args
            : isObject(value.args)
              ? value.args
              : value.action.args,
        }
      : value;

  if (!isObject(source)) {
    return null;
  }

  let domain = toText(source.domain).toLowerCase();
  let operation = toText(source.operation).toLowerCase();

  if (!domain || !operation) {
    const parsed = parseActionSignature(
      source.action || source.tool || source.toolName || source.tool_name || source.name || source.key,
    );
    if (parsed) {
      domain = parsed.domain;
      operation = parsed.operation;
    }
  }

  if (!VALID_PLAN_ACTION_DOMAINS.has(domain) || !operation) {
    return null;
  }

  const candidate = {
    ...source,
    domain,
    operation,
    riskLevel:
      typeof source.riskLevel === 'string' && source.riskLevel.trim()
        ? source.riskLevel.trim().toLowerCase()
        : typeof source.risk_level === 'string' && source.risk_level.trim()
          ? source.risk_level.trim().toLowerCase()
          : 'low',
    requiresConfirmation:
      source.requiresConfirmation === true || source.requires_confirmation === true,
    requiredScopes: Array.isArray(source.requiredScopes)
      ? source.requiredScopes
      : Array.isArray(source.required_scopes)
        ? source.required_scopes
        : domain === 'app'
          ? ['app:read']
          : [],
  };

  if (!toText(candidate.actionId) && !toText(candidate.action_id) && !toText(candidate.id)) {
    const actionId = `${planId}_adapted_${index + 1}`;
    candidate.actionId = actionId;
    candidate.id = actionId;
  }

  const normalizedCandidate = normalizeAgentAction(candidate, index, planId);
  return normalizedCandidate ? candidate : null;
};

const shouldRetainClarification = ({question, actions}) => {
  const text = toText(question);
  if (!text) {
    return false;
  }
  if (
    Array.isArray(actions) &&
    actions.some(item => item?.requiresConfirmation === true || String(item?.riskLevel || '') === 'high')
  ) {
    return true;
  }
  return CLARIFICATION_CONTEXT_HINT_PATTERN.test(text);
};

const adaptPlannerPlanPayload = ({
  rawPlan,
  requestBody,
  requestedCapabilitySet = new Set(),
  runtimeBlockedActionSet = new Set(),
}) => {
  const base = isObject(rawPlan) ? cloneJson(rawPlan) : {};
  const planId = ensurePlanId(base);
  const currentTab = toText(requestBody?.currentTab) || 'agent';
  const responseText = extractDirectResponseText(base) || toText(requestBody?.intent?.goal);
  const rawActions = collectPlannerRawActions(base);
  const adaptedActions = rawActions
    .map((item, index) =>
      coercePlannerAction({
        value: item,
        index,
        planId,
        currentTab,
        responseText,
      }),
    )
    .filter(Boolean);

  const capabilityFilteredActions =
    requestedCapabilitySet.size > 0
      ? adaptedActions.filter(item =>
          requestedCapabilitySet.has(capabilityKey(item?.domain, item?.operation)),
        )
      : adaptedActions;
  const applicableActions = capabilityFilteredActions.filter(
    item => !runtimeBlockedActionSet.has(capabilityKey(item?.domain, item?.operation)),
  );
  const droppedByCapability = adaptedActions.filter(
    item =>
      requestedCapabilitySet.size > 0 &&
      !requestedCapabilitySet.has(capabilityKey(item?.domain, item?.operation)),
  );
  const droppedByRuntime = capabilityFilteredActions.filter(item =>
    runtimeBlockedActionSet.has(capabilityKey(item?.domain, item?.operation)),
  );

  const existingFallbackUsed = base?.fallback?.used === true || base?.fallback_used === true;
  const existingFallbackReason =
    toText(base?.fallback?.reason) || toText(base?.fallback_reason) || '';

  let fallbackUsed = existingFallbackUsed;
  let fallbackReason = existingFallbackReason;
  const finalActions = applicableActions.slice();

  if (finalActions.length === 0) {
    fallbackUsed = true;
    if (droppedByRuntime.length > 0) {
      fallbackReason = fallbackReason || 'runtime_feature_unavailable';
    } else if (droppedByCapability.length > 0) {
      fallbackReason = fallbackReason || 'capability_gap';
    } else {
      fallbackReason = fallbackReason || 'adapter_generated_direct_response';
    }
    finalActions.push(
      buildDirectResponseAction({
        planId,
        currentTab,
        responseText,
      }),
    );
  }

  const clarificationQuestion = toText(base.clarificationQuestion || base.clarification_question);
  const keepClarification = shouldRetainClarification({
    question: clarificationQuestion,
    actions: finalActions,
  });

  const droppedActionLabels = Array.from(
    new Set(
      [...droppedByCapability, ...droppedByRuntime]
        .map(item => `${item.domain}.${item.operation}`)
        .filter(Boolean),
    ),
  );
  const adaptationHint = droppedActionLabels.length
    ? `当前 App 能力暂不可执行：${droppedActionLabels.join('、')}，已自动降级为可执行链路。`
    : '';
  const reasoningBase =
    toText(base.reasoningSummary || base.reasoning_summary) ||
    (responseText
      ? `已给出可直接执行建议：${responseText}`
      : '已生成可执行步骤，涉及高风险动作时会先确认。');
  const reasoningSummary = adaptationHint ? `${reasoningBase} ${adaptationHint}` : reasoningBase;

  return {
    ...base,
    planId,
    plannerSource: toText(base.plannerSource || base.planner_source) || 'cloud',
    actions: finalActions,
    reasoningSummary,
    clarificationRequired: keepClarification,
    clarificationQuestion: keepClarification ? clarificationQuestion : undefined,
    decisionPath: fallbackUsed ? 'fallback_direct' : 'planned',
    fallback: fallbackUsed
      ? {
          used: true,
          reason: fallbackReason || 'fallback_direct',
        }
      : undefined,
  };
};

const buildNormalizationFallbackPlan = ({requestBody, rawPlan, reason}) => {
  const planId = ensurePlanId(rawPlan);
  const currentTab = toText(requestBody?.currentTab) || 'agent';
  const responseText =
    extractDirectResponseText(rawPlan) ||
    toText(requestBody?.intent?.goal) ||
    '我先给出可执行建议，并在必要时继续补齐信息。';
  return {
    planId,
    plannerSource: 'local',
    actions: [
      buildDirectResponseAction({
        planId,
        currentTab,
        responseText,
      }),
    ],
    reasoningSummary: responseText,
    summarySource: 'rule',
    clarificationRequired: false,
    clarificationQuestion: undefined,
    estimatedSteps: 1,
    undoPlan: [],
    decisionPath: 'fallback_direct',
    fallback: {
      used: true,
      reason: toText(reason) || 'plan_normalization_failed',
    },
  };
};

const parseScopesHeader = value => {
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
};

const resolveAgentGrantedScopes = req => {
  const fromUser = Array.isArray(req.user?.scopes)
    ? req.user.scopes.filter(item => typeof item === 'string' && item.trim())
    : [];
  const fromHeader = parseScopesHeader(req.header('x-agent-scopes'));
  const merged = new Set([...fromUser, ...fromHeader]);
  return Array.from(merged);
};

const findDraftIdFromExecuteResult = result => {
  const actionResults = Array.isArray(result?.actionResults) ? result.actionResults : [];
  for (const item of actionResults) {
    if (
      item?.status === 'applied' &&
      item?.action?.domain === 'community' &&
      item?.action?.operation === 'create_draft'
    ) {
      const draftId = String(item?.output?.draftId || item?.output?.id || '').trim();
      if (draftId) {
        return draftId;
      }
    }
  }
  return '';
};

const enrichActionsForResume = (actions, latestExecuteResult) => {
  const safeActions = Array.isArray(actions) ? actions : [];
  const latestDraftId = findDraftIdFromExecuteResult(latestExecuteResult);
  return safeActions.map(action => {
    if (
      action?.domain === 'community' &&
      action?.operation === 'publish_draft' &&
      latestDraftId
    ) {
      const args =
        action?.args && typeof action.args === 'object' ? cloneJson(action.args) : {};
      if (!String(args.draftId || '').trim()) {
        return {
          ...cloneJson(action),
          args: {
            ...args,
            draftId: latestDraftId,
          },
        };
      }
    }
    return cloneJson(action);
  });
};

const sortActionResults = (actionResults, actions) => {
  const safeResults = Array.isArray(actionResults) ? actionResults : [];
  const safeActions = Array.isArray(actions) ? actions : [];
  const byActionId = new Map(
    safeResults.map(item => [String(item?.action?.actionId || item?.action?.id || ''), item]),
  );
  const ordered = safeActions
    .map(action => byActionId.get(String(action?.actionId || action?.id || '')))
    .filter(Boolean);
  const extras = safeResults.filter(item => {
    const actionId = String(item?.action?.actionId || item?.action?.id || '');
    return !safeActions.some(action => String(action?.actionId || action?.id || '') === actionId);
  });
  return [...ordered, ...extras];
};

const rebuildExecutePayload = ({
  runId,
  executionId,
  traceId,
  planId,
  namespace,
  actions,
  actionResults,
  toolCalls,
  auditId,
  pageSummary,
  clientHandledActions,
  appliedStrategy,
  outcomeRecorded,
}) => {
  const orderedResults = sortActionResults(actionResults, actions);
  const pendingActions = orderedResults
    .filter(item => item.status === 'pending_confirm')
    .map(item => item.action);
  const waitingAsyncActions = orderedResults
    .filter(item => item.status === 'waiting_async_result')
    .map(item => item.action);
  const failedActions = orderedResults
    .filter(item => item.status === 'failed')
    .map(item => ({
      action: item.action,
      reason: item.message || 'execution_failed',
      errorCode: item.errorCode || 'tool_error',
      retryable: Boolean(item.retryable),
    }));
  const clientRequiredActions = orderedResults
    .filter(item => item.status === 'client_required')
    .map(item => item.action);
  const appliedActions = orderedResults
    .filter(item => item.status === 'applied')
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
    actions,
    actionResults: orderedResults,
    status,
  });
  const resultCards = buildResultCards({
    status,
    actionResults: orderedResults,
    workflowState,
  });
  const safeResultCards = Array.isArray(resultCards) && resultCards.length > 0
    ? resultCards
    : [
        {
          kind: status === 'failed' ? 'failure' : status === 'waiting_async_result' ? 'task_running' : status === 'pending_confirm' ? 'confirm_required' : status === 'client_required' ? 'context_required' : 'completed',
          title: status === 'failed' ? '执行未完成' : status === 'waiting_async_result' ? '后台处理中' : status === 'pending_confirm' ? '等待确认' : status === 'client_required' ? '需要补齐上下文' : '执行完成',
          summary: status === 'failed' ? '存在失败步骤，请重试或补齐上下文。' : status === 'waiting_async_result' ? '任务正在后台处理中。' : status === 'pending_confirm' ? '存在待确认步骤。' : status === 'client_required' ? '请先补齐上下文或权限。' : '已完成当前可执行步骤。',
          status,
        },
      ];
  const completionScore = calculateCompletionScore({
    status,
    actionResults: orderedResults,
    resultCards: safeResultCards,
  });
  const recoverySuggestions = buildRecoverySuggestions({
    status,
    actionResults: orderedResults,
    workflowState,
  });
  const safeRecoverySuggestions =
    Array.isArray(recoverySuggestions) && recoverySuggestions.length > 0
      ? recoverySuggestions
      : [
          {
            type: workflowState?.nextRequiredContext ? 'provide_context' : status === 'failed' ? 'retry' : 'resume',
            label:
              workflowState?.nextRequiredContext
                ? `补齐${workflowState.nextRequiredContext}后续跑`
                : status === 'failed'
                  ? '重试失败步骤'
                  : '继续执行',
          },
        ];
  const workflowRun = {
    ...buildWorkflowRunSnapshot({
      planId,
      executionId: runId || executionId,
      workflowState,
      actionResults: orderedResults,
      status,
    }),
    runId: runId || executionId,
  };
  const nextAction = buildUnifiedNextAction({
    status,
    actionResults: orderedResults,
    workflowState,
    workflowRun,
    recoverySuggestions: safeRecoverySuggestions,
  });
  const payload = {
    executionId,
    planId,
    namespace,
    status,
    actionResults: orderedResults,
    appliedActions,
    failedActions,
    pendingActions,
    clientRequiredActions,
    rollbackAvailable: appliedActions.length > 0,
    workflowState,
    workflowRun,
    toolCalls: Array.isArray(toolCalls) ? toolCalls : [],
    auditId,
    traceId,
    pageSummary,
    clientHandledActions,
    resultCards: safeResultCards,
    completionScore,
    recoverySuggestions: safeRecoverySuggestions,
    nextAction,
    resultSummary: buildResultSummary({
      status,
      completionScore,
      actionResults: orderedResults,
      workflowState,
    }),
    appliedStrategy: typeof appliedStrategy === 'string' ? appliedStrategy : undefined,
    outcomeRecorded: outcomeRecorded === true ? true : undefined,
  };
  return sanitizeAgentPayloadForTransport(payload);
};

const mergeExecutePayloads = ({base, next, actions, runId, namespace}) => {
  const byActionId = new Map(
    (Array.isArray(base?.actionResults) ? base.actionResults : []).map(item => [
      String(item?.action?.actionId || item?.action?.id || ''),
      cloneJson(item),
    ]),
  );
  for (const item of Array.isArray(next?.actionResults) ? next.actionResults : []) {
    byActionId.set(String(item?.action?.actionId || item?.action?.id || ''), cloneJson(item));
  }
  return rebuildExecutePayload({
    runId,
    executionId: String(next?.executionId || base?.executionId || `resume_${Date.now()}`),
    planId: String(next?.planId || base?.planId || ''),
    namespace: namespace || next?.namespace || base?.namespace || 'app.agent',
    actions,
    actionResults: Array.from(byActionId.values()),
    toolCalls: [...(base?.toolCalls || []), ...(next?.toolCalls || [])],
    auditId: next?.auditId || base?.auditId,
    traceId: next?.traceId || base?.traceId,
    pageSummary: next?.pageSummary || base?.pageSummary,
    clientHandledActions: [
      ...(base?.clientHandledActions || []),
      ...(next?.clientHandledActions || []),
    ],
    appliedStrategy: next?.appliedStrategy || base?.appliedStrategy,
    outcomeRecorded: next?.outcomeRecorded === true || base?.outcomeRecorded === true,
  });
};

const resolveResumeActionIds = ({actions, latestExecuteResult, allowConfirmActions}) => {
  const statusByActionId = new Map(
    (Array.isArray(latestExecuteResult?.actionResults) ? latestExecuteResult.actionResults : []).map(item => [
      String(item?.action?.actionId || item?.action?.id || ''),
      item?.status,
    ]),
  );
  return (Array.isArray(actions) ? actions : [])
    .filter(action => {
      const status = statusByActionId.get(String(action?.actionId || action?.id || ''));
      if (status === 'applied' || status === 'skipped') {
        return false;
      }
      if (status === 'pending_confirm' && allowConfirmActions !== true) {
        return false;
      }
      if (status === 'waiting_async_result') {
        return false;
      }
      return true;
    })
    .map(action => String(action?.actionId || action?.id || ''))
    .filter(Boolean);
};

const hasGradingArgs = args => {
  if (!args || typeof args !== 'object') {
    return false;
  }
  const image = args.image;
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

const hasConvertArgs = args => {
  if (!args || typeof args !== 'object') {
    return false;
  }
  const image = args.image;
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

const normalizeResumeContextPatch = body => {
  if (!body || typeof body !== 'object' || !body.contextPatch || typeof body.contextPatch !== 'object') {
    return null;
  }
  const patch = body.contextPatch;
  const colorContext =
    patch.colorContext && typeof patch.colorContext === 'object' ? cloneJson(patch.colorContext) : null;
  const modelingImageContext =
    patch.modelingImageContext && typeof patch.modelingImageContext === 'object'
      ? cloneJson(patch.modelingImageContext)
      : null;
  return {
    colorContext,
    modelingImageContext,
  };
};

const hydrateActionsWithContextPatch = ({actions, latestExecuteResult, contextPatch}) => {
  const safeActions = Array.isArray(actions) ? actions : [];
  const latestDraftId = findDraftIdFromExecuteResult(latestExecuteResult);
  const missingActionIds = [];
  const missingContextKeys = [];
  const hydratedActions = safeActions.map(action => {
    if (action?.domain === 'grading' && action?.operation === 'apply_visual_suggest') {
      if (hasGradingArgs(action.args)) {
        return cloneJson(action);
      }
      if (!contextPatch?.colorContext?.image?.base64) {
        missingActionIds.push(String(action.actionId || action.id || ''));
        missingContextKeys.push('context.color.image');
        return cloneJson(action);
      }
      return {
        ...cloneJson(action),
        args: {
          locale: contextPatch.colorContext.locale,
          currentParams: contextPatch.colorContext.currentParams,
          image: contextPatch.colorContext.image,
          imageStats: contextPatch.colorContext.imageStats,
        },
      };
    }

    if (action?.domain === 'convert' && action?.operation === 'start_task') {
      if (hasConvertArgs(action.args)) {
        return cloneJson(action);
      }
      if (!contextPatch?.modelingImageContext?.image?.base64) {
        missingActionIds.push(String(action.actionId || action.id || ''));
        missingContextKeys.push('context.modeling.image');
        return cloneJson(action);
      }
      return {
        ...cloneJson(action),
        args: {
          image: contextPatch.modelingImageContext.image,
        },
      };
    }

    if (action?.domain === 'community' && action?.operation === 'publish_draft' && latestDraftId) {
      const args = action?.args && typeof action.args === 'object' ? cloneJson(action.args) : {};
      if (!String(args.draftId || '').trim()) {
        return {
          ...cloneJson(action),
          args: {
            ...args,
            draftId: latestDraftId,
          },
        };
      }
    }

    return cloneJson(action);
  });

  return {
    hydratedActions,
    missingActionIds,
    nextRequiredContext: missingContextKeys[0] || null,
  };
};

const buildWaitingContextResumePayload = ({
  runId,
  latestExecuteResult,
  actions,
  namespace,
  missingActionIds,
  nextRequiredContext,
}) => {
  const byActionId = new Map(
    (Array.isArray(latestExecuteResult?.actionResults) ? latestExecuteResult.actionResults : []).map(item => [
      String(item?.action?.actionId || item?.action?.id || ''),
      cloneJson(item),
    ]),
  );
  for (const action of Array.isArray(actions) ? actions : []) {
    const actionId = String(action?.actionId || action?.id || '');
    if (!missingActionIds.includes(actionId)) {
      continue;
    }
    byActionId.set(actionId, {
      action: cloneJson(action),
      status: 'client_required',
      message: 'missing_required_context',
      errorCode: 'client_required',
      output: {
        nextRequiredContext,
      },
    });
  }
  const rebuilt = rebuildExecutePayload({
    runId,
    executionId: String(latestExecuteResult?.executionId || runId || `ctx_${Date.now()}`),
    planId: String(latestExecuteResult?.planId || ''),
    namespace: String(namespace || latestExecuteResult?.namespace || 'app.agent'),
    actions,
    actionResults: Array.from(byActionId.values()),
    toolCalls: latestExecuteResult?.toolCalls || [],
    auditId: latestExecuteResult?.auditId,
    traceId: latestExecuteResult?.traceId,
    pageSummary: latestExecuteResult?.pageSummary,
    clientHandledActions: latestExecuteResult?.clientHandledActions,
  });
  return {
    ...rebuilt,
    status: 'client_required',
    workflowRun: rebuilt.workflowRun
      ? {
          ...rebuilt.workflowRun,
          status: 'waiting_context',
          blockedReason: 'waiting_context',
          nextRequiredContext,
          updatedAt: new Date().toISOString(),
        }
      : rebuilt.workflowRun,
    workflowState: rebuilt.workflowState
      ? {
          ...rebuilt.workflowState,
          nextRequiredContext,
        }
      : rebuilt.workflowState,
  };
};

const buildCancelledExecutePayload = ({runId, latestExecuteResult, actions, namespace}) => {
  const nextActionResults = (Array.isArray(latestExecuteResult?.actionResults)
    ? latestExecuteResult.actionResults
    : []
  ).map(item => {
    if (
      item?.status === 'pending_confirm' ||
      item?.status === 'client_required' ||
      item?.status === 'waiting_async_result' ||
      item?.status === 'blocked'
    ) {
      return {
        ...cloneJson(item),
        status: 'skipped',
        message: 'workflow_cancelled',
        errorCode: undefined,
      };
    }
    return cloneJson(item);
  });
  const rebuilt = rebuildExecutePayload({
    runId,
    executionId: String(latestExecuteResult?.executionId || runId || `cancel_${Date.now()}`),
    planId: String(latestExecuteResult?.planId || ''),
    namespace: String(namespace || latestExecuteResult?.namespace || 'app.agent'),
    actions,
    actionResults: nextActionResults,
    toolCalls: latestExecuteResult?.toolCalls || [],
    auditId: latestExecuteResult?.auditId,
    traceId: latestExecuteResult?.traceId,
    pageSummary: latestExecuteResult?.pageSummary,
    clientHandledActions: latestExecuteResult?.clientHandledActions,
  });
  return {
    ...rebuilt,
    status: 'cancelled',
    workflowRun: rebuilt.workflowRun
      ? {
          ...rebuilt.workflowRun,
          status: 'cancelled',
          blockedReason: 'cancelled',
          updatedAt: new Date().toISOString(),
          pendingTask: null,
        }
      : rebuilt.workflowRun,
  };
};

const buildRunHistoryEvent = ({type, latestExecuteResult, message, details} = {}) => ({
  type: typeof type === 'string' && type.trim() ? type.trim() : 'updated',
  status: String(
    latestExecuteResult?.workflowRun?.status || latestExecuteResult?.status || '',
  ).trim(),
  message:
    typeof message === 'string' && message.trim()
      ? message.trim()
      : String(latestExecuteResult?.status || 'workflow_updated'),
  details: details && typeof details === 'object' ? cloneJson(details) : undefined,
});


const readAgentPlanningMemory = ({agentMemoryStore, userId, namespace}) => {
  const preferences = agentMemoryStore.query({
    userId,
    namespace,
    key: MEMORY_KEY_USER_PREFERENCES,
  });
  const outcomes = agentMemoryStore.query({
    userId,
    namespace,
    key: MEMORY_KEY_TASK_OUTCOMES,
  });
  return {
    userPreferences: preferences?.value && typeof preferences.value === 'object' ? preferences.value : {},
    taskOutcomes: Array.isArray(outcomes?.value?.items) ? outcomes.value.items : [],
  };
};

const recordAgentOutcomeMemory = ({agentMemoryStore, userId, namespace, executeResult}) => {
  const current = agentMemoryStore.query({
    userId,
    namespace,
    key: MEMORY_KEY_TASK_OUTCOMES,
  });
  const existing = Array.isArray(current?.value?.items) ? current.value.items : [];

  const firstFailed = (Array.isArray(executeResult?.actionResults) ? executeResult.actionResults : []).find(
    item => item?.status === 'failed',
  );
  const topCard = Array.isArray(executeResult?.resultCards) ? executeResult.resultCards[0] : null;
  const outcome = {
    id: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    executionId: String(executeResult?.executionId || ''),
    planId: String(executeResult?.planId || ''),
    status: String(executeResult?.status || ''),
    completionScore: Number(executeResult?.completionScore || 0),
    nextRequiredContext: String(executeResult?.workflowState?.nextRequiredContext || ''),
    topResultCardKind: String(topCard?.kind || ''),
    errorCode: String(firstFailed?.errorCode || ''),
  };

  const seen = new Set();
  const deduped = [outcome, ...existing].filter(item => {
    const fp = buildOutcomeFingerprint(item);
    if (!fp || seen.has(fp)) {
      return false;
    }
    seen.add(fp);
    return true;
  }).slice(0, MAX_TASK_OUTCOMES);

  agentMemoryStore.upsert({
    userId,
    namespace,
    key: MEMORY_KEY_TASK_OUTCOMES,
    value: {items: deduped},
    ttlSeconds: 90 * 24 * 60 * 60,
  });
  return true;
};

const updateUserPreferenceMemory = ({agentMemoryStore, userId, namespace, patch}) => {
  if (!patch || typeof patch !== 'object') {
    return;
  }
  const current = agentMemoryStore.query({
    userId,
    namespace,
    key: MEMORY_KEY_USER_PREFERENCES,
  });
  const prev = current?.value && typeof current.value === 'object' ? current.value : {};
  const next = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  agentMemoryStore.upsert({
    userId,
    namespace,
    key: MEMORY_KEY_USER_PREFERENCES,
    value: next,
    ttlSeconds: 180 * 24 * 60 * 60,
  });
};

const createAgentModule = ({
  getAuthMiddleware,
  getCommunityRepo,
  getSettingsRepo,
  getModelingService,
  getModelingConfig,
} = {}) => {
  const router = express.Router();
  const agentExecutionService = createAgentExecutionService({
    resolveServices: () => ({
      communityRepo: (typeof getCommunityRepo === 'function' ? getCommunityRepo() : null) || null,
      settingsRepo: (typeof getSettingsRepo === 'function' ? getSettingsRepo() : null) || null,
      modelingService:
        (typeof getModelingService === 'function' ? getModelingService() : null) || null,
      modelingConfig:
        (typeof getModelingConfig === 'function' ? getModelingConfig() : null) || null,
    }),
  });
  const buildRuntimeBlockedActionSet = () => {
    const blocked = new Set();
    const communityRepo =
      (typeof getCommunityRepo === 'function' ? getCommunityRepo() : null) || null;
    if (!communityRepo || typeof communityRepo.createDraft !== 'function') {
      blocked.add('community::create_draft');
    }
    if (!communityRepo || typeof communityRepo.publishDraft !== 'function') {
      blocked.add('community::publish_draft');
    }

    const modelingService =
      (typeof getModelingService === 'function' ? getModelingService() : null) || null;
    if (!modelingService || typeof modelingService.createTask !== 'function') {
      blocked.add('convert::start_task');
    }

    const settingsRepo =
      (typeof getSettingsRepo === 'function' ? getSettingsRepo() : null) || null;
    if (!settingsRepo || typeof settingsRepo.updateMySettings !== 'function') {
      blocked.add('settings::apply_patch');
    }

    return blocked;
  };
  const agentMemoryStore = createAgentMemoryStore({
    filePath: process.env.AGENT_MEMORY_PATH || path.resolve(__dirname, '../../data/agent-memory.json'),
  });
  const agentRunStore = createAgentRunStore({
    filePath: process.env.AGENT_RUNS_PATH || path.resolve(__dirname, '../../data/agent-runs.json'),
  });
  const metrics = {
    planTotal: 0,
    planFallbackLocal: 0,
    planFallbackDirect: 0,
    planWorkflowHit: 0,
    planByInputSource: {
      text: 0,
      voice: 0,
    },
    executeTotal: 0,
    workflowCompleted: 0,
    contextIntercepted: 0,
    contextRecovered: 0,
    confirmRequested: 0,
    confirmApproved: 0,
    actionApplied: 0,
    actionFailed: 0,
    actionPending: 0,
    actionClientRequired: 0,
    rollbackAvailable: 0,
    executeLatencyTotalMs: 0,
    executeLatencySamples: 0,
    scopeCheckTotal: 0,
    scopeCheckPassed: 0,
    blockedByPolicyCount: 0,
    failureCodeCounts: {},
    mcpToolCallsTotal: 0,
    mcpToolCallsSuccess: 0,
    mcpToolLatencyTotalMs: 0,
    mcpToolLatencySamples: 0,
    mcpFailureCodeCounts: {},
    mcpByServer: {},
    mcpByTool: {},
    mcpConfirmIntercepted: 0,
    workerScanCount: 0,
    workerDequeueCount: 0,
    workerProcessSuccess: 0,
    workerProcessError: 0,
    workerRetryBackoffCount: 0,
    recoveryByTool: {},
    strategyMetrics: {
      fast: {planLatencyMs: [], executeTotal: 0, executeSuccess: 0, interruption: 0},
      quality: {planLatencyMs: [], executeTotal: 0, executeSuccess: 0, interruption: 0},
      cost: {planLatencyMs: [], executeTotal: 0, executeSuccess: 0, interruption: 0},
      adaptive: {planLatencyMs: [], executeTotal: 0, executeSuccess: 0, interruption: 0},
    },
  };

  const incrementFailureCode = code => {
    const normalized = String(code || 'unknown').trim() || 'unknown';
    metrics.failureCodeCounts[normalized] = Number(metrics.failureCodeCounts[normalized] || 0) + 1;
  };

  const incrementMapCounter = (container, key) => {
    const normalized = String(key || 'unknown').trim() || 'unknown';
    container[normalized] = Number(container[normalized] || 0) + 1;
  };

  const safeRate = (numerator, denominator) => {
    if (!Number.isFinite(denominator) || denominator <= 0) {
      return 0;
    }
    return Number((numerator / denominator).toFixed(4));
  };

const createStrategyMetricBucket = () => ({
    planLatencyMs: [],
    executeTotal: 0,
    executeSuccess: 0,
    interruption: 0,
  });

  const toPercentile = (values, pct) => {
    const sorted = Array.isArray(values)
      ? values
          .filter(item => Number.isFinite(Number(item)))
          .map(Number)
          .sort((a, b) => a - b)
      : [];
    if (sorted.length === 0) {
      return 0;
    }
    const index = Math.max(
      0,
      Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1),
    );
    return Number(sorted[index].toFixed(2));
  };

  const appendPlanLatency = (bucket, latencyMs) => {
    if (!bucket || !Number.isFinite(Number(latencyMs))) {
      return;
    }
    bucket.planLatencyMs.push(Number(latencyMs));
    if (bucket.planLatencyMs.length > 120) {
      bucket.planLatencyMs = bucket.planLatencyMs.slice(bucket.planLatencyMs.length - 120);
    }
  };

  const resolveStrategyMetricKey = ({strategy, source}) => {
    const normalizedStrategy = String(strategy || '').trim().toLowerCase();
    const normalizedSource = String(source || '').trim().toLowerCase();
    if (normalizedSource === 'adaptive') {
      return 'adaptive';
    }
    if (normalizedStrategy === 'quality' || normalizedStrategy === 'cost' || normalizedStrategy === 'fast') {
      return normalizedStrategy;
    }
    return 'adaptive';
  };

  const buildStrategyMetricSnapshot = bucket => ({
    planLatencyP50Ms: toPercentile(bucket?.planLatencyMs || [], 50),
    planLatencyP95Ms: toPercentile(bucket?.planLatencyMs || [], 95),
    executeSuccessRate: safeRate(Number(bucket?.executeSuccess || 0), Number(bucket?.executeTotal || 0)),
    interruptionRate: safeRate(Number(bucket?.interruption || 0), Number(bucket?.executeTotal || 0)),
    sampleCount: Number(bucket?.executeTotal || 0),
  });

  const buildMetricsSnapshot = () => ({
    ...metrics,
    averageExecuteLatencyMs:
      metrics.executeLatencySamples > 0
        ? Number((metrics.executeLatencyTotalMs / metrics.executeLatencySamples).toFixed(2))
        : 0,
    rates: {
      planHitRate: safeRate(metrics.planWorkflowHit, metrics.planTotal),
      endToEndCompletionRate: safeRate(metrics.workflowCompleted, metrics.executeTotal),
      contextRecoveryRate: safeRate(metrics.contextRecovered, metrics.contextIntercepted),
      confirmPassRate: safeRate(metrics.confirmApproved, metrics.confirmRequested),
      scopePassRate: safeRate(metrics.scopeCheckPassed, metrics.scopeCheckTotal),
      mcpToolSuccessRate: safeRate(metrics.mcpToolCallsSuccess, metrics.mcpToolCallsTotal),
      mcpConfirmInterceptRate: safeRate(metrics.mcpConfirmIntercepted, metrics.executeTotal),
    },
    mcp: {
      totalCalls: metrics.mcpToolCallsTotal,
      totalSuccess: metrics.mcpToolCallsSuccess,
      averageLatencyMs:
        metrics.mcpToolLatencySamples > 0
          ? Number((metrics.mcpToolLatencyTotalMs / metrics.mcpToolLatencySamples).toFixed(2))
          : 0,
      byServer: metrics.mcpByServer,
      byTool: metrics.mcpByTool,
      failureCodeCounts: metrics.mcpFailureCodeCounts,
    },
    worker: {
      scanCount: agentRunWorker?.getSnapshot?.().scanCount || metrics.workerScanCount,
      dequeueCount: agentRunWorker?.getSnapshot?.().dequeueCount || metrics.workerDequeueCount,
      processSuccess: agentRunWorker?.getSnapshot?.().processSuccess || metrics.workerProcessSuccess,
      processError: agentRunWorker?.getSnapshot?.().processError || metrics.workerProcessError,
      retryBackoffCount: agentRunWorker?.getSnapshot?.().retryBackoffCount || metrics.workerRetryBackoffCount,
      queueDepth: agentRunWorker?.getSnapshot?.().queueDepth || 0,
      processing: Boolean(agentRunWorker?.getSnapshot?.().processing),
    },
    recovery: {
      byTool: metrics.recoveryByTool,
    },
    strategyMetrics: {
      fast: buildStrategyMetricSnapshot(metrics.strategyMetrics.fast),
      quality: buildStrategyMetricSnapshot(metrics.strategyMetrics.quality),
      cost: buildStrategyMetricSnapshot(metrics.strategyMetrics.cost),
      adaptive: buildStrategyMetricSnapshot(metrics.strategyMetrics.adaptive),
    },
  });

  const kickRunWorkerIfNeeded = latestExecuteResult => {
    const runStatus = String(
      latestExecuteResult?.workflowRun?.status || latestExecuteResult?.status || '',
    ).trim();
    if (runStatus !== 'waiting_async_result') {
      return;
    }
    Promise.resolve(agentRunWorker?.scan?.()).catch(() => undefined);
  };

  const persistRunRecord = ({runId, userId, namespace, actions, latestExecuteResult, event}) => {
    const stored = agentRunStore.upsert(
      {
        runId,
        userId,
        namespace,
        planId: latestExecuteResult?.planId || '',
        actions: cloneJson(actions || []),
        latestExecuteResult: sanitizeAgentPayloadForTransport(cloneJson(latestExecuteResult || null)),
      },
      {
        event,
      },
    );
    kickRunWorkerIfNeeded(latestExecuteResult);
    return stored;
  };

  const getStoredRunForUser = ({runId, userId}) => {
    const record = agentRunStore.get(runId);
    if (!record || String(record.userId || '') !== String(userId || '')) {
      return null;
    }
    return {
      ...record,
      latestExecuteResult: sanitizeAgentPayloadForTransport(
        cloneJson(record.latestExecuteResult || null),
      ),
    };
  };

  const getStoredRunHistoryForUser = ({runId, userId}) => {
    const record = getStoredRunForUser({runId, userId});
    if (!record) {
      return null;
    }
    return Array.isArray(record.history) ? record.history : [];
  };

    const asyncRecoveryRegistry = createAgentAsyncRecoveryRegistry({
    getModelingService,
    getModelingConfig,
    rebuildExecutePayload,
  });

  const refreshRunIfNeeded = async (record, options = {}) => {
    const latestExecuteResult = cloneJson(record?.latestExecuteResult || null);
    if (latestExecuteResult?.workflowRun?.status !== 'waiting_async_result') {
      return {
        result: latestExecuteResult,
        changed: false,
      };
    }
    const recovered = await asyncRecoveryRegistry.refreshRecord(record);
    return {
      result: recovered?.result || latestExecuteResult,
      changed: Boolean(recovered?.changed),
      recoveryEvent: recovered?.recoveryEvent,
      source: options.source || 'manual_refresh',
    };
  };

  const resolveRetryActionIds = ({actions, latestExecuteResult, requestedActionIds}) => {
    const requestedSet = new Set(
      (Array.isArray(requestedActionIds) ? requestedActionIds : [])
        .map(item => String(item || '').trim())
        .filter(Boolean),
    );
    const statusByActionId = new Map(
      (Array.isArray(latestExecuteResult?.actionResults) ? latestExecuteResult.actionResults : []).map(item => [
        String(item?.action?.actionId || item?.action?.id || ''),
        String(item?.status || '').trim(),
      ]),
    );
    const retryableStatuses = new Set([
      'failed',
      'client_required',
      'blocked',
      'pending_confirm',
      'skipped',
    ]);
    const candidates = (Array.isArray(actions) ? actions : [])
      .filter(action => {
        const actionId = String(action?.actionId || action?.id || '').trim();
        if (!actionId) {
          return false;
        }
        if (requestedSet.size > 0) {
          return requestedSet.has(actionId);
        }
        const status = statusByActionId.get(actionId);
        return retryableStatuses.has(status || '');
      })
      .map(action => String(action?.actionId || action?.id || '').trim())
      .filter(Boolean);

    if (candidates.length > 0) {
      return candidates;
    }

    if (String(latestExecuteResult?.status || '').trim() === 'cancelled') {
      return (Array.isArray(actions) ? actions : [])
        .map(action => String(action?.actionId || action?.id || '').trim())
        .filter(actionId => {
          const status = statusByActionId.get(actionId);
          return status !== 'applied';
        });
    }

    return [];
  };

  const ensureBypassUser = async bypassUser => {
    const settingsRepo = (typeof getSettingsRepo === 'function' ? getSettingsRepo() : null) || null;
    if (!settingsRepo || typeof settingsRepo.ensureAuthUser !== 'function') {
      return;
    }
    await settingsRepo.ensureAuthUser({
      id: bypassUser.id,
      username: bypassUser.username,
      isBypass: true,
    });
    };

  const workerIntervalMs = Math.max(1500, Number(process.env.AGENT_RUN_WORKER_INTERVAL_MS || 4000));
  let agentRunWorker = null;

  const processAsyncRunById = async runId => {
    const record = agentRunStore.get(runId);
    if (!record) {
      return false;
    }
    const recovered = await refreshRunIfNeeded(record, {
      source: 'worker',
    });
    if (!recovered?.result || !recovered.changed) {
      return false;
    }

    const previousStatus = String(
      record?.latestExecuteResult?.workflowRun?.status || record?.latestExecuteResult?.status || '',
    ).trim();
    const nextStatus = String(
      recovered?.result?.workflowRun?.status || recovered?.result?.status || '',
    ).trim();

    persistRunRecord({
      runId: String(record.runId || ''),
      userId: String(record.userId || ''),
      namespace: String(record.namespace || recovered.result.namespace || 'app.agent'),
      actions: Array.isArray(record.actions) ? record.actions : [],
      latestExecuteResult: recovered.result,
      event:
        recovered.recoveryEvent ||
        buildRunHistoryEvent({
          type: 'async_worker_refresh',
          latestExecuteResult: recovered.result,
          message:
            previousStatus !== nextStatus
              ? `后台任务状态已更新为 ${nextStatus}`
              : '后台任务已刷新',
          details: {
            previousStatus,
            nextStatus,
            source: 'worker',
          },
        }),
    });

    incrementMapCounter(metrics.recoveryByTool, 'convert.start_task');
    return true;
  };

  agentRunWorker = createAgentRunWorker({
    intervalMs: workerIntervalMs,
    listRunnableRuns: () => agentRunStore.listByStatuses(['waiting_async_result']),
    processRun: async runId => {
      const changed = await processAsyncRunById(runId);
      return changed;
    },
    onError: (_error, _runId, _delayMs) => {
      // errors are recorded via worker metrics snapshot
    },
  });

  const requireAgentAuth = async (req, res, next) => {
    const authMiddleware = typeof getAuthMiddleware === 'function' ? getAuthMiddleware() : null;
    if (authMiddleware) {
      return authMiddleware(req, res, next);
    }
    if (!isAuthBypassEnabled()) {
      sendError(res, 503, 'AUTH_MODULE_UNAVAILABLE', 'auth_module_unavailable');
      return undefined;
    }
    const bypassUser = getAuthBypassUser();
    try {
      await ensureBypassUser(bypassUser);
    } catch (error) {
      sendError(
        res,
        500,
        'AUTH_BYPASS_USER_INIT_FAILED',
        error?.message || 'auth_bypass_user_init_failed',
      );
      return undefined;
    }
    req.user = {
      ...bypassUser,
      id: String(bypassUser.id),
      scopes: ['*'],
    };
    next();
    return undefined;
  };

  router.post('/plan', requireAgentAuth, async (req, res) => {
    const planStartedAt = Date.now();
    const validation = validateAgentPlanRequest(req.body);
    if (!validation.ok) {
      sendError(res, 400, 'BAD_REQUEST', validation.message);
      return;
    }

    const userId = String(req.user?.id || '').trim();
    if (!userId) {
      sendError(res, 401, 'UNAUTHORIZED', 'unauthorized');
      return;
    }
    const namespace = 'app.agent';
    const planningMemory = readAgentPlanningMemory({
      agentMemoryStore,
      userId,
      namespace,
    });
    const requestedStrategy = normalizeExecutionStrategyValue(req.body?.executionStrategy);

    const rawPlan = await planAgentActions({
      ...req.body,
      userId,
      executionStrategy: requestedStrategy || req.body?.executionStrategy,
      userMemory: planningMemory,
    });
    const adaptedPlan = adaptPlannerPlanPayload({
      rawPlan,
      requestBody: req.body,
      requestedCapabilitySet: buildRequestedCapabilitySet(req.body),
      runtimeBlockedActionSet: buildRuntimeBlockedActionSet(),
    });
    let normalized = normalizeAgentPlanResponse(adaptedPlan);
    if (!normalized) {
      const fallbackPlan = buildNormalizationFallbackPlan({
        requestBody: req.body,
        rawPlan: adaptedPlan,
        reason: 'plan_normalization_failed',
      });
      normalized = normalizeAgentPlanResponse(fallbackPlan);
    }
    if (!normalized) {
      sendError(res, 500, 'PLAN_NORMALIZATION_FAILED', 'agent plan normalization failed');
      return;
    }
    const inputSource = req.body?.inputSource === 'voice' ? 'voice' : 'text';
    const planLatencyMs = Math.max(0, Date.now() - planStartedAt);
    const planStrategyMetricKey = resolveStrategyMetricKey({
      strategy: normalized.executionStrategy,
      source: normalized.strategySource,
    });
    appendPlanLatency(metrics.strategyMetrics[planStrategyMetricKey], planLatencyMs);
    metrics.planTotal += 1;
    metrics.planByInputSource[inputSource] =
      Number(metrics.planByInputSource[inputSource] || 0) + 1;
    if (normalized.plannerSource === 'local') {
      metrics.planFallbackLocal += 1;
    }
    if (normalized.fallback?.used === true || normalized.decisionPath === 'fallback_direct') {
      metrics.planFallbackDirect += 1;
    }
    if (
      normalized.actions.some(action =>
        ['grading', 'convert', 'community'].includes(String(action.stage || '')),
      )
    ) {
      metrics.planWorkflowHit += 1;
    }
    const stageSet = new Set(
      (Array.isArray(normalized.actions) ? normalized.actions : [])
        .map(item => String(item.stage || '').trim())
        .filter(Boolean),
    );
    console.log(
      '[agent-plan]',
      JSON.stringify({
        planId: normalized.planId,
        userId,
        inputSource,
        plannerSource: normalized.plannerSource,
        actionCount: normalized.actions.length,
        stages: Array.from(stageSet),
        selectedSkillPack: normalized.selectedSkillPack || '',
        executionStrategy: normalized.executionStrategy || '',
        strategySource: normalized.strategySource || '',
        decisionPath: normalized.decisionPath || 'planned',
        fallbackUsed: normalized.fallback?.used === true,
        fallbackReason: normalized.fallback?.reason || '',
        planLatencyMs,
      }),
    );
    res.json(normalized);
  });

  router.post('/execute', requireAgentAuth, async (req, res) => {
    const validation = validateExecuteRequest(req.body);
    if (!validation.ok) {
      sendError(res, 400, 'BAD_REQUEST', validation.message);
      return;
    }

    const payload = validation.payload;
    const userId = String(req.user?.id || payload.userId || '').trim();
    if (!userId) {
      sendError(res, 401, 'UNAUTHORIZED', 'unauthorized');
      return;
    }
    const grantedScopes = resolveAgentGrantedScopes(req);
    const debugOverride = Boolean(req.user?.isBypass) || isAuthBypassEnabled();
    const namespace = payload.namespace || 'app.agent';
    const planningMemory = readAgentPlanningMemory({
      agentMemoryStore,
      userId,
      namespace,
    });
    const requestedStrategy = normalizeExecutionStrategyValue(req.body?.executionStrategy);
    const strategyDecision = chooseExecutionStrategyWithSource({
      requestedStrategy,
      memory: planningMemory,
      goal: req.body?.intent?.goal || '',
      actions: payload.actions,
    });
    const appliedStrategy = strategyDecision.strategy;
    const executeStartedAt = Date.now();
    const result = await agentExecutionService.execute({
      ...payload,
      userId,
      namespace,
      grantedScopes,
      debugOverride,
    });
    const runId = String(result?.workflowRun?.runId || result?.executionId || '').trim();
    if (runId) {
      const rebuilt = rebuildExecutePayload({
        runId,
        executionId: String(result.executionId || runId),
        planId: String(result.planId || payload.planId),
        namespace: String(result.namespace || namespace),
        actions: payload.actions,
          actionResults: result.actionResults,
          toolCalls: result.toolCalls,
          auditId: result.auditId,
          traceId: result.traceId,
          pageSummary: result.pageSummary,
        clientHandledActions: result.clientHandledActions,
        appliedStrategy,
      });
      result.status = rebuilt.status;
      result.actionResults = rebuilt.actionResults;
      result.appliedActions = rebuilt.appliedActions;
      result.failedActions = rebuilt.failedActions;
      result.pendingActions = rebuilt.pendingActions;
      result.clientRequiredActions = rebuilt.clientRequiredActions;
      result.rollbackAvailable = rebuilt.rollbackAvailable;
      result.workflowState = rebuilt.workflowState;
      result.workflowRun = rebuilt.workflowRun;
      result.resultCards = rebuilt.resultCards;
      result.completionScore = rebuilt.completionScore;
      result.recoverySuggestions = rebuilt.recoverySuggestions;
      result.resultSummary = rebuilt.resultSummary;
      result.appliedStrategy = rebuilt.appliedStrategy;
      persistRunRecord({
        runId,
        userId,
        namespace,
        actions: payload.actions,
        latestExecuteResult: rebuilt,
        event: buildRunHistoryEvent({
          type: 'executed',
          latestExecuteResult: rebuilt,
          message: '已创建并执行工作流',
          details: {
            actionCount: rebuilt.actionResults.length,
            planId: rebuilt.planId,
          },
        }),
      });
    }
    let outcomeRecorded = false;
    try {
      outcomeRecorded = recordAgentOutcomeMemory({
        agentMemoryStore,
        userId,
        namespace,
        executeResult: result,
      });
      updateUserPreferenceMemory({
        agentMemoryStore,
        userId,
        namespace,
        patch: {
          preferredExecutionStrategy: appliedStrategy,
        },
      });
    } catch {
      outcomeRecorded = false;
    }
    result.appliedStrategy = appliedStrategy;
    result.outcomeRecorded = outcomeRecorded;

    const executeLatencyMs = Math.max(0, Date.now() - executeStartedAt);
    const executeStrategyMetricKey = resolveStrategyMetricKey({
      strategy: appliedStrategy,
      source: strategyDecision.source,
    });
    const executeStrategyBucket = metrics.strategyMetrics[executeStrategyMetricKey] || metrics.strategyMetrics.adaptive;
    executeStrategyBucket.executeTotal += 1;
    if (result.status === 'applied') {
      executeStrategyBucket.executeSuccess += 1;
    }
    if (result.status === 'cancelled' || result.status === 'failed' || result.status === 'client_required') {
      executeStrategyBucket.interruption += 1;
    }
    metrics.executeTotal += 1;
    metrics.executeLatencyTotalMs += executeLatencyMs;
    metrics.executeLatencySamples += 1;
    if (result.status === 'applied') {
      metrics.workflowCompleted += 1;
    }
    if (result.workflowState?.nextRequiredContext) {
      metrics.contextIntercepted += 1;
    }
    if (
      !result.workflowState?.nextRequiredContext &&
      Array.isArray(payload.actionIds) &&
      payload.actionIds.length > 0 &&
      payload.allowConfirmActions !== true &&
      result.appliedActions.length > 0
    ) {
      metrics.contextRecovered += 1;
    }
    if (result.pendingActions.length > 0) {
      metrics.confirmRequested += result.pendingActions.length;
    }
    if (payload.allowConfirmActions === true) {
      const approvedCount = result.actionResults.filter(
        item => item.status === 'applied' && item.action?.requiresConfirmation === true,
      ).length;
      metrics.confirmApproved += approvedCount;
    }
    metrics.actionApplied += result.appliedActions.length;
    metrics.actionFailed += result.failedActions.length;
    metrics.actionPending += result.pendingActions.length;
    metrics.actionClientRequired += Array.isArray(result.clientRequiredActions)
      ? result.clientRequiredActions.length
      : 0;
    metrics.mcpConfirmIntercepted += result.pendingActions.length;
    const toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
    for (const call of toolCalls) {
      metrics.mcpToolCallsTotal += 1;
      metrics.mcpToolLatencyTotalMs += Math.max(0, Number(call.latencyMs || 0));
      metrics.mcpToolLatencySamples += 1;
      incrementMapCounter(metrics.mcpByServer, call.serverId || 'unknown');
      incrementMapCounter(metrics.mcpByTool, `${call.serverId || 'unknown'}:${call.toolName || 'unknown'}`);
      if (call.status === 'applied' || call.status === 'client_required') {
        metrics.mcpToolCallsSuccess += 1;
      } else if (call.status === 'failed') {
        const match = result.actionResults.find(
          item =>
            item.action?.actionId === call.actionId &&
            (item.status === 'failed' || item.status === 'client_required'),
        );
        incrementMapCounter(metrics.mcpFailureCodeCounts, match?.errorCode || 'tool_error');
      }
    }
    if (result.rollbackAvailable) {
      metrics.rollbackAvailable += 1;
    }
    const scopedResults = result.actionResults.filter(
      item => Array.isArray(item.action?.requiredScopes) && item.action.requiredScopes.length > 0,
    );
    const scopePassed = scopedResults.filter(item => item.errorCode !== 'forbidden_scope').length;
    metrics.scopeCheckTotal += scopedResults.length;
    metrics.scopeCheckPassed += scopePassed;
    const blockedByPolicyCount = result.actionResults.filter(
      item => item.errorCode === 'forbidden_scope' || item.errorCode === 'confirmation_required',
    ).length;
    metrics.blockedByPolicyCount += blockedByPolicyCount;
    result.actionResults.forEach(item => {
      if (item.errorCode) {
        incrementFailureCode(item.errorCode);
      }
    });
    const firstFailure = result.actionResults.find(item => item.status === 'failed');
    const failureReplayContext = firstFailure
      ? {
          planId: result.planId,
          executionId: result.executionId,
          namespace: result.namespace || payload.namespace || 'app.agent',
          allowConfirmActions: payload.allowConfirmActions === true,
          actionIds: Array.isArray(payload.actionIds) ? payload.actionIds : [],
          grantedScopesCount: grantedScopes.length,
          nextRequiredContext: result.workflowState?.nextRequiredContext || '',
          workflowStep: `${Number(result.workflowState?.currentStep || 0)}/${Number(
            result.workflowState?.totalSteps || 0,
          )}`,
          failedAction: {
            actionId: firstFailure.action?.actionId || '',
            domain: firstFailure.action?.domain || '',
            operation: firstFailure.action?.operation || '',
            argsKeys: Object.keys(firstFailure.action?.args || {}),
            errorCode: firstFailure.errorCode || '',
            message: firstFailure.message || '',
          },
          mcpTrace: Array.isArray(result.toolCalls)
            ? result.toolCalls
                .filter(item => item.actionId === firstFailure.action?.actionId)
                .map(item => ({
                  serverId: item.serverId || '',
                  toolName: item.toolName || '',
                  status: item.status || '',
                  requestId: item.requestId || '',
                }))
            : [],
        }
      : null;
    console.log(
      '[agent-execute]',
      JSON.stringify({
        planId: result.planId,
        executionId: result.executionId,
        status: result.status,
        actionCount: result.actionResults.length,
        appliedCount: result.appliedActions.length,
        pendingCount: result.pendingActions.length,
        failedCount: result.failedActions.length,
        latencyMs: executeLatencyMs,
        nextRequiredContext: result.workflowState?.nextRequiredContext || '',
        firstFailure: failureReplayContext?.failedAction || null,
        failureReplayContext,
        auditId: result.auditId || '',
        traceId: result.traceId || '',
        toolCalls: Array.isArray(result.toolCalls) ? result.toolCalls.length : 0,
        appliedStrategy,
        strategySource: strategyDecision.source,
      }),
    );
    res.json(result);
  });

  router.post('/runs/register', requireAgentAuth, async (req, res) => {
    const userId = String(req.user?.id || '').trim();
    if (!userId) {
      sendError(res, 401, 'UNAUTHORIZED', 'unauthorized');
      return;
    }
    const body = req.body && typeof req.body === 'object' ? req.body : null;
    const planId = typeof body?.planId === 'string' ? body.planId.trim() : '';
    const namespace =
      typeof body?.namespace === 'string' && body.namespace.trim() ? body.namespace.trim() : 'app.agent';
    const actions = Array.isArray(body?.actions)
      ? body.actions
          .map((item, index) => normalizeAgentAction(item, index, planId || 'plan_waiting_context'))
          .filter(Boolean)
      : [];
    const latestExecuteResult =
      body?.latestExecuteResult && typeof body.latestExecuteResult === 'object'
        ? cloneJson(body.latestExecuteResult)
        : null;

    if (!planId || actions.length === 0 || !latestExecuteResult) {
      sendError(res, 400, 'BAD_REQUEST', 'planId, actions, latestExecuteResult are required');
      return;
    }

    const runId =
      typeof body?.runId === 'string' && body.runId.trim()
        ? body.runId.trim()
        : `run_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const rebuilt = rebuildExecutePayload({
      runId,
      executionId: String(latestExecuteResult.executionId || runId),
      planId,
      namespace,
      actions,
        actionResults: latestExecuteResult.actionResults || [],
        toolCalls: latestExecuteResult.toolCalls || [],
        auditId: latestExecuteResult.auditId,
        traceId: latestExecuteResult.traceId,
        pageSummary: latestExecuteResult.pageSummary,
      clientHandledActions: latestExecuteResult.clientHandledActions,
    });
    persistRunRecord({
      runId,
      userId,
      namespace,
      actions,
      latestExecuteResult: rebuilt,
      event: buildRunHistoryEvent({
        type: 'registered',
        latestExecuteResult: rebuilt,
        message: '已注册待续跑工作流',
      }),
    });
    res.json(rebuilt);
  });

  router.get('/runs/:runId', requireAgentAuth, async (req, res) => {
    const userId = String(req.user?.id || '').trim();
    if (!userId) {
      sendError(res, 401, 'UNAUTHORIZED', 'unauthorized');
      return;
    }
    const record = getStoredRunForUser({
      runId: req.params.runId,
      userId,
    });
    if (!record?.latestExecuteResult) {
      sendError(res, 404, 'RUN_NOT_FOUND', 'agent_workflow_run_not_found');
      return;
    }

    let latestExecuteResult = cloneJson(record.latestExecuteResult);
    if (latestExecuteResult?.workflowRun?.status === 'waiting_async_result') {
      const refreshed = await refreshRunIfNeeded(record);
      latestExecuteResult = refreshed.result || latestExecuteResult;
      persistRunRecord({
        runId: String(record.runId || req.params.runId),
        userId,
        namespace: String(record.namespace || latestExecuteResult?.namespace || 'app.agent'),
        actions: record.actions,
        latestExecuteResult,
        event: buildRunHistoryEvent({
          type: 'async_refreshed',
          latestExecuteResult,
          message: '已刷新后台任务状态',
          details: {source: 'get_run'},
        }),
      });
    }
    res.json(latestExecuteResult);
  });

  router.get('/runs/:runId/history', requireAgentAuth, async (req, res) => {
    const userId = String(req.user?.id || '').trim();
    if (!userId) {
      sendError(res, 401, 'UNAUTHORIZED', 'unauthorized');
      return;
    }
    const record = getStoredRunForUser({
      runId: req.params.runId,
      userId,
    });
    if (!record?.latestExecuteResult) {
      sendError(res, 404, 'RUN_NOT_FOUND', 'agent_workflow_run_not_found');
      return;
    }
    res.json({
      ok: true,
      runId: String(record.runId || req.params.runId),
      planId: String(record.planId || record.latestExecuteResult.planId || ''),
      history: getStoredRunHistoryForUser({
        runId: req.params.runId,
        userId,
      }),
      latestExecuteResult: cloneJson(record.latestExecuteResult),
    });
  });

  router.post('/runs/:runId/cancel', requireAgentAuth, async (req, res) => {
    const userId = String(req.user?.id || '').trim();
    if (!userId) {
      sendError(res, 401, 'UNAUTHORIZED', 'unauthorized');
      return;
    }
    const record = getStoredRunForUser({
      runId: req.params.runId,
      userId,
    });
    if (!record?.latestExecuteResult) {
      sendError(res, 404, 'RUN_NOT_FOUND', 'agent_workflow_run_not_found');
      return;
    }
    const cancelled = buildCancelledExecutePayload({
      runId: String(record.runId || req.params.runId),
      latestExecuteResult: record.latestExecuteResult,
      actions: Array.isArray(record.actions) ? record.actions : [],
      namespace: String(record.namespace || 'app.agent'),
    });
    persistRunRecord({
      runId: String(record.runId || req.params.runId),
      userId,
      namespace: String(record.namespace || 'app.agent'),
      actions: Array.isArray(record.actions) ? record.actions : [],
      latestExecuteResult: cancelled,
      event: buildRunHistoryEvent({
        type: 'cancelled',
        latestExecuteResult: cancelled,
        message: '工作流已取消',
      }),
    });
    res.json(cancelled);
  });

  router.post('/runs/:runId/resume', requireAgentAuth, async (req, res) => {
    const userId = String(req.user?.id || '').trim();
    if (!userId) {
      sendError(res, 401, 'UNAUTHORIZED', 'unauthorized');
      return;
    }
    const record = getStoredRunForUser({
      runId: req.params.runId,
      userId,
    });
    if (!record?.latestExecuteResult) {
      sendError(res, 404, 'RUN_NOT_FOUND', 'agent_workflow_run_not_found');
      return;
    }

    const grantedScopes = resolveAgentGrantedScopes(req);
    const debugOverride = Boolean(req.user?.isBypass) || isAuthBypassEnabled();
    const allowConfirmActions = req.body?.allowConfirmActions === true;
    const contextPatch = normalizeResumeContextPatch(req.body);
    let latestExecuteResult = cloneJson(record.latestExecuteResult);
    let actions = enrichActionsForResume(record.actions, latestExecuteResult);
    const runId = String(record.runId || req.params.runId || latestExecuteResult?.workflowRun?.runId || latestExecuteResult?.executionId || '').trim();

    if (latestExecuteResult?.workflowRun?.status === 'waiting_async_result') {
      const refreshed = await refreshRunIfNeeded(record);
      latestExecuteResult = refreshed.result || latestExecuteResult;
    }

    if (contextPatch) {
      const hydrated = hydrateActionsWithContextPatch({
        actions,
        latestExecuteResult,
        contextPatch,
      });
      actions = hydrated.hydratedActions;
      if (hydrated.missingActionIds.length > 0) {
        const waitingContextResult = buildWaitingContextResumePayload({
          runId,
          latestExecuteResult,
          actions,
          namespace: String(record.namespace || latestExecuteResult.namespace || 'app.agent'),
          missingActionIds: hydrated.missingActionIds,
          nextRequiredContext: hydrated.nextRequiredContext,
        });
        persistRunRecord({
          runId,
          userId,
          namespace: String(record.namespace || waitingContextResult.namespace || 'app.agent'),
          actions,
          latestExecuteResult: waitingContextResult,
          event: buildRunHistoryEvent({
            type: 'waiting_context',
            latestExecuteResult: waitingContextResult,
            message: '仍需补齐上下文后继续',
            details: {
              nextRequiredContext: hydrated.nextRequiredContext,
            },
          }),
        });
        res.json(waitingContextResult);
        return;
      }
    }

    const actionIds = resolveResumeActionIds({
      actions,
      latestExecuteResult,
      allowConfirmActions,
    });

    if (actionIds.length === 0) {
      const rebuilt = rebuildExecutePayload({
        runId,
        executionId: String(latestExecuteResult.executionId || runId),
        planId: String(latestExecuteResult.planId || record.planId || ''),
        namespace: String(record.namespace || latestExecuteResult.namespace || 'app.agent'),
        actions,
          actionResults: latestExecuteResult.actionResults,
          toolCalls: latestExecuteResult.toolCalls,
          auditId: latestExecuteResult.auditId,
          traceId: latestExecuteResult.traceId,
          pageSummary: latestExecuteResult.pageSummary,
        clientHandledActions: latestExecuteResult.clientHandledActions,
      });
      persistRunRecord({
        runId,
        userId,
        namespace: String(record.namespace || rebuilt.namespace || 'app.agent'),
        actions,
        latestExecuteResult: rebuilt,
        event: buildRunHistoryEvent({
          type: 'resume_noop',
          latestExecuteResult: rebuilt,
          message: '当前没有可继续执行的步骤',
        }),
      });
      res.json(rebuilt);
      return;
    }

    const resumed = await agentExecutionService.execute({
      userId,
      namespace: String(record.namespace || latestExecuteResult.namespace || 'app.agent'),
      planId: String(record.planId || latestExecuteResult.planId || ''),
      actions,
      actionIds,
      allowConfirmActions,
      grantedScopes,
      debugOverride,
      idempotencyKey: `${runId}:resume:${Date.now()}`,
    });

    const merged = mergeExecutePayloads({
      base: latestExecuteResult,
      next: resumed,
      actions,
      runId,
      namespace: String(record.namespace || latestExecuteResult.namespace || 'app.agent'),
    });
    persistRunRecord({
      runId,
      userId,
      namespace: String(record.namespace || merged.namespace || 'app.agent'),
      actions,
      latestExecuteResult: merged,
      event: buildRunHistoryEvent({
        type: 'resumed',
        latestExecuteResult: merged,
        message: allowConfirmActions ? '确认后继续执行工作流' : '已继续执行工作流',
        details: {
          actionIds,
        },
      }),
    });
    res.json(merged);
  });
  router.post('/runs/:runId/callback', requireAgentAuth, async (req, res) => {
    const userId = String(req.user?.id || '').trim();
    if (!userId) {
      sendError(res, 401, 'UNAUTHORIZED', 'unauthorized');
      return;
    }
    const record = getStoredRunForUser({
      runId: req.params.runId,
      userId,
    });
    if (!record?.latestExecuteResult) {
      sendError(res, 404, 'RUN_NOT_FOUND', 'agent_workflow_run_not_found');
      return;
    }

    // callback path placeholder: currently refreshes using existing polling-based recovery.
    const recovered = await refreshRunIfNeeded(record, {source: 'callback'});
    const latestExecuteResult = recovered.result || cloneJson(record.latestExecuteResult);
    if (recovered.changed) {
      persistRunRecord({
        runId: String(record.runId || req.params.runId),
        userId,
        namespace: String(record.namespace || latestExecuteResult.namespace || 'app.agent'),
        actions: Array.isArray(record.actions) ? record.actions : [],
        latestExecuteResult,
        event:
          recovered.recoveryEvent ||
          buildRunHistoryEvent({
            type: 'callback_refreshed',
            latestExecuteResult,
            message: '已通过回调入口刷新后台任务状态',
            details: {
              source: 'callback',
            },
          }),
      });
    }

    res.json({
      ok: true,
      runId: String(record.runId || req.params.runId),
      changed: Boolean(recovered.changed),
      status: String(latestExecuteResult?.workflowRun?.status || latestExecuteResult?.status || ''),
    });
  });
  router.post('/runs/:runId/retry', requireAgentAuth, async (req, res) => {
    const userId = String(req.user?.id || '').trim();
    if (!userId) {
      sendError(res, 401, 'UNAUTHORIZED', 'unauthorized');
      return;
    }
    const record = getStoredRunForUser({
      runId: req.params.runId,
      userId,
    });
    if (!record?.latestExecuteResult) {
      sendError(res, 404, 'RUN_NOT_FOUND', 'agent_workflow_run_not_found');
      return;
    }

    const grantedScopes = resolveAgentGrantedScopes(req);
    const debugOverride = Boolean(req.user?.isBypass) || isAuthBypassEnabled();
    const allowConfirmActions = req.body?.allowConfirmActions === true;
    const refreshed = await refreshRunIfNeeded(record);
    let latestExecuteResult = refreshed.result || cloneJson(record.latestExecuteResult);
    const actions = enrichActionsForResume(record.actions, latestExecuteResult);
    const retryActionIds = resolveRetryActionIds({
      actions,
      latestExecuteResult,
      requestedActionIds: req.body?.actionIds,
    });

    if (retryActionIds.length === 0) {
      const rebuilt = rebuildExecutePayload({
        runId: String(record.runId || req.params.runId),
        executionId: String(latestExecuteResult.executionId || `retry_${Date.now()}`),
        planId: String(latestExecuteResult.planId || record.planId || ''),
        namespace: String(record.namespace || latestExecuteResult.namespace || 'app.agent'),
        actions,
          actionResults: latestExecuteResult.actionResults,
          toolCalls: latestExecuteResult.toolCalls,
          auditId: latestExecuteResult.auditId,
          traceId: latestExecuteResult.traceId,
          pageSummary: latestExecuteResult.pageSummary,
        clientHandledActions: latestExecuteResult.clientHandledActions,
      });
      persistRunRecord({
        runId: String(record.runId || req.params.runId),
        userId,
        namespace: String(record.namespace || rebuilt.namespace || 'app.agent'),
        actions,
        latestExecuteResult: rebuilt,
        event: buildRunHistoryEvent({
          type: 'retry_noop',
          latestExecuteResult: rebuilt,
          message: '没有可重试的步骤',
        }),
      });
      res.json(rebuilt);
      return;
    }

    const retried = await agentExecutionService.execute({
      userId,
      namespace: String(record.namespace || latestExecuteResult.namespace || 'app.agent'),
      planId: String(record.planId || latestExecuteResult.planId || ''),
      actions,
      actionIds: retryActionIds,
      allowConfirmActions,
      grantedScopes,
      debugOverride,
      idempotencyKey: `${record.runId || req.params.runId}:retry:${Date.now()}`,
    });
    const merged = mergeExecutePayloads({
      base: latestExecuteResult,
      next: retried,
      actions,
      runId: String(record.runId || req.params.runId),
      namespace: String(record.namespace || latestExecuteResult.namespace || 'app.agent'),
    });
    persistRunRecord({
      runId: String(record.runId || req.params.runId),
      userId,
      namespace: String(record.namespace || merged.namespace || 'app.agent'),
      actions,
      latestExecuteResult: merged,
      event: buildRunHistoryEvent({
        type: 'retried',
        latestExecuteResult: merged,
        message: '已发起工作流重试',
        details: {
          actionIds: retryActionIds,
        },
      }),
    });
    res.json(merged);
  });

  router.post('/memory/upsert', requireAgentAuth, async (req, res) => {
    const validation = validateMemoryUpsertRequest(req.body);
    if (!validation.ok) {
      sendError(res, 400, 'BAD_REQUEST', validation.message);
      return;
    }

    const userId = String(req.user?.id || req.body.userId || '').trim();
    if (!userId) {
      sendError(res, 401, 'UNAUTHORIZED', 'unauthorized');
      return;
    }
    const stored = agentMemoryStore.upsert({
      userId,
      namespace: String(req.body.namespace || '').trim(),
      key: String(req.body.key || '').trim(),
      value: req.body.value,
      ttlSeconds: req.body.ttlSeconds,
    });
    res.json({
      ok: true,
      key: req.body.key,
      version: stored.version,
      updatedAt: stored.updatedAt,
    });
  });

  router.post('/memory/query', requireAgentAuth, async (req, res) => {
    const validation = validateMemoryQueryRequest(req.body);
    if (!validation.ok) {
      sendError(res, 400, 'BAD_REQUEST', validation.message);
      return;
    }
    const userId = String(req.user?.id || req.body.userId || '').trim();
    if (!userId) {
      sendError(res, 401, 'UNAUTHORIZED', 'unauthorized');
      return;
    }
    const result = agentMemoryStore.query({
      userId,
      namespace: String(req.body.namespace || '').trim(),
      key: String(req.body.key || '').trim(),
    });

    res.json({
      ok: true,
      key: result.key,
      value: result.value,
      version: result.version,
      updatedAt: result.updatedAt,
    });
  });

  router.get('/health', (_req, res) => {
    res.json({
      module: MODULE_NAME,
      ok: true,
      strictMode: true,
      metrics: buildMetricsSnapshot(),
    });
  });

  return {
    module: MODULE_NAME,
    basePath: BASE_PATH,
    router,
    async init() {
      agentRunWorker?.start?.();
    },
    async healthCheck() {
      return {
        module: MODULE_NAME,
        ok: true,
        strictMode: true,
        metrics: buildMetricsSnapshot(),
      };
    },
    capabilities() {
      return {
        module: MODULE_NAME,
        enabled: true,
        strictMode: true,
        provider: 'mcp-gateway',
        mcpServers:
          typeof agentExecutionService.listMcpServerIds === 'function'
            ? agentExecutionService.listMcpServerIds()
            : ['app-core'],
        externalMcpEnabled:
          typeof agentExecutionService.hasEnabledExternalMcpServers === 'function'
            ? agentExecutionService.hasEnabledExternalMcpServers()
            : false,
        supportsSkillPacks: true,
        supportsExecutionStrategy: true,
        requiredEnv,
        auth: {
          required: true,
          scopes: [
            'app:read',
            'app:navigate',
            'grading:write',
            'convert:write',
            'community:*',
            'settings:write',
          ],
        },
        endpoints: [
          'POST /v1/modules/agent/plan',
          'POST /v1/modules/agent/execute',
          'POST /v1/modules/agent/runs/register',
          'GET /v1/modules/agent/runs/:runId',
          'GET /v1/modules/agent/runs/:runId/history',
          'POST /v1/modules/agent/runs/:runId/retry',
          'POST /v1/modules/agent/runs/:runId/cancel',
          'POST /v1/modules/agent/runs/:runId/resume',
          'POST /v1/modules/agent/runs/:runId/callback',
          'POST /v1/modules/agent/memory/upsert',
          'POST /v1/modules/agent/memory/query',
          'GET /v1/modules/agent/health',
        ],
      };
    },
    close() {
      agentRunWorker?.stop?.();
      agentRunWorker = null;
    },
  };
};

module.exports = {
  createAgentModule,
};





















