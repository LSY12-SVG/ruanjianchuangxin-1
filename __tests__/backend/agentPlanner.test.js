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
});
