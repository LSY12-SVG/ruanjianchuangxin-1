const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createAgentExecutionService} = require('../../backend/src/agentExecution');
const {createAgentMemoryStore} = require('../../backend/src/agentMemoryStore');

describe('agent execute and memory store', () => {
  test('execute returns pending for non-low risk and supports idempotency', async () => {
    const service = createAgentExecutionService();
    const payload = {
      planId: 'plan_1',
      idempotencyKey: 'dup-key',
      actions: [
        {
          actionId: 'a1',
          domain: 'convert',
          operation: 'start_task',
          riskLevel: 'medium',
          requiresConfirmation: true,
        },
      ],
    };
    const first = await service.execute(payload);
    const second = await service.execute(payload);

    expect(first.status).toBe('pending_confirm');
    expect(first.pendingActions.length).toBe(1);
    expect(second.executionId).toBe(first.executionId);
  });

  test('execute blocks action when required scope is missing', async () => {
    const service = createAgentExecutionService();
    const result = await service.execute({
      userId: 'u1',
      namespace: 'app.agent',
      planId: 'plan_scope_1',
      actions: [
        {
          actionId: 'a_scope_1',
          domain: 'community',
          operation: 'publish_draft',
          riskLevel: 'low',
          requiresConfirmation: false,
          requiredScopes: ['community:publish'],
        },
      ],
      grantedScopes: ['community:write'],
      debugOverride: false,
    });
    expect(result.status).toBe('failed');
    expect(result.failedActions.length).toBe(1);
    expect(result.failedActions[0].errorCode).toBe('forbidden_scope');
  });

  test('memory store upsert/query with version and expiry', async () => {
    const tmpPath = path.join(
      os.tmpdir(),
      `visiongenie-agent-memory-${Date.now()}-${Math.round(Math.random() * 1000)}.json`,
    );
    const store = createAgentMemoryStore({filePath: tmpPath});

    const first = store.upsert({
      userId: 'u1',
      namespace: 'runtime',
      key: 'last_history',
      value: {id: 1},
      ttlSeconds: 1,
    });
    expect(first.version).toBe(1);
    expect(store.query({userId: 'u1', namespace: 'runtime', key: 'last_history'}).value).toEqual({id: 1});

    const second = store.upsert({
      userId: 'u1',
      namespace: 'runtime',
      key: 'last_history',
      value: {id: 2},
      ttlSeconds: 1,
    });
    expect(second.version).toBe(2);

    await new Promise(resolve => setTimeout(resolve, 1100));
    store.cleanupExpired();
    const queried = store.query({userId: 'u1', namespace: 'runtime', key: 'last_history'});
    expect(queried.value).toBeNull();

    if (fs.existsSync(tmpPath)) {
      fs.rmSync(tmpPath, {force: true});
    }
  });
});
