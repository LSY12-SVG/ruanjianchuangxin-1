const {createAgentModule} = require('../../backend/src/modules/agentModule');

describe('agent module capabilities', () => {
  test('exposes mcp-gateway provider and server identifiers', () => {
    const moduleInstance = createAgentModule();
    const capability = moduleInstance.capabilities();
    expect(capability.provider).toBe('mcp-gateway');
    expect(Array.isArray(capability.mcpServers)).toBe(true);
    expect(capability.mcpServers).toContain('app-core');
    expect(capability.externalMcpEnabled).toBe(false);
    expect(capability.supportsSkillPacks).toBe(true);
    expect(capability.supportsExecutionStrategy).toBe(true);
    expect(capability.endpoints).toEqual(
      expect.arrayContaining([
        'POST /v1/modules/agent/runs/register',
        'GET /v1/modules/agent/runs/:runId',
        'GET /v1/modules/agent/runs/:runId/history',
        'POST /v1/modules/agent/runs/:runId/retry',
        'POST /v1/modules/agent/runs/:runId/cancel',
        'POST /v1/modules/agent/runs/:runId/resume',
        'POST /v1/modules/agent/runs/:runId/callback',
      ]),
    );
  });
});

