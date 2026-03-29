const {createAgentAsyncRecoveryRegistry} = require('../../backend/src/agentAsyncRecovery');

describe('agent async recovery registry', () => {
  const rebuildExecutePayload = input => ({
    ...input,
    workflowRun: {
      runId: input.runId,
      status: String(input.actionResults?.[0]?.status || 'waiting_async_result') === 'applied' ? 'succeeded' : 'waiting_async_result',
    },
    status: input.actionResults?.[0]?.status || 'waiting_async_result',
  });

  test('refreshes convert.start_task to succeeded', async () => {
    const getTask = jest.fn(async () => ({
      taskId: 'task-1',
      status: 'succeeded',
      previewUrl: 'https://x/preview',
      downloadUrl: 'https://x/download',
    }));
    const registry = createAgentAsyncRecoveryRegistry({
      getModelingService: () => ({
        getTask,
        toPublicTask: task => task,
      }),
      getModelingConfig: () => ({pollAfterMs: 3000}),
      rebuildExecutePayload,
    });

    const recovered = await registry.refreshRecord({
      runId: 'run-1',
      planId: 'plan-1',
      namespace: 'app.agent',
      actions: [
        {
          actionId: 'a1',
          domain: 'convert',
          operation: 'start_task',
        },
      ],
      latestExecuteResult: {
        executionId: 'exec-1',
        planId: 'plan-1',
        workflowRun: {
          status: 'waiting_async_result',
          pendingTask: {
            taskId: 'task-1',
            pollAfterMs: 3000,
          },
        },
        actionResults: [
          {
            action: {
              actionId: 'a1',
              domain: 'convert',
              operation: 'start_task',
            },
            status: 'waiting_async_result',
            output: {
              taskId: 'task-1',
            },
          },
        ],
      },
    });

    expect(getTask).toHaveBeenCalledWith('task-1');
    expect(recovered.changed).toBe(true);
    expect(recovered.result.actionResults[0].status).toBe('applied');
    expect(recovered.recoveryEvent).toEqual(
      expect.objectContaining({
        type: 'async_refreshed',
      }),
    );
  });

  test('keeps record unchanged when no handler found', async () => {
    const registry = createAgentAsyncRecoveryRegistry({
      getModelingService: () => null,
      getModelingConfig: () => ({pollAfterMs: 3000}),
      rebuildExecutePayload,
    });

    const recovered = await registry.refreshRecord({
      runId: 'run-2',
      latestExecuteResult: {
        workflowRun: {
          status: 'waiting_async_result',
        },
        actionResults: [
          {
            action: {
              actionId: 'x1',
              domain: 'community',
              operation: 'publish_draft',
            },
            status: 'waiting_async_result',
          },
        ],
      },
    });

    expect(recovered.changed).toBe(false);
    expect(recovered.recoveryEvent).toEqual(
      expect.objectContaining({
        type: 'async_recovery_skipped',
      }),
    );
  });
});
