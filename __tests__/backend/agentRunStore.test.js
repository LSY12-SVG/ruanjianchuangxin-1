const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {createAgentRunStore} = require('../../backend/src/agentRunStore');

describe('agent run store', () => {
  let filePath;

  beforeEach(() => {
    filePath = path.join(os.tmpdir(), `visiongenie-agent-runs-${Date.now()}-${Math.random()}.json`);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore temp cleanup errors
    }
  });

  test('persists and reloads workflow run records', () => {
    const store = createAgentRunStore({filePath});
    store.upsert({
      runId: 'run-1',
      userId: 'u1',
      namespace: 'app.agent',
      planId: 'plan-1',
      actions: [{actionId: 'a1'}],
      latestExecuteResult: {
        executionId: 'exec-1',
        planId: 'plan-1',
        status: 'waiting_async_result',
      },
    });

    const reloaded = createAgentRunStore({filePath});
    expect(reloaded.get('run-1')).toMatchObject({
      runId: 'run-1',
      userId: 'u1',
      namespace: 'app.agent',
      planId: 'plan-1',
      latestExecuteResult: {
        executionId: 'exec-1',
        status: 'waiting_async_result',
      },
    });
  });

  test('removes expired records during cleanup', () => {
    const store = createAgentRunStore({filePath, ttlMs: 1});
    store.upsert({
      runId: 'run-expired',
      userId: 'u1',
      namespace: 'app.agent',
      planId: 'plan-1',
      actions: [],
      latestExecuteResult: {
        executionId: 'exec-1',
        planId: 'plan-1',
        status: 'applied',
      },
    });

    const originalNow = Date.now;
    Date.now = () => originalNow() + 10;
    try {
      store.cleanupExpired();
    } finally {
      Date.now = originalNow;
    }

    expect(store.get('run-expired')).toBeNull();
  });

  test('appends persistent history entries', () => {
    const store = createAgentRunStore({filePath});
    store.upsert(
      {
        runId: 'run-history',
        userId: 'u1',
        namespace: 'app.agent',
        planId: 'plan-1',
        actions: [],
        latestExecuteResult: {
          executionId: 'exec-1',
          planId: 'plan-1',
          status: 'client_required',
        },
      },
      {
        event: {
          type: 'registered',
          status: 'waiting_context',
          message: '已注册待补图工作流',
        },
      },
    );
    store.upsert(
      {
        runId: 'run-history',
        userId: 'u1',
        namespace: 'app.agent',
        planId: 'plan-1',
        actions: [],
        latestExecuteResult: {
          executionId: 'exec-2',
          planId: 'plan-1',
          status: 'applied',
        },
      },
      {
        event: {
          type: 'resumed',
          status: 'applied',
          message: '补图后继续执行',
        },
      },
    );

    expect(store.getHistory('run-history')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({type: 'registered'}),
        expect.objectContaining({type: 'resumed'}),
      ]),
    );
  });

  test('lists runs by workflow status', () => {
    const store = createAgentRunStore({filePath});
    store.upsert({
      runId: 'run-waiting',
      userId: 'u1',
      namespace: 'app.agent',
      planId: 'plan-1',
      actions: [],
      latestExecuteResult: {
        executionId: 'exec-1',
        planId: 'plan-1',
        status: 'waiting_async_result',
        workflowRun: {
          status: 'waiting_async_result',
        },
      },
    });
    store.upsert({
      runId: 'run-done',
      userId: 'u1',
      namespace: 'app.agent',
      planId: 'plan-2',
      actions: [],
      latestExecuteResult: {
        executionId: 'exec-2',
        planId: 'plan-2',
        status: 'applied',
        workflowRun: {
          status: 'succeeded',
        },
      },
    });

    const waitingRuns = store.listByStatuses(['waiting_async_result']);
    expect(waitingRuns).toHaveLength(1);
    expect(waitingRuns[0].runId).toBe('run-waiting');
  });
});
