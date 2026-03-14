import {buildLocalAgentPlan} from '../../src/agent/localPlanner';
import type {AgentPlanRequest} from '../../src/agent/types';

const request = (goal: string): AgentPlanRequest => ({
  intent: {goal},
  currentTab: 'home',
  capabilities: [
    {
      domain: 'navigation',
      operation: 'navigate_tab',
      description: 'navigate',
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotent: true,
    },
    {
      domain: 'community',
      operation: 'create_draft',
      description: 'draft',
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotent: false,
    },
  ],
  pageSnapshot: {
    'community.lastDraftTitle': '已有草稿标题',
  },
});

describe('local planner', () => {
  test('returns local planner source and stable action ids', () => {
    const plan = buildLocalAgentPlan(request('发布社区帖子'));
    expect(plan.plannerSource).toBe('local');
    expect(plan.planId).toContain('local_');
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.actions.every(item => typeof item.actionId === 'string' && item.actionId.length > 0)).toBe(
      true,
    );
  });

  test('filters by capabilities', () => {
    const plan = buildLocalAgentPlan(request('发布社区帖子'));
    expect(plan.actions.map(item => `${item.domain}.${item.operation}`)).toEqual([
      'navigation.navigate_tab',
      'community.create_draft',
    ]);
  });
});
