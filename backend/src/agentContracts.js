const {resolveActionToolMeta} = require('./agentToolRefs');

const VALID_DOMAINS = new Set([
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
const VALID_RISK = new Set(['low', 'medium', 'high']);
const VALID_TABS = new Set(['home', 'agent', 'community', 'profile']);
const VALID_STAGES = new Set(['grading', 'convert', 'community', 'app']);
const VALID_SUMMARY_SOURCES = new Set(['model', 'rule']);
const VALID_EXECUTION_STRATEGIES = new Set(['fast', 'quality', 'cost']);
const VALID_STRATEGY_SOURCES = new Set(['user', 'memory', 'adaptive']);
const VALID_DECISION_PATHS = new Set(['planned', 'fallback_direct']);
const VALID_DEVICE_PERMISSIONS = new Set([
  'photo_library',
  'photo_library_write',
  'camera',
  'microphone',
  'notifications',
  'auth_session',
  'file_read',
  'file_write',
  'system_settings',
]);
const VALID_CONFIRMATION_POLICIES = new Set(['never', 'always']);
const VALID_RESULT_CARD_KINDS = new Set([
  'client_action',
  'summary',
  'grading_result',
  'model_ready',
  'draft_ready',
  'community_published',
  'settings_updated',
  'permission_required',
  'auth_required',
  'context_required',
  'file_saved',
  'confirm_required',
  'failure',
  'task_running',
]);

const isObject = value => typeof value === 'object' && value !== null;

const asRisk = value => (VALID_RISK.has(value) ? value : 'low');

const normalizeToolRef = value => {
  if (!isObject(value)) {
    return undefined;
  }
  const serverId =
    typeof value.serverId === 'string'
      ? value.serverId.trim()
      : typeof value.server_id === 'string'
        ? value.server_id.trim()
        : '';
  const toolName =
    typeof value.toolName === 'string'
      ? value.toolName.trim()
      : typeof value.tool_name === 'string'
        ? value.tool_name.trim()
        : '';
  if (!serverId || !toolName) {
    return undefined;
  }
  return {
    serverId,
    toolName,
  };
};

const normalizeToolMeta = value => {
  if (!isObject(value)) {
    return undefined;
  }
  const requiredContext = Array.isArray(value.requiredContext)
    ? value.requiredContext.filter(item => typeof item === 'string' && item.trim())
    : [];
  const requiredDevicePermissions = Array.isArray(value.requiredDevicePermissions)
    ? value.requiredDevicePermissions.filter(
        item => typeof item === 'string' && VALID_DEVICE_PERMISSIONS.has(item.trim()),
      )
    : [];
  return {
    displayName:
      typeof value.displayName === 'string' && value.displayName.trim()
        ? value.displayName.trim()
        : undefined,
    requiredContext,
    requiredDevicePermissions,
    supportsAsync: value.supportsAsync === true,
    riskLevel: asRisk(value.riskLevel || value.risk_level),
    resumable: value.resumable === true,
    clientOwned: value.clientOwned === true,
    confirmationPolicy:
      typeof value.confirmationPolicy === 'string' &&
      VALID_CONFIRMATION_POLICIES.has(value.confirmationPolicy)
        ? value.confirmationPolicy
        : undefined,
    resultCardKind:
      typeof value.resultCardKind === 'string' && VALID_RESULT_CARD_KINDS.has(value.resultCardKind)
        ? value.resultCardKind
        : typeof value.result_card_kind === 'string' && VALID_RESULT_CARD_KINDS.has(value.result_card_kind)
          ? value.result_card_kind
          : undefined,
  };
};

const normalizeDecisionTraceItem = value => {
  if (!isObject(value)) {
    return null;
  }
  const step = typeof value.step === 'string' && value.step.trim() ? value.step.trim() : '';
  const reason = typeof value.reason === 'string' && value.reason.trim() ? value.reason.trim() : '';
  if (!step || !reason) {
    return null;
  }
  const confidenceRaw = Number(value.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : undefined;
  return {
    step,
    reason,
    confidence,
  };
};

const normalizeSubtaskGraphNode = value => {
  if (!isObject(value)) {
    return null;
  }
  const nodeId =
    typeof value.nodeId === 'string'
      ? value.nodeId.trim()
      : typeof value.node_id === 'string'
        ? value.node_id.trim()
        : '';
  const packId =
    typeof value.packId === 'string'
      ? value.packId.trim()
      : typeof value.pack_id === 'string'
        ? value.pack_id.trim()
        : '';
  const actionId =
    typeof value.actionId === 'string'
      ? value.actionId.trim()
      : typeof value.action_id === 'string'
        ? value.action_id.trim()
        : '';
  if (!nodeId || !packId || !actionId) {
    return null;
  }
  return {
    nodeId,
    packId,
    actionId,
    dependsOn: Array.isArray(value.dependsOn)
      ? value.dependsOn.filter(item => typeof item === 'string' && item.trim())
      : Array.isArray(value.depends_on)
        ? value.depends_on.filter(item => typeof item === 'string' && item.trim())
        : [],
    resumable: value.resumable !== false,
    fallbackRef:
      typeof value.fallbackRef === 'string' && value.fallbackRef.trim()
        ? value.fallbackRef.trim()
        : typeof value.fallback_ref === 'string' && value.fallback_ref.trim()
          ? value.fallback_ref.trim()
          : undefined,
  };
};

const normalizeAgentAction = (value, index = 0, planId = 'agent_plan') => {
  if (!isObject(value)) {
    return null;
  }

  if (typeof value.domain !== 'string' || !VALID_DOMAINS.has(value.domain)) {
    return null;
  }
  if (typeof value.operation !== 'string' || !value.operation.trim()) {
    return null;
  }

  const actionId =
    typeof value.actionId === 'string'
      ? value.actionId
      : typeof value.action_id === 'string'
        ? value.action_id
        : typeof value.id === 'string'
          ? value.id
          : `${planId}_${index + 1}`;
  const normalizedAction = {
    actionId,
    id: typeof value.id === 'string' ? value.id : actionId,
    domain: value.domain,
    operation: value.operation,
    args: isObject(value.args) ? value.args : undefined,
    riskLevel: asRisk(value.riskLevel || value.risk_level),
    requiresConfirmation: Boolean(value.requiresConfirmation || value.requires_confirmation),
    idempotent: Boolean(value.idempotent),
    requiredScopes: Array.isArray(value.requiredScopes)
      ? value.requiredScopes.filter(item => typeof item === 'string' && item.trim())
      : Array.isArray(value.required_scopes)
        ? value.required_scopes.filter(item => typeof item === 'string' && item.trim())
        : [],
    skillName:
      typeof value.skillName === 'string'
        ? value.skillName
        : typeof value.skill_name === 'string'
          ? value.skill_name
          : undefined,
    toolRef: normalizeToolRef(value.toolRef || value.tool_ref),
    toolMeta: normalizeToolMeta(value.toolMeta || value.tool_meta),
    stage:
      typeof value.stage === 'string' && VALID_STAGES.has(value.stage)
        ? value.stage
        : undefined,
    dependsOn: Array.isArray(value.dependsOn)
      ? value.dependsOn.filter(item => typeof item === 'string' && item.trim())
      : Array.isArray(value.depends_on)
        ? value.depends_on.filter(item => typeof item === 'string' && item.trim())
        : [],
    preconditions: Array.isArray(value.preconditions)
      ? value.preconditions.filter(item => typeof item === 'string' && item.trim())
      : [],
    timeoutMs: Number.isFinite(Number(value.timeoutMs || value.timeout_ms))
      ? Number(value.timeoutMs || value.timeout_ms)
      : undefined,
  };
  const defaultToolMeta = resolveActionToolMeta(normalizedAction);
  normalizedAction.toolMeta = normalizedAction.toolMeta
    ? {
        ...defaultToolMeta,
        ...normalizedAction.toolMeta,
        requiredContext:
          normalizedAction.toolMeta.requiredContext?.length > 0
            ? normalizedAction.toolMeta.requiredContext
            : defaultToolMeta.requiredContext,
        requiredDevicePermissions:
          normalizedAction.toolMeta.requiredDevicePermissions?.length > 0
            ? normalizedAction.toolMeta.requiredDevicePermissions
            : defaultToolMeta.requiredDevicePermissions,
      }
    : defaultToolMeta;
  return normalizedAction;
};

const validateAgentPlanRequest = body => {
  if (!isObject(body)) {
    return {ok: false, message: 'request body must be an object'};
  }

  if (!isObject(body.intent) || typeof body.intent.goal !== 'string' || !body.intent.goal.trim()) {
    return {ok: false, message: 'intent.goal is required'};
  }

  if (typeof body.currentTab !== 'string' || !VALID_TABS.has(body.currentTab)) {
    return {ok: false, message: 'currentTab is invalid'};
  }
  if (
    body.inputSource !== undefined &&
    body.inputSource !== 'text' &&
    body.inputSource !== 'voice'
  ) {
    return {ok: false, message: 'inputSource is invalid'};
  }
  if (
    body.executionStrategy !== undefined &&
    !(typeof body.executionStrategy === 'string' && VALID_EXECUTION_STRATEGIES.has(body.executionStrategy.trim().toLowerCase()))
  ) {
    return {ok: false, message: 'executionStrategy is invalid'};
  }

  if (!Array.isArray(body.capabilities) || body.capabilities.length === 0) {
    return {ok: false, message: 'capabilities must not be empty'};
  }

  if (
    !body.capabilities.every(
      item => isObject(item) && typeof item.domain === 'string' && typeof item.operation === 'string',
    )
  ) {
    return {ok: false, message: 'capabilities shape is invalid'};
  }

  if (body.pageSnapshot !== undefined && !isObject(body.pageSnapshot)) {
    return {ok: false, message: 'pageSnapshot must be an object'};
  }

  return {ok: true};
};

const normalizeAgentPlanResponse = payload => {
  if (!isObject(payload)) {
    return null;
  }

  const planId =
    typeof payload.planId === 'string'
      ? payload.planId
      : typeof payload.plan_id === 'string'
        ? payload.plan_id
        : `plan_${Date.now()}`;
  const actionsRaw = Array.isArray(payload.actions) ? payload.actions : [];
  const actions = actionsRaw
    .map((item, index) => normalizeAgentAction(item, index, planId))
    .filter(item => Boolean(item));
  if (actions.length === 0) {
    return null;
  }

  return {
    planId,
    actions,
    reasoningSummary:
      typeof payload.reasoningSummary === 'string'
        ? payload.reasoningSummary
        : typeof payload.reasoning_summary === 'string'
          ? payload.reasoning_summary
          : 'Agent plan generated',
    estimatedSteps:
      typeof payload.estimatedSteps === 'number'
        ? payload.estimatedSteps
        : typeof payload.estimated_steps === 'number'
          ? payload.estimated_steps
          : actions.length,
    undoPlan: Array.isArray(payload.undoPlan)
      ? payload.undoPlan.filter(item => typeof item === 'string')
      : Array.isArray(payload.undo_plan)
        ? payload.undo_plan.filter(item => typeof item === 'string')
        : [],
    plannerSource:
      payload.plannerSource === 'local' || payload.planner_source === 'local' ? 'local' : 'cloud',
    summarySource:
      VALID_SUMMARY_SOURCES.has(payload.summarySource) || VALID_SUMMARY_SOURCES.has(payload.summary_source)
        ? payload.summarySource || payload.summary_source
        : 'rule',
    clarificationRequired: payload.clarificationRequired === true || payload.clarification_required === true,
    clarificationQuestion:
      typeof payload.clarificationQuestion === 'string' && payload.clarificationQuestion.trim()
        ? payload.clarificationQuestion.trim()
        : typeof payload.clarification_question === 'string' && payload.clarification_question.trim()
          ? payload.clarification_question.trim()
          : undefined,
    decisionTrace: Array.isArray(payload.decisionTrace)
      ? payload.decisionTrace.map(normalizeDecisionTraceItem).filter(Boolean)
      : Array.isArray(payload.decision_trace)
        ? payload.decision_trace.map(normalizeDecisionTraceItem).filter(Boolean)
        : [],
    selectedSkillPack:
      typeof payload.selectedSkillPack === 'string' && payload.selectedSkillPack.trim()
        ? payload.selectedSkillPack.trim()
        : typeof payload.selected_skill_pack === 'string' && payload.selected_skill_pack.trim()
          ? payload.selected_skill_pack.trim()
          : undefined,
    selectedAuxSkillPacks: Array.isArray(payload.selectedAuxSkillPacks)
      ? payload.selectedAuxSkillPacks
          .filter(item => typeof item === 'string' && item.trim())
          .map(item => item.trim())
      : Array.isArray(payload.selected_aux_skill_packs)
        ? payload.selected_aux_skill_packs
            .filter(item => typeof item === 'string' && item.trim())
            .map(item => item.trim())
        : [],
    candidateSkillPacks: Array.isArray(payload.candidateSkillPacks)
      ? payload.candidateSkillPacks
          .map(item => ({
            id: typeof item?.id === 'string' ? item.id.trim() : '',
            score: Number(item?.score || 0),
          }))
          .filter(item => item.id)
      : Array.isArray(payload.candidate_skill_packs)
        ? payload.candidate_skill_packs
            .map(item => ({
              id: typeof item?.id === 'string' ? item.id.trim() : '',
              score: Number(item?.score || 0),
            }))
            .filter(item => item.id)
        : [],
    memoryApplied: isObject(payload.memoryApplied)
      ? {
          preferences: payload.memoryApplied.preferences === true,
          outcomes: payload.memoryApplied.outcomes === true,
        }
      : isObject(payload.memory_applied)
        ? {
            preferences: payload.memory_applied.preferences === true,
            outcomes: payload.memory_applied.outcomes === true,
          }
        : undefined,
    subtaskGraph: Array.isArray(payload.subtaskGraph)
      ? payload.subtaskGraph.map(normalizeSubtaskGraphNode).filter(Boolean)
      : Array.isArray(payload.subtask_graph)
        ? payload.subtask_graph.map(normalizeSubtaskGraphNode).filter(Boolean)
        : [],
    executionStrategy:
      typeof payload.executionStrategy === 'string' && VALID_EXECUTION_STRATEGIES.has(payload.executionStrategy.trim())
        ? payload.executionStrategy.trim()
        : typeof payload.execution_strategy === 'string' && VALID_EXECUTION_STRATEGIES.has(payload.execution_strategy.trim())
          ? payload.execution_strategy.trim()
          : undefined,
    strategySource:
      typeof payload.strategySource === 'string' && VALID_STRATEGY_SOURCES.has(payload.strategySource.trim())
        ? payload.strategySource.trim()
        : typeof payload.strategy_source === 'string' && VALID_STRATEGY_SOURCES.has(payload.strategy_source.trim())
          ? payload.strategy_source.trim()
          : undefined,
    fallback:
      isObject(payload.fallback) && payload.fallback.used === true
        ? {
            used: true,
            reason:
              typeof payload.fallback.reason === 'string' && payload.fallback.reason.trim()
                ? payload.fallback.reason.trim()
                : 'fallback_direct',
          }
        : payload.fallback_used === true
          ? {
              used: true,
              reason:
                typeof payload.fallback_reason === 'string' && payload.fallback_reason.trim()
                  ? payload.fallback_reason.trim()
                  : 'fallback_direct',
            }
          : undefined,
    decisionPath:
      typeof payload.decisionPath === 'string' && VALID_DECISION_PATHS.has(payload.decisionPath.trim())
        ? payload.decisionPath.trim()
        : typeof payload.decision_path === 'string' && VALID_DECISION_PATHS.has(payload.decision_path.trim())
          ? payload.decision_path.trim()
          : (isObject(payload.fallback) && payload.fallback.used === true) || payload.fallback_used === true
            ? 'fallback_direct'
            : 'planned',
  };
};

const validateExecuteRequest = body => {
  if (!isObject(body) || typeof body.planId !== 'string' || !body.planId.trim()) {
    return {ok: false, message: 'planId is required'};
  }
  if (!Array.isArray(body.actions)) {
    return {ok: false, message: 'actions is required'};
  }
  const normalizedActions = body.actions
    .map((item, index) => normalizeAgentAction(item, index, body.planId))
    .filter(item => Boolean(item));
  if (normalizedActions.length === 0) {
    return {ok: false, message: 'actions are invalid'};
  }

  const actionIds = Array.isArray(body.actionIds)
    ? body.actionIds.filter(item => typeof item === 'string' && item.trim())
    : [];
  const idempotencyKey =
    typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
      ? body.idempotencyKey.trim()
      : '';
  const allowConfirmActions = body.allowConfirmActions === true;

  return {
    ok: true,
    payload: {
      userId: typeof body.userId === 'string' && body.userId.trim() ? body.userId.trim() : '',
      namespace: typeof body.namespace === 'string' && body.namespace.trim() ? body.namespace.trim() : 'app.agent',
      planId: body.planId.trim(),
      actions: normalizedActions,
      actionIds,
      idempotencyKey,
      allowConfirmActions,
    },
  };
};

const validateMemoryUpsertRequest = body => {
  if (!isObject(body) || typeof body.key !== 'string' || !body.key.trim()) {
    return {ok: false, message: 'key is required'};
  }
  if (typeof body.namespace !== 'string' || !body.namespace.trim()) {
    return {ok: false, message: 'namespace is required'};
  }
  return {ok: true};
};

const validateMemoryQueryRequest = body => {
  if (!isObject(body) || typeof body.key !== 'string' || !body.key.trim()) {
    return {ok: false, message: 'key is required'};
  }
  if (typeof body.namespace !== 'string' || !body.namespace.trim()) {
    return {ok: false, message: 'namespace is required'};
  }
  return {ok: true};
};

module.exports = {
  validateAgentPlanRequest,
  normalizeAgentPlanResponse,
  validateExecuteRequest,
  validateMemoryUpsertRequest,
  validateMemoryQueryRequest,
  normalizeAgentAction,
};


