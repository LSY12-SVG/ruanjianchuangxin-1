const VALID_DOMAINS = new Set([
  'navigation',
  'grading',
  'convert',
  'community',
  'settings',
  'app',
]);
const VALID_RISK = new Set(['low', 'medium', 'high']);

const isObject = value => typeof value === 'object' && value !== null;

const validateAgentPlanRequest = body => {
  if (!isObject(body)) {
    return {ok: false, message: 'request body must be an object'};
  }

  if (!isObject(body.intent) || typeof body.intent.goal !== 'string' || !body.intent.goal.trim()) {
    return {ok: false, message: 'intent.goal is required'};
  }

  if (
    typeof body.currentTab !== 'string' ||
    !['grading', 'convert', 'agent', 'community', 'profile'].includes(body.currentTab)
  ) {
    return {ok: false, message: 'currentTab is invalid'};
  }

  if (
    body.capabilities !== undefined &&
    (!Array.isArray(body.capabilities) ||
      !body.capabilities.every(
        item => isObject(item) && typeof item.domain === 'string' && typeof item.operation === 'string',
      ))
  ) {
    return {ok: false, message: 'capabilities shape is invalid'};
  }

  return {ok: true};
};

const normalizeAgentAction = value => {
  if (!isObject(value)) {
    return null;
  }

  if (typeof value.domain !== 'string' || !VALID_DOMAINS.has(value.domain)) {
    return null;
  }
  if (typeof value.operation !== 'string' || !value.operation.trim()) {
    return null;
  }

  const riskLevel = VALID_RISK.has(value.riskLevel) ? value.riskLevel : 'low';
  return {
    id: typeof value.id === 'string' ? value.id : undefined,
    domain: value.domain,
    operation: value.operation,
    args: isObject(value.args) ? value.args : undefined,
    riskLevel,
    requiresConfirmation: Boolean(value.requiresConfirmation),
  };
};

const normalizeAgentPlanResponse = payload => {
  if (!isObject(payload)) {
    return null;
  }

  const actionsRaw = Array.isArray(payload.actions) ? payload.actions : [];
  const actions = actionsRaw.map(normalizeAgentAction).filter(item => Boolean(item));
  if (actions.length === 0) {
    return null;
  }

  return {
    actions,
    reasoning_summary:
      typeof payload.reasoning_summary === 'string'
        ? payload.reasoning_summary
        : typeof payload.reasoningSummary === 'string'
          ? payload.reasoningSummary
          : 'Agent plan generated',
    estimated_steps:
      typeof payload.estimated_steps === 'number'
        ? payload.estimated_steps
        : typeof payload.estimatedSteps === 'number'
          ? payload.estimatedSteps
          : actions.length,
    undo_plan: Array.isArray(payload.undo_plan)
      ? payload.undo_plan.filter(item => typeof item === 'string')
      : Array.isArray(payload.undoPlan)
        ? payload.undoPlan.filter(item => typeof item === 'string')
        : [],
  };
};

const validateExecuteRequest = body => {
  if (!isObject(body) || !Array.isArray(body.actions)) {
    return {ok: false, message: 'actions is required'};
  }
  const normalizedActions = body.actions.map(normalizeAgentAction).filter(item => Boolean(item));
  if (normalizedActions.length === 0) {
    return {ok: false, message: 'actions are invalid'};
  }
  return {ok: true, actions: normalizedActions};
};

const validateMemoryUpsertRequest = body => {
  if (!isObject(body) || typeof body.key !== 'string' || !body.key.trim()) {
    return {ok: false, message: 'key is required'};
  }
  return {ok: true};
};

module.exports = {
  validateAgentPlanRequest,
  normalizeAgentPlanResponse,
  validateExecuteRequest,
  validateMemoryUpsertRequest,
};
