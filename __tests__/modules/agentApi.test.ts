import {agentApi} from '../../src/modules/api/agent';

jest.mock('../../src/modules/api/http', () => ({
  requestApi: jest.fn(async () => ({})),
}));

const {requestApi} = jest.requireMock('../../src/modules/api/http') as {
  requestApi: jest.Mock;
};

describe('agentApi transport contract', () => {
  beforeEach(() => {
    requestApi.mockClear();
    requestApi.mockResolvedValue({});
  });

  it('passes currentTab/inputSource/executionStrategy and auth to createPlan', async () => {
    await agentApi.createPlan('帮我总结当前页面', 'model', 'voice', 'quality');
    expect(requestApi).toHaveBeenCalledWith(
      '/v1/modules/agent/plan',
      expect.objectContaining({
        method: 'POST',
        auth: true,
        body: expect.objectContaining({
          inputSource: 'voice',
          currentTab: 'home',
          pageSnapshot: expect.objectContaining({
            currentRoute: 'modeling',
          }),
          executionStrategy: 'quality',
        }),
      }),
    );
  });

  it('passes idempotency key to executePlan when provided', async () => {
    await agentApi.executePlan(
      'plan-1',
      [
        {
          actionId: 'a1',
          id: 'a1',
          domain: 'app',
          operation: 'summarize_current_page',
          riskLevel: 'low',
          requiresConfirmation: false,
          requiredScopes: [],
        },
      ],
      {
        actionIds: ['a1'],
        allowConfirmActions: false,
        idempotencyKey: 'idemp-1',
      },
    );

    expect(requestApi).toHaveBeenCalledWith(
      '/v1/modules/agent/execute',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          planId: 'plan-1',
          actionIds: ['a1'],
          idempotencyKey: 'idemp-1',
        }),
      }),
    );
  });

  it('requests persisted workflow run by runId', async () => {
    await agentApi.getWorkflowRun('run-123');
    expect(requestApi).toHaveBeenCalledWith('/v1/modules/agent/runs/run-123', {
      auth: true,
    });
  });

  it('resumes persisted workflow run with confirmation flag', async () => {
    await agentApi.resumeWorkflowRun('run-456', {
      allowConfirmActions: true,
      contextPatch: {
        modelingImageContext: {
          image: {
            mimeType: 'image/jpeg',
            fileName: 'agent.jpg',
            base64: 'ZmFrZQ==',
          },
        },
      },
    });
    expect(requestApi).toHaveBeenCalledWith(
      '/v1/modules/agent/runs/run-456/resume',
      expect.objectContaining({
        method: 'POST',
        auth: true,
        body: {
          allowConfirmActions: true,
          contextPatch: {
            modelingImageContext: {
              image: {
                mimeType: 'image/jpeg',
                fileName: 'agent.jpg',
                base64: 'ZmFrZQ==',
              },
            },
          },
        },
      }),
    );
  });

  it('registers waiting-context workflow run payload', async () => {
    await agentApi.registerWorkflowRun({
      planId: 'plan-ctx',
      actions: [],
      latestExecuteResult: {
        executionId: 'exec-ctx',
        planId: 'plan-ctx',
        status: 'client_required',
        actionResults: [],
      },
    });
    expect(requestApi).toHaveBeenCalledWith(
      '/v1/modules/agent/runs/register',
      expect.objectContaining({
        method: 'POST',
        auth: true,
        body: expect.objectContaining({
          planId: 'plan-ctx',
        }),
      }),
    );
  });

  it('cancels persisted workflow run', async () => {
    await agentApi.cancelWorkflowRun('run-789');
    expect(requestApi).toHaveBeenCalledWith(
      '/v1/modules/agent/runs/run-789/cancel',
      expect.objectContaining({
        method: 'POST',
        auth: true,
      }),
    );
  });

  it('fetches workflow history by runId', async () => {
    await agentApi.getWorkflowRunHistory('run-history');
    expect(requestApi).toHaveBeenCalledWith('/v1/modules/agent/runs/run-history/history', {
      auth: true,
    });
  });

  it('retries persisted workflow run with action filter', async () => {
    await agentApi.retryWorkflowRun('run-retry', {
      actionIds: ['a2'],
      allowConfirmActions: true,
    });
    expect(requestApi).toHaveBeenCalledWith(
      '/v1/modules/agent/runs/run-retry/retry',
      expect.objectContaining({
        method: 'POST',
        auth: true,
        body: {
          actionIds: ['a2'],
          allowConfirmActions: true,
        },
      }),
    );
  });
  it('calls callback endpoint for workflow run', async () => {
    await agentApi.callbackWorkflowRun('run-callback');
    expect(requestApi).toHaveBeenCalledWith(
      '/v1/modules/agent/runs/run-callback/callback',
      expect.objectContaining({
        method: 'POST',
        auth: true,
      }),
    );
  });
});
