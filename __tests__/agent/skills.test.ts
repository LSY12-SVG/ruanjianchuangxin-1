import {evaluateActionPermission} from '../../src/agent/skills/permissionGateSkill';
import {routeActionsByCapability} from '../../src/agent/skills/toolRouterSkill';
import {chooseRetryAttempts, normalizeIntentGoal} from '../../src/agent/skills/taskPlannerSkill';
import type {AgentAction} from '../../src/agent/types';

const mockAction = (overrides: Partial<AgentAction> = {}): AgentAction => ({
  actionId: 'a1',
  domain: 'community',
  operation: 'create_draft',
  riskLevel: 'low',
  requiresConfirmation: false,
  ...overrides,
});

describe('agent skills', () => {
  test('permission gate rejects missing scopes', () => {
    const decision = evaluateActionPermission(
      mockAction({requiredScopes: ['community:write']}),
      {grantedScopes: ['app:read']},
    );
    expect(decision.allowed).toBe(false);
    expect(decision.errorCode).toBe('forbidden_scope');
    expect(decision.missingScopes).toEqual(['community:write']);
  });

  test('permission gate accepts wildcard scopes', () => {
    const decision = evaluateActionPermission(
      mockAction({requiredScopes: ['community:publish']}),
      {grantedScopes: ['community:*']},
    );
    expect(decision.allowed).toBe(true);
  });

  test('tool router keeps only registered operations', () => {
    const result = routeActionsByCapability({
      actions: [
        mockAction({domain: 'community', operation: 'create_draft'}),
        mockAction({domain: 'settings', operation: 'apply_patch', actionId: 'a2'}),
      ],
      hasOperation: action => action.operation === 'create_draft',
    });
    expect(result.routable).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
  });

  test('task planner normalizes goal and retry policy', () => {
    expect(normalizeIntentGoal('  发布   社区   帖子  ')).toBe('发布 社区 帖子');
    expect(chooseRetryAttempts(mockAction({idempotent: true}))).toBe(2);
    expect(chooseRetryAttempts(mockAction({idempotent: false}))).toBe(1);
  });
});
