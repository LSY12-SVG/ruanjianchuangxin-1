import type {AgentAction} from '../types';

export const PERMISSION_GATE_SKILL_NAME = 'agent-permission-gate';

export interface PermissionContext {
  grantedScopes: string[];
  debugOverride?: boolean;
}

export interface PermissionDecision {
  allowed: boolean;
  errorCode?: 'forbidden_scope';
  missingScopes: string[];
}

export const evaluateActionPermission = (
  action: AgentAction,
  context: PermissionContext,
): PermissionDecision => {
  if (context.debugOverride) {
    return {
      allowed: true,
      missingScopes: [],
    };
  }
  const required = Array.isArray(action.requiredScopes) ? action.requiredScopes : [];
  if (!required.length) {
    return {
      allowed: true,
      missingScopes: [],
    };
  }
  const grantedSet = new Set(context.grantedScopes);
  const missingScopes = required.filter(scope => {
    if (grantedSet.has('*') || grantedSet.has(scope)) {
      return false;
    }
    const namespace = scope.split(':')[0];
    return !(namespace && grantedSet.has(`${namespace}:*`));
  });
  if (!missingScopes.length) {
    return {
      allowed: true,
      missingScopes: [],
    };
  }
  return {
    allowed: false,
    errorCode: 'forbidden_scope',
    missingScopes,
  };
};
