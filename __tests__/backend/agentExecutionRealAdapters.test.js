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
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0]).toMatchObject({
      actionId: 'a1',
      serverId: 'app-core',
      toolName: 'community.create_draft',
      retryCount: 0,
    });
    expect(result.traceId).toEqual(expect.any(String));
    expect(result.resultCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'draft_ready',
          artifact: expect.objectContaining({draftId: 'd-1'}),
        }),
      ]),
    );
    expect(result.completionScore).toBeGreaterThan(0);
    expect(result.resultSummary).toEqual(
      expect.objectContaining({
        done: expect.any(String),
        why: expect.any(String),
        next: expect.any(String),
      }),
    );
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


  test('grading.apply_visual_suggest falls back when strict model path times out', async () => {
    const colorInterpreter = jest
      .fn()
      .mockResolvedValueOnce({
        status: 502,
        payload: {
          error: {
            code: 'MODEL_CHAIN_FAILED',
            message:
              'strict_model_chain_failed:model_chain_failed:Qwen/Qwen3-VL-8B-Instruct:provider request timeout',
          },
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        payload: {
          actions: [{action: 'set_param'}],
          confidence: 0.61,
          source: 'fallback',
          modelRoute: 'fallback_parser',
        },
      });

    const service = buildService({colorInterpreter});
    const result = await service.execute({
      userId: 'u3-fallback',
      planId: 'plan-grade-fallback-1',
      grantedScopes: ['grading:write'],
      actions: [
        {
          actionId: 'g-timeout',
          domain: 'grading',
          operation: 'apply_visual_suggest',
          args: {
            locale: 'zh-CN',
            currentParams: {
              basic: {},
              colorBalance: {},
              pro: {},
            },
            image: {
              mimeType: 'image/jpeg',
              width: 1280,
              height: 720,
              base64: Buffer.from('grading-fallback-image').toString('base64'),
            },
          },
          riskLevel: 'low',
          requiresConfirmation: false,
          requiredScopes: ['grading:write'],
        },
      ],
    });

    expect(result.status).toBe('applied');
    expect(result.failedActions).toHaveLength(0);
    expect(result.actionResults[0]).toMatchObject({
      status: 'applied',
      message: 'initial_visual_suggest_applied_degraded',
    });
    expect(result.actionResults[0].output).toMatchObject({
      fallbackUsed: true,
    });
    expect(colorInterpreter).toHaveBeenCalledTimes(2);
    expect(colorInterpreter.mock.calls[0][1].strictMode).toBe(true);
    expect(colorInterpreter.mock.calls[1][1].strictMode).toBe(false);
  });

  test('grading.apply_visual_suggest degrades gracefully when strict and relaxed both fail', async () => {
    const colorInterpreter = jest
      .fn()
      .mockResolvedValueOnce({
        status: 502,
        payload: {
          error: {
            code: 'MODEL_CHAIN_FAILED',
            message: 'strict_model_chain_failed:model_chain_failed:provider request timeout',
          },
        },
      })
      .mockResolvedValueOnce({
        status: 502,
        payload: {
          error: {
            code: 'UPSTREAM_UNAVAILABLE',
            message: 'upstream temporarily unavailable',
          },
        },
      });

    const service = buildService({colorInterpreter});
    const result = await service.execute({
      userId: 'u3-fallback-2',
      planId: 'plan-grade-fallback-2',
      grantedScopes: ['grading:write'],
      actions: [
        {
          actionId: 'g-timeout-2',
          domain: 'grading',
          operation: 'apply_visual_suggest',
          args: {
            locale: 'zh-CN',
            currentParams: {
              basic: {},
              colorBalance: {},
              pro: {},
            },
            image: {
              mimeType: 'image/jpeg',
              width: 1280,
              height: 720,
              base64: Buffer.from('grading-fallback-image-2').toString('base64'),
            },
          },
          riskLevel: 'low',
          requiresConfirmation: false,
          requiredScopes: ['grading:write'],
        },
      ],
    });

    expect(result.status).toBe('applied');
    expect(result.failedActions).toHaveLength(0);
    expect(result.actionResults[0]).toMatchObject({
      status: 'applied',
      message: 'initial_visual_suggest_degraded',
    });
    expect(result.actionResults[0].output).toMatchObject({
      fallbackUsed: true,
    });
    expect(colorInterpreter).toHaveBeenCalledTimes(2);
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

    expect(ok.status).toBe('waiting_async_result');
    expect(modelingService.createTask).toHaveBeenCalledTimes(1);
    expect(ok.workflowRun).toMatchObject({
      status: 'waiting_async_result',
    });
    expect(ok.resultCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'task_running',
          artifact: expect.objectContaining({taskId: 'task-123'}),
        }),
      ]),
    );

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
    expect(result.resultCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'client_action',
        }),
      ]),
    );
    expect(result.toolCalls[0]).toMatchObject({
      actionId: 'n1',
      serverId: 'app-core',
      toolName: 'navigation.navigate_tab',
      status: 'client_required',
      errorCode: 'client_required',
      retryCount: 0,
    });
    expect(result.recoverySuggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: expect.any(String),
          label: expect.any(String),
        }),
      ]),
    );
  });

  test('client-owned tools are routed through MCP dispatcher with result cards', async () => {
    const service = buildService();
    const result = await service.execute({
      userId: 'u8',
      planId: 'plan-client-tools-1',
      grantedScopes: ['app:*'],
      actions: [
        {
          actionId: 'p1',
          domain: 'permission',
          operation: 'request',
          args: {permission: 'notifications'},
          riskLevel: 'low',
          requiresConfirmation: false,
          requiredScopes: ['app:read'],
        },
        {
          actionId: 'f1',
          domain: 'file',
          operation: 'write',
          args: {fileName: 'demo.glb', target: 'downloads'},
          riskLevel: 'low',
          requiresConfirmation: false,
          requiredScopes: ['app:read'],
        },
      ],
    });

    expect(result.status).toBe('client_required');
    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: 'p1',
          toolName: 'permission.request',
          errorCode: 'client_required',
        }),
        expect.objectContaining({
          actionId: 'f1',
          toolName: 'file.write',
          errorCode: 'client_required',
        }),
      ]),
    );
    expect(result.resultCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'permission_required',
        }),
        expect.objectContaining({
          kind: 'file_saved',
        }),
      ]),
    );
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

    expect(result.status).toBe('waiting_async_result');
    expect(result.pendingActions).toHaveLength(0);
    expect(modelingService.createTask).toHaveBeenCalledTimes(1);
  });

  test('downstream actions stay blocked until dependency is really finished', async () => {
    const communityRepo = {
      createDraft: jest.fn(async () => ({id: 'd-2'})),
    };
    const modelingService = {
      createTask: jest.fn(async () => ({taskId: 'task-234', status: 'processing'})),
    };
    const service = buildService({communityRepo, modelingService});
    const result = await service.execute({
      userId: 'u7',
      planId: 'plan-deps-1',
      allowConfirmActions: true,
      grantedScopes: ['convert:write', 'community:write'],
      actions: [
        {
          actionId: 'c1',
          domain: 'convert',
          operation: 'start_task',
          args: {
            image: {
              mimeType: 'image/jpeg',
              fileName: 'agent.jpg',
              base64: Buffer.from('dep-image').toString('base64'),
            },
          },
          riskLevel: 'medium',
          requiresConfirmation: true,
          requiredScopes: ['convert:write'],
        },
        {
          actionId: 'p1',
          domain: 'community',
          operation: 'create_draft',
          args: {title: 'blocked'},
          dependsOn: ['c1'],
          riskLevel: 'low',
          requiresConfirmation: false,
          requiredScopes: ['community:write'],
        },
      ],
    });

    expect(result.status).toBe('waiting_async_result');
    expect(communityRepo.createDraft).not.toHaveBeenCalled();
    expect(result.actionResults.map(item => item.status)).toEqual([
      'waiting_async_result',
      'blocked',
    ]);
  });
});

