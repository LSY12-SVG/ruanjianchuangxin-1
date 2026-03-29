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

  test('accepts plan request with executionStrategy', () => {
    const result = validateAgentPlanRequest({
      intent: {goal: '发布社区草稿'},
      currentTab: 'home',
      executionStrategy: 'quality',
      capabilities: [{domain: 'navigation', operation: 'navigate_tab'}],
    });
    expect(result.ok).toBe(true);
  });

  test('rejects invalid executionStrategy', () => {
    const result = validateAgentPlanRequest({
      intent: {goal: '发布社区草稿'},
      currentTab: 'home',
      executionStrategy: 'turbo',
      capabilities: [{domain: 'navigation', operation: 'navigate_tab'}],
    });
    expect(result.ok).toBe(false);
  });

  test('rejects empty capabilities list', () => {
    const result = validateAgentPlanRequest({
      intent: {goal: '帮我总结当前页面'},
      currentTab: 'agent',
      capabilities: [],
    });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('capabilities must not be empty');
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
          tool_ref: {server_id: 'app-core', tool_name: 'navigation.navigate_tab'},
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
    expect(normalized.actions[0].toolRef).toEqual({
      serverId: 'app-core',
      toolName: 'navigation.navigate_tab',
    });
    expect(normalized.actions[0].toolMeta).toEqual(
      expect.objectContaining({
        displayName: '前往页面',
        riskLevel: 'low',
        clientOwned: true,
        resumable: true,
        confirmationPolicy: 'never',
        resultCardKind: 'client_action',
      }),
    );
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

  test('accepts expanded tool meta device permissions', () => {
    const result = validateExecuteRequest({
      planId: 'p2',
      actions: [
        {
          actionId: 'a1',
          domain: 'settings',
          operation: 'open',
          riskLevel: 'low',
          requiresConfirmation: false,
          toolMeta: {
            requiredDevicePermissions: ['system_settings', 'auth_session'],
          },
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.payload.actions[0].toolMeta).toEqual(
      expect.objectContaining({
        riskLevel: 'low',
        requiredDevicePermissions: ['system_settings', 'auth_session'],
      }),
    );
  });

  test('accepts resultCardKind from tool meta', () => {
    const result = validateExecuteRequest({
      planId: 'p3',
      actions: [
        {
          actionId: 'a1',
          domain: 'file',
          operation: 'write',
          riskLevel: 'low',
          requiresConfirmation: false,
          toolMeta: {
            resultCardKind: 'file_saved',
          },
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.payload.actions[0].toolMeta).toEqual(
      expect.objectContaining({
        resultCardKind: 'file_saved',
      }),
    );
  });

  test('requires namespace for memory requests', () => {
    expect(validateMemoryUpsertRequest({key: 'k'}).ok).toBe(false);
    expect(validateMemoryQueryRequest({key: 'k'}).ok).toBe(false);
    expect(validateMemoryUpsertRequest({namespace: 'runtime', key: 'k'}).ok).toBe(true);
    expect(validateMemoryQueryRequest({namespace: 'runtime', key: 'k'}).ok).toBe(true);
  });

  test('normalizes fallback metadata and decision path', () => {
    const normalized = normalizeAgentPlanResponse({
      planId: 'plan_fb',
      reasoningSummary: '已给出可执行答复',
      decisionPath: 'fallback_direct',
      fallback: {
        used: true,
        reason: 'adapter_generated_direct_response',
      },
      actions: [
        {
          domain: 'app',
          operation: 'summarize_current_page',
          riskLevel: 'low',
          requiresConfirmation: false,
        },
      ],
    });

    expect(normalized).not.toBeNull();
    expect(normalized.fallback).toEqual({
      used: true,
      reason: 'adapter_generated_direct_response',
    });
    expect(normalized.decisionPath).toBe('fallback_direct');
  });
  test('normalizes clarification and decision trace fields', () => {
    const normalized = normalizeAgentPlanResponse({
      plan_id: 'plan_v2',
      reasoning_summary: 'ok',
      clarification_required: true,
      clarification_question: '先调色还是先建模？',
      decision_trace: [
        {step: 'intent_compile', reason: '命中调色与建模', confidence: 0.88},
        {step: '', reason: 'invalid'},
      ],
      selected_skill_pack: 'creative_pipeline',
      candidate_skill_packs: [{id: 'creative_pipeline', score: 6.5}],
      memory_applied: {preferences: true, outcomes: false},
      execution_strategy: 'quality',
      actions: [
        {
          domain: 'navigation',
          operation: 'navigate_tab',
          riskLevel: 'low',
          requiresConfirmation: false,
        },
      ],
    });

    expect(normalized).not.toBeNull();
    expect(normalized.clarificationRequired).toBe(true);
    expect(normalized.clarificationQuestion).toBe('先调色还是先建模？');
    expect(normalized.decisionTrace).toHaveLength(1);
    expect(normalized.selectedSkillPack).toBe('creative_pipeline');
    expect(normalized.executionStrategy).toBe('quality');
    expect(normalized.candidateSkillPacks).toEqual([{id: 'creative_pipeline', score: 6.5}]);
    expect(normalized.memoryApplied).toEqual({preferences: true, outcomes: false});
    expect(normalized.decisionTrace[0]).toEqual(
      expect.objectContaining({
        step: 'intent_compile',
        reason: '命中调色与建模',
        confidence: 0.88,
      }),
    );
  });
});

