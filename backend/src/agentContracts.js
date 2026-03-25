const VALID_DOMAINS = new Set([
  'navigation',
  'grading',
  'convert',
  'community',
  'settings',
  'app',
]);
const VALID_RISK = new Set(['low', 'medium', 'high']);
const VALID_TABS = new Set(['home', 'agent', 'community', 'profile']);
const VALID_STAGES = new Set(['grading', 'convert', 'community', 'app']);

const isObject = value => typeof value === 'object' && value !== null;

const asRisk = value => (VALID_RISK.has(value) ? value : 'low');

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
  return {
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
    !Array.isArray(body.capabilities) ||
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
