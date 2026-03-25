const {planAgentActions} = require('../../backend/src/agentPlanner');

describe('agent planner', () => {
  test('uses home/modeling route protocol for convert flow', () => {
    const plan = planAgentActions({
      intent: {goal: '帮我做3d建模'},
      currentTab: 'home',
      capabilities: [
        {domain: 'navigation', operation: 'navigate_tab'},
        {domain: 'convert', operation: 'start_task'},
      ],
    });
    expect(plan.actions.length).toBe(2);
    expect(plan.actions[0].args).toEqual({tab: 'home', route: 'modeling'});
    expect(plan.actions[1].domain).toBe('convert');
  });

  test('filters actions by capabilities', () => {
    const plan = planAgentActions({
      intent: {goal: '发布社区帖子'},
      currentTab: 'community',
      capabilities: [{domain: 'navigation', operation: 'navigate_tab'}],
    });
    expect(plan.actions.length).toBe(1);
    expect(plan.actions[0].domain).toBe('navigation');
  });

  test('emits planId and plannerSource', () => {
    const plan = planAgentActions({
      intent: {goal: '总结当前页面'},
      currentTab: 'agent',
      capabilities: [
        {domain: 'navigation', operation: 'navigate_tab'},
        {domain: 'app', operation: 'summarize_current_page'},
      ],
    });
    expect(typeof plan.planId).toBe('string');
    expect(plan.plannerSource).toBe('cloud');
    expect(plan.actions[0].actionId).toBeTruthy();
  });

  test('builds staged workflow with preconditions and publish confirm gate', () => {
    const plan = planAgentActions({
      intent: {goal: '把这张图调成电影感，然后建模，最后发布社区'},
      currentTab: 'agent',
      capabilities: [
        {domain: 'navigation', operation: 'navigate_tab'},
        {domain: 'grading', operation: 'apply_visual_suggest'},
        {domain: 'convert', operation: 'start_task'},
        {domain: 'community', operation: 'create_draft'},
        {domain: 'community', operation: 'publish_draft'},
      ],
    });

    expect(plan.actions.map(item => item.stage)).toEqual(
      expect.arrayContaining(['grading', 'convert', 'community']),
    );

    const grading = plan.actions.find(
      item => item.domain === 'grading' && item.operation === 'apply_visual_suggest',
    );
    const convert = plan.actions.find(
      item => item.domain === 'convert' && item.operation === 'start_task',
    );
    const publish = plan.actions.find(
      item => item.domain === 'community' && item.operation === 'publish_draft',
    );

    expect(grading.preconditions).toEqual(expect.arrayContaining(['context.color.image']));
    expect(convert.preconditions).toEqual(expect.arrayContaining(['context.modeling.image']));
    expect(Array.isArray(convert.dependsOn)).toBe(true);
    expect(convert.dependsOn.length).toBeGreaterThan(0);
    expect(publish.riskLevel).toBe('high');
    expect(publish.requiresConfirmation).toBe(true);
    expect(publish.preconditions).toEqual(expect.arrayContaining(['context.community.draftId']));
  });

  test('adds inputSource to reasoning summary for observability', () => {
    const plan = planAgentActions({
      intent: {goal: '总结当前页面'},
      currentTab: 'agent',
      inputSource: 'voice',
      capabilities: [
        {domain: 'navigation', operation: 'navigate_tab'},
        {domain: 'app', operation: 'summarize_current_page'},
      ],
    });

    expect(plan.reasoningSummary).toContain('(voice)');
  });
});
