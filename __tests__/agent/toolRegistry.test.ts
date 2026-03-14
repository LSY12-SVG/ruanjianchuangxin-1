import {AgentToolRegistry} from '../../src/agent/toolRegistry';

describe('agent tool registry', () => {
  test('unregistered action returns not registered error', async () => {
    const registry = new AgentToolRegistry();
    const result = await registry.execute({
      actionId: 'a1',
      domain: 'app',
      operation: 'summarize_current_page',
      riskLevel: 'low',
      requiresConfirmation: false,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('未注册工具能力');
  });

  test('registered operation applies defaults and snapshots', async () => {
    const registry = new AgentToolRegistry();
    registry.register({
      domain: 'app',
      operation: 'summarize_current_page',
      description: 'summary',
      defaultRisk: 'low',
      defaultIdempotent: true,
      defaultRequiredScopes: ['app:read'],
      defaultSkillName: 'agent-task-planner',
      snapshot: () => ({tab: 'home'}),
      execute: async () => ({ok: true, message: 'ok'}),
    });

    const executable = registry.toExecutableAction({
      actionId: '',
      domain: 'app',
      operation: 'summarize_current_page',
      riskLevel: 'low',
      requiresConfirmation: false,
    });
    expect(executable.idempotent).toBe(true);
    expect(executable.requiredScopes).toEqual(['app:read']);
    expect(executable.skillName).toBe('agent-task-planner');
    expect(executable.actionId.length).toBeGreaterThan(0);

    const snapshots = registry.collectSnapshots();
    expect(snapshots['app::summarize_current_page']).toEqual({tab: 'home'});
  });
});
