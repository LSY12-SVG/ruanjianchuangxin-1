const {
  validateAgentPlanRequest,
  normalizeAgentPlanResponse,
  validateExecuteRequest,
  validateMemoryUpsertRequest,
  validateMemoryQueryRequest,
} = require('../../backend/src/agentContracts');

describe('agent contracts', () => {
  test('accepts plan request with app tab enums', () => {
    const result = validateAgentPlanRequest({
      intent: {goal: '发布社区草稿'},
      currentTab: 'home',
      capabilities: [{domain: 'navigation', operation: 'navigate_tab'}],
      pageSnapshot: {foo: 'bar'},
    });
    expect(result.ok).toBe(true);
  });

  test('rejects legacy currentTab values', () => {
    const result = validateAgentPlanRequest({
      intent: {goal: '发布社区草稿'},
      currentTab: 'grading',
      capabilities: [{domain: 'navigation', operation: 'navigate_tab'}],
    });
    expect(result.ok).toBe(false);
  });

  test('normalizes plan response to camel fields with planId/plannerSource', () => {
    const normalized = normalizeAgentPlanResponse({
      plan_id: 'plan_1',
      planner_source: 'local',
      reasoning_summary: 'ok',
      estimated_steps: 1,
      undo_plan: ['undo'],
      actions: [
        {
          domain: 'navigation',
          operation: 'navigate_tab',
          args: {tab: 'community'},
          risk_level: 'low',
          requires_confirmation: false,
          required_scopes: ['app:navigate'],
          skill_name: 'agent-tool-router',
        },
      ],
    });
    expect(normalized).not.toBeNull();
    expect(normalized.planId).toBe('plan_1');
    expect(normalized.plannerSource).toBe('local');
    expect(normalized.actions[0].actionId).toBeTruthy();
    expect(normalized.actions[0].requiredScopes).toEqual(['app:navigate']);
    expect(normalized.actions[0].skillName).toBe('agent-tool-router');
  });

  test('normalizes execute request payload', () => {
    const result = validateExecuteRequest({
      planId: 'p1',
      actionIds: ['a1'],
      idempotencyKey: 'dup-1',
      actions: [
        {
          actionId: 'a1',
          domain: 'app',
          operation: 'summarize_current_page',
          riskLevel: 'low',
          requiresConfirmation: false,
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.payload.planId).toBe('p1');
    expect(result.payload.actionIds).toEqual(['a1']);
    expect(result.payload.allowConfirmActions).toBe(false);
  });

  test('requires namespace for memory requests', () => {
    expect(validateMemoryUpsertRequest({key: 'k'}).ok).toBe(false);
    expect(validateMemoryQueryRequest({key: 'k'}).ok).toBe(false);
    expect(validateMemoryUpsertRequest({namespace: 'runtime', key: 'k'}).ok).toBe(true);
    expect(validateMemoryQueryRequest({namespace: 'runtime', key: 'k'}).ok).toBe(true);
  });
});
