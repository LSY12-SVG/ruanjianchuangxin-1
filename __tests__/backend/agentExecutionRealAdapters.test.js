const {createAgentExecutionService} = require('../../backend/src/agentExecution');

describe('agent execution real adapters', () => {
  const buildService = ({
    communityRepo,
    settingsRepo,
    modelingService,
    modelingConfig,
    colorInterpreter,
  } = {}) =>
    createAgentExecutionService({
      resolveServices: () => ({
        communityRepo: communityRepo || null,
        settingsRepo: settingsRepo || null,
        modelingService: modelingService || null,
        modelingConfig: modelingConfig || {maxUploadBytes: 10 * 1024 * 1024, pollAfterMs: 5000},
      }),
      colorInterpreter,
    });

  test('create_draft -> publish_draft shares context draftId in same execution', async () => {
    const communityRepo = {
      createDraft: jest.fn(async () => ({id: 'd-1'})),
      publishDraft: jest.fn(async (_userId, draftId) => ({id: `p-${draftId}`})),
    };
    const service = buildService({communityRepo});
    const result = await service.execute({
      userId: 'u1',
      planId: 'plan-community-1',
      grantedScopes: ['community:*'],
      actions: [
        {
          actionId: 'a1',
          domain: 'community',
          operation: 'create_draft',
          args: {title: 'hello'},
          riskLevel: 'low',
          requiresConfirmation: false,
          requiredScopes: ['community:write'],
        },
        {
          actionId: 'a2',
          domain: 'community',
          operation: 'publish_draft',
          riskLevel: 'low',
          requiresConfirmation: false,
          requiredScopes: ['community:publish'],
        },
      ],
    });

    expect(result.status).toBe('applied');
    expect(result.failedActions).toHaveLength(0);
    expect(communityRepo.createDraft).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({title: 'hello'}),
    );
    expect(communityRepo.publishDraft).toHaveBeenCalledWith('u1', 'd-1');
    expect(result.actionResults.map(item => item.status)).toEqual(['applied', 'applied']);
  });

  test('settings.apply_patch calls settings repository', async () => {
    const settingsRepo = {
      updateMySettings: jest.fn(async (_userId, patch) => patch),
    };
    const service = buildService({settingsRepo});
    const result = await service.execute({
      userId: 'u2',
      planId: 'plan-settings-1',
      grantedScopes: ['settings:write'],
      actions: [
        {
          actionId: 's1',
          domain: 'settings',
          operation: 'apply_patch',
          args: {syncOnWifi: true, communityNotify: false},
          riskLevel: 'low',
          requiresConfirmation: false,
          requiredScopes: ['settings:write'],
        },
      ],
    });

    expect(result.status).toBe('applied');
    expect(settingsRepo.updateMySettings).toHaveBeenCalledWith('u2', {
      syncOnWifi: true,
      communityNotify: false,
    });
  });

  test('grading.apply_visual_suggest validates required args', async () => {
    const colorInterpreter = jest.fn(async () => ({
      status: 200,
      payload: {actions: [{action: 'set_param'}], confidence: 0.9},
    }));
    const service = buildService({colorInterpreter});
    const result = await service.execute({
      userId: 'u3',
      planId: 'plan-grade-1',
      grantedScopes: ['grading:write'],
      actions: [
        {
          actionId: 'g1',
          domain: 'grading',
          operation: 'apply_visual_suggest',
          args: {},
          riskLevel: 'low',
          requiresConfirmation: false,
          requiredScopes: ['grading:write'],
        },
      ],
    });

    expect(result.status).toBe('failed');
    expect(colorInterpreter).not.toHaveBeenCalled();
    expect(result.actionResults[0].errorCode).toBe('invalid_action');
  });

  test('convert.start_task validates args and creates modeling task', async () => {
    const modelingService = {
      createTask: jest.fn(async () => ({taskId: 'task-123', status: 'queued'})),
    };
    const service = buildService({modelingService});
    const ok = await service.execute({
      userId: 'u4',
      planId: 'plan-convert-1',
      grantedScopes: ['convert:write'],
      actions: [
        {
          actionId: 'c1',
          domain: 'convert',
          operation: 'start_task',
          args: {
            image: {
              mimeType: 'image/jpeg',
              fileName: 'agent.jpg',
              base64: Buffer.from('fake-image-bytes').toString('base64'),
            },
          },
          riskLevel: 'low',
          requiresConfirmation: false,
          requiredScopes: ['convert:write'],
        },
      ],
    });

    expect(ok.status).toBe('applied');
    expect(modelingService.createTask).toHaveBeenCalledTimes(1);

    const invalid = await service.execute({
      userId: 'u4',
      planId: 'plan-convert-2',
      grantedScopes: ['convert:write'],
      actions: [
        {
          actionId: 'c2',
          domain: 'convert',
          operation: 'start_task',
          args: {image: {mimeType: 'image/jpeg', fileName: 'bad.jpg'}},
          riskLevel: 'low',
          requiresConfirmation: false,
          requiredScopes: ['convert:write'],
        },
      ],
    });

    expect(invalid.status).toBe('failed');
    expect(invalid.actionResults[0].errorCode).toBe('invalid_action');
  });

  test('navigation/app actions return client_required status', async () => {
    const service = buildService();
    const result = await service.execute({
      userId: 'u5',
      planId: 'plan-client-1',
      grantedScopes: ['app:*'],
      actions: [
        {
          actionId: 'n1',
          domain: 'navigation',
          operation: 'navigate_tab',
          riskLevel: 'low',
          requiresConfirmation: false,
          requiredScopes: ['app:navigate'],
        },
      ],
    });

    expect(result.status).toBe('client_required');
    expect(result.actionResults[0].status).toBe('client_required');
    expect(result.actionResults[0].errorCode).toBe('client_required');
    expect(result.failedActions).toHaveLength(0);
  });

  test('allowConfirmActions executes medium-risk action instead of pending', async () => {
    const modelingService = {
      createTask: jest.fn(async () => ({taskId: 'task-risk', status: 'queued'})),
    };
    const service = buildService({modelingService});
    const result = await service.execute({
      userId: 'u6',
      planId: 'plan-confirm-1',
      allowConfirmActions: true,
      grantedScopes: ['convert:write'],
      actions: [
        {
          actionId: 'm1',
          domain: 'convert',
          operation: 'start_task',
          args: {
            image: {
              mimeType: 'image/jpeg',
              fileName: 'agent.jpg',
              base64: Buffer.from('risk-image').toString('base64'),
            },
          },
          riskLevel: 'medium',
          requiresConfirmation: true,
          requiredScopes: ['convert:write'],
        },
      ],
    });

    expect(result.status).toBe('applied');
    expect(result.pendingActions).toHaveLength(0);
    expect(modelingService.createTask).toHaveBeenCalledTimes(1);
  });
});
