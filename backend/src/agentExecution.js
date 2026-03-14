const AGENT_IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

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

const asActionStatus = action => {
  if (action.requiresConfirmation || action.riskLevel !== 'low') {
    return {
      status: 'pending_confirm',
      message: 'confirmation_required',
      errorCode: 'confirmation_required',
      retryable: true,
    };
  }
  return {
    status: 'applied',
    message: 'applied',
    retryable: false,
  };
};

const createAgentExecutionService = () => {
  const idempotencyMap = new Map();

  const cleanupIdempotency = () => {
    const now = Date.now();
    for (const [key, value] of idempotencyMap.entries()) {
      if (now - value.createdAt > AGENT_IDEMPOTENCY_TTL_MS) {
        idempotencyMap.delete(key);
      }
    }
  };

  const execute = ({
    userId = '',
    namespace = 'app.agent',
    planId,
    actions,
    actionIds = [],
    idempotencyKey = '',
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
    const actionResults = filtered.map(action => {
      const permission = evaluatePermission(action, {
        grantedScopes,
        debugOverride,
      });
      if (!permission.allowed) {
        return {
          action,
          attempts: 1,
          durationMs: 0,
          status: 'failed',
          message: `forbidden_scope:${permission.missingScopes.join(',')}`,
          errorCode: 'forbidden_scope',
          retryable: false,
          skillName: action.skillName || 'agent-permission-gate',
        };
      }
      return {
        action,
        attempts: 1,
        durationMs: 0,
        ...asActionStatus(action),
        skillName: action.skillName || 'agent-tool-router',
      };
    });
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

    const payload = {
      executionId: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      planId,
      namespace,
      actionResults,
      appliedActions,
      failedActions,
      pendingActions,
      rollbackAvailable: appliedActions.length > 0,
      status: pendingActions.length > 0 ? 'pending_confirm' : failedActions.length > 0 ? 'failed' : 'applied',
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
};
