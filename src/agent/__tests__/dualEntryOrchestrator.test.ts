import {
  areMissingContextGuidesResolved,
  applyClientRequiredActions,
  buildMissingContextHintText,
  executeAgentPlanCycle,
  resumePendingAgentWorkflow,
} from '../dualEntryOrchestrator';
import type {AgentExecuteResponse, AgentPlanResponse} from '../../modules/api';
import {useAgentExecutionContextStore} from '../executionContextStore';
import {useAgentWorkflowContinuationStore} from '../workflowContinuationStore';

jest.mock('../../modules/api', () => ({
  agentApi: {
    executePlan: jest.fn(),
    getWorkflowRun: jest.fn(),
    resumeWorkflowRun: jest.fn(),
    registerWorkflowRun: jest.fn(),
    cancelWorkflowRun: jest.fn(),
  },
  modelingApi: {
    getJob: jest.fn(),
  },
}));

jest.mock('../../permissions/clientPermissionBroker', () => ({
  ensureClientPermissions: jest.fn(),
  getClientPermissionLabel: jest.fn((permission: string) => permission),
  openClientPermissionSettings: jest.fn(async () => undefined),
  requestClientPermission: jest.fn(),
}));

jest.mock('../../hooks/useImagePicker', () => ({
  pickImageFromGallery: jest.fn(),
}));

jest.mock('../authPromptStore', () => ({
  requestAgentLogin: jest.fn(),
}));

jest.mock('../../native/fileTransfer', () => ({
  saveRemoteFile: jest.fn(),
}));

const {agentApi} = jest.requireMock('../../modules/api') as {
  agentApi: {
    executePlan: jest.Mock;
    getWorkflowRun: jest.Mock;
    resumeWorkflowRun: jest.Mock;
    registerWorkflowRun: jest.Mock;
    cancelWorkflowRun: jest.Mock;
  };
};

const {
  ensureClientPermissions,
  openClientPermissionSettings,
  requestClientPermission,
} = jest.requireMock('../../permissions/clientPermissionBroker') as {
  ensureClientPermissions: jest.Mock;
  openClientPermissionSettings: jest.Mock;
  requestClientPermission: jest.Mock;
};

const {pickImageFromGallery} = jest.requireMock('../../hooks/useImagePicker') as {
  pickImageFromGallery: jest.Mock;
};

const {requestAgentLogin} = jest.requireMock('../authPromptStore') as {
  requestAgentLogin: jest.Mock;
};

const {saveRemoteFile} = jest.requireMock('../../native/fileTransfer') as {
  saveRemoteFile: jest.Mock;
};

const {modelingApi} = jest.requireMock('../../modules/api') as {
  modelingApi: {
    getJob: jest.Mock;
  };
};

const createAction = (overrides: Partial<AgentPlanResponse['actions'][number]> = {}) => ({
  actionId: overrides.actionId || 'a1',
  id: overrides.id || overrides.actionId || 'a1',
  domain: overrides.domain || 'app',
  operation: overrides.operation || 'summarize_current_page',
  args: overrides.args,
  riskLevel: overrides.riskLevel || 'low',
  requiresConfirmation: overrides.requiresConfirmation || false,
  requiredScopes: overrides.requiredScopes || [],
});

describe('dualEntryOrchestrator', () => {
  beforeEach(() => {
    agentApi.executePlan.mockReset();
    agentApi.getWorkflowRun.mockReset();
    agentApi.resumeWorkflowRun.mockReset();
    agentApi.registerWorkflowRun.mockReset();
    agentApi.cancelWorkflowRun.mockReset();
    modelingApi.getJob.mockReset();
    ensureClientPermissions.mockReset();
    openClientPermissionSettings.mockReset();
    requestClientPermission.mockReset();
    pickImageFromGallery.mockReset();
    requestAgentLogin.mockReset();
    saveRemoteFile.mockReset();
    useAgentWorkflowContinuationStore.getState().clearPendingWorkflow();
    useAgentExecutionContextStore.getState().setColorContext(null);
    useAgentExecutionContextStore.getState().setModelingImageContext(null);
    agentApi.registerWorkflowRun.mockImplementation(async (input: any) => ({
      ...(input.latestExecuteResult || {}),
      workflowRun: {
        ...(input.latestExecuteResult?.workflowRun || {}),
        runId: 'run-ctx-1',
        status: 'waiting_context',
      },
    }));
    ensureClientPermissions.mockResolvedValue({
      granted: true,
      results: [],
      firstDenied: undefined,
    });
    requestClientPermission.mockImplementation(async (permission: string) => ({
      permission,
      granted: true,
      state: 'granted',
      canOpenSettings: false,
    }));
    pickImageFromGallery.mockResolvedValue({
      success: true,
      type: 'image/jpeg',
      fileName: 'agent.jpg',
      width: 100,
      height: 100,
      base64: 'ZmFrZQ==',
    });
    requestAgentLogin.mockResolvedValue(true);
    saveRemoteFile.mockResolvedValue({
      uri: 'file:///downloads/agent.glb',
      savedTo: 'downloads',
      fileName: 'agent.glb',
    });
  });

  it('auto-handles client-required navigation on client side', async () => {
    const navigateToTab = jest.fn();
    const result: AgentExecuteResponse = {
      executionId: 'e1',
      planId: 'p1',
      status: 'client_required',
      actionResults: [
        {
          status: 'client_required',
          message: 'client_action_required:navigation.navigate_tab',
          errorCode: 'client_required',
          action: createAction({
            domain: 'navigation',
            operation: 'navigate_tab',
            args: {tab: 'home', route: 'grading'},
          }),
        },
      ],
    };

    const normalized = await applyClientRequiredActions(result, {
      navigateToTab,
      summarizeCurrentPage: () => '',
    });

    expect(navigateToTab).toHaveBeenCalledWith('create');
    expect(normalized.status).toBe('applied');
    expect(normalized.actionResults[0].status).toBe('applied');
    expect(normalized.clientHandledActions?.length).toBe(1);
  });

  it('auto-handles summarize_current_page and returns summary text', async () => {
    const result: AgentExecuteResponse = {
      executionId: 'e2',
      planId: 'p2',
      status: 'client_required',
      actionResults: [
        {
          status: 'client_required',
          message: 'client_action_required:app.summarize_current_page',
          errorCode: 'client_required',
          action: createAction({
            domain: 'app',
            operation: 'summarize_current_page',
          }),
        },
      ],
    };

    const normalized = await applyClientRequiredActions(result, {
      navigateToTab: () => undefined,
      summarizeCurrentPage: () => '当前页面：调色页；已加载调色图片上下文',
    });

    expect(normalized.status).toBe('applied');
    expect(normalized.pageSummary).toContain('当前页面');
    expect(normalized.actionResults[0].status).toBe('applied');
  });

  it('auto-handles permission request on client side', async () => {
    ensureClientPermissions.mockResolvedValueOnce({
      granted: true,
      results: [
        {
          permission: 'notifications',
          granted: true,
          state: 'granted',
          canOpenSettings: false,
        },
      ],
      firstDenied: undefined,
    });
    const result: AgentExecuteResponse = {
      executionId: 'e-permission',
      planId: 'p-permission',
      status: 'client_required',
      actionResults: [
        {
          status: 'client_required',
          message: 'client_action_required:permission.request',
          errorCode: 'client_required',
          action: createAction({
            domain: 'permission',
            operation: 'request',
            args: {permissions: ['notifications']},
          }),
        },
      ],
    };

    const normalized = await applyClientRequiredActions(result, {
      navigateToTab: () => undefined,
      summarizeCurrentPage: () => '',
    });

    expect(ensureClientPermissions).toHaveBeenCalledWith(['notifications']);
    expect(normalized.status).toBe('applied');
    expect(normalized.actionResults[0].status).toBe('applied');
  });

  it('opens system settings for settings.open client action', async () => {
    const result: AgentExecuteResponse = {
      executionId: 'e-settings',
      planId: 'p-settings',
      status: 'client_required',
      actionResults: [
        {
          status: 'client_required',
          message: 'client_action_required:settings.open',
          errorCode: 'client_required',
          action: createAction({
            domain: 'settings',
            operation: 'open',
            args: {target: 'notifications'},
          }),
        },
      ],
    };

    const normalized = await applyClientRequiredActions(result, {
      navigateToTab: () => undefined,
      summarizeCurrentPage: () => '',
    });

    expect(openClientPermissionSettings).toHaveBeenCalledTimes(1);
    expect(normalized.actionResults[0].status).toBe('applied');
  });

  it('picks an image and stores model context for file.pick client action', async () => {
    const navigateToTab = jest.fn();
    const result: AgentExecuteResponse = {
      executionId: 'e-pick',
      planId: 'p-pick',
      status: 'client_required',
      actionResults: [
        {
          status: 'client_required',
          message: 'client_action_required:file.pick',
          errorCode: 'client_required',
          action: createAction({
            domain: 'file',
            operation: 'pick',
            args: {target: 'model'},
          }),
        },
      ],
    };

    const normalized = await applyClientRequiredActions(result, {
      navigateToTab,
      summarizeCurrentPage: () => '',
    });

    expect(pickImageFromGallery).toHaveBeenCalledTimes(1);
    expect(navigateToTab).toHaveBeenCalledWith('model');
    expect(normalized.actionResults[0].status).toBe('applied');
    expect(useAgentExecutionContextStore.getState().modelingImageContext?.image.fileName).toBe(
      'agent.jpg',
    );
  });

  it('opens login prompt and resumes auth client action when login succeeds', async () => {
    requestClientPermission.mockResolvedValueOnce({
      permission: 'auth_session',
      granted: false,
      state: 'denied',
      canOpenSettings: false,
      message: '需要先登录账号后才能继续执行当前任务。',
    });
    const navigateToTab = jest.fn();
    const result: AgentExecuteResponse = {
      executionId: 'e-auth',
      planId: 'p-auth',
      status: 'client_required',
      actionResults: [
        {
          status: 'client_required',
          message: 'client_action_required:auth.require_login',
          errorCode: 'client_required',
          action: createAction({
            domain: 'auth',
            operation: 'require_login',
          }),
        },
      ],
    };

    const normalized = await applyClientRequiredActions(result, {
      navigateToTab,
      summarizeCurrentPage: () => '',
    });

    expect(navigateToTab).toHaveBeenCalledWith('agent');
    expect(requestAgentLogin).toHaveBeenCalledTimes(1);
    expect(normalized.status).toBe('applied');
    expect(normalized.actionResults[0].status).toBe('applied');
  });

  it('saves exported file through native file transfer bridge', async () => {
    const result: AgentExecuteResponse = {
      executionId: 'e-file-write',
      planId: 'p-file-write',
      status: 'client_required',
      actionResults: [
        {
          status: 'client_required',
          message: 'client_action_required:file.write',
          errorCode: 'client_required',
          action: createAction({
            domain: 'file',
            operation: 'write',
          }),
          output: {
            downloadUrl: 'https://example.com/model.glb',
          },
        },
      ],
    };

    const normalized = await applyClientRequiredActions(result, {
      navigateToTab: () => undefined,
      summarizeCurrentPage: () => '',
    });

    expect(saveRemoteFile).toHaveBeenCalledWith({
      url: 'https://example.com/model.glb',
      fileName: undefined,
      mimeType: undefined,
      target: 'downloads',
    });
    expect(normalized.actionResults[0].status).toBe('applied');
  });

  it('blocks execution when required image context is missing', async () => {
    const navigateToTab = jest.fn();
    const plan: AgentPlanResponse = {
      planId: 'p3',
      plannerSource: 'cloud',
      estimatedSteps: 1,
      reasoningSummary: 'ok',
      actions: [
        createAction({
          domain: 'grading',
          operation: 'apply_visual_suggest',
        }),
      ],
    };

    const cycle = await executeAgentPlanCycle({
      plan,
      context: {
        currentTab: 'agent',
        colorContext: null,
        modelingImageContext: null,
        latestExecuteResult: null,
      },
      clientHandlers: {
        navigateToTab,
        summarizeCurrentPage: () => '',
      },
    });

    expect(cycle.executeResult?.status).toBe('client_required');
    expect(cycle.executeResult?.workflowState?.nextRequiredContext).toBe('context.color.image');
    expect(cycle.executeResult?.actionResults[0]?.status).toBe('client_required');
    expect(navigateToTab).toHaveBeenCalledWith('create');
    expect(agentApi.registerWorkflowRun).toHaveBeenCalledTimes(1);
    expect(cycle.missingContextGuides).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: 'grading.apply_visual_suggest',
          targetTab: 'create',
        }),
      ]),
    );
    expect(buildMissingContextHintText(cycle.missingContextGuides)).toContain('缺少调色图片上下文');
  });

  it('executes runnable prefix and resumes remaining actions after context is restored', async () => {
    const plan: AgentPlanResponse = {
      planId: 'p4',
      plannerSource: 'cloud',
      estimatedSteps: 3,
      reasoningSummary: 'workflow',
      actions: [
        createAction({
          actionId: 'a1',
          domain: 'navigation',
          operation: 'navigate_tab',
          args: {tab: 'home', route: 'grading'},
        }),
        createAction({
          actionId: 'a2',
          domain: 'grading',
          operation: 'apply_visual_suggest',
        }),
        createAction({
          actionId: 'a3',
          domain: 'app',
          operation: 'summarize_current_page',
        }),
      ],
    };

    agentApi.executePlan.mockResolvedValueOnce({
      executionId: 'e-prefix',
      planId: plan.planId,
      status: 'applied',
      workflowState: {
        currentStep: 1,
        totalSteps: 1,
        nextRequiredContext: null,
      },
      actionResults: [
        {
          status: 'applied',
          message: 'ok',
          action: plan.actions[0],
        },
      ],
    });

    const firstCycle = await executeAgentPlanCycle({
      plan,
      context: {
        currentTab: 'agent',
        colorContext: null,
        modelingImageContext: null,
        latestExecuteResult: null,
      },
      clientHandlers: {
        navigateToTab: () => undefined,
        summarizeCurrentPage: () => 'summary',
      },
    });

    expect(agentApi.executePlan).toHaveBeenCalledTimes(1);
    expect(agentApi.executePlan).toHaveBeenNthCalledWith(
      1,
      plan.planId,
      expect.any(Array),
      expect.objectContaining({
        actionIds: ['a1'],
        idempotencyKey: expect.any(String),
      }),
    );
    expect(firstCycle.executeResult?.workflowState?.nextRequiredContext).toBe('context.color.image');
    expect(firstCycle.missingContextGuides[0]?.operation).toBe('grading.apply_visual_suggest');

    agentApi.executePlan.mockResolvedValueOnce({
      executionId: 'e-resume',
      planId: plan.planId,
      status: 'applied',
      workflowState: {
        currentStep: 3,
        totalSteps: 3,
        nextRequiredContext: null,
      },
      actionResults: [
        {
          status: 'applied',
          message: 'grading_ok',
          action: plan.actions[1],
        },
        {
          status: 'applied',
          message: 'summary_ok',
          action: plan.actions[2],
        },
      ],
    });

    const secondCycle = await executeAgentPlanCycle({
      plan,
      context: {
        currentTab: 'create',
        colorContext: {
          locale: 'zh-CN',
          currentParams: {} as never,
          image: {
            mimeType: 'image/jpeg',
            width: 100,
            height: 100,
            base64: 'ZmFrZQ==',
          },
          imageStats: {} as never,
        },
        modelingImageContext: null,
        latestExecuteResult: firstCycle.executeResult,
      },
      clientHandlers: {
        navigateToTab: () => undefined,
        summarizeCurrentPage: () => 'summary',
      },
    });

    expect(agentApi.executePlan).toHaveBeenCalledTimes(2);
    expect(agentApi.executePlan).toHaveBeenNthCalledWith(
      2,
      plan.planId,
      expect.any(Array),
      expect.objectContaining({
        actionIds: ['a2', 'a3'],
        idempotencyKey: expect.any(String),
      }),
    );
    expect(secondCycle.missingContextGuides).toHaveLength(0);
    expect(secondCycle.executeResult?.status).toBe('applied');
  });

  it('replays blocked dependent actions after client-required navigation is handled', async () => {
    const plan: AgentPlanResponse = {
      planId: 'p-nav-followup',
      plannerSource: 'cloud',
      estimatedSteps: 2,
      reasoningSummary: 'workflow',
      actions: [
        createAction({
          actionId: 'a1',
          domain: 'navigation',
          operation: 'navigate_tab',
          args: {tab: 'home', route: 'grading'},
        }),
        createAction({
          actionId: 'a2',
          domain: 'app',
          operation: 'summarize_current_page',
          dependsOn: ['a1'],
        }),
      ],
    };

    agentApi.executePlan.mockResolvedValueOnce({
      executionId: 'e-nav-1',
      planId: plan.planId,
      status: 'client_required',
      actionResults: [
        {
          status: 'client_required',
          message: 'client_action_required:navigation.navigate_tab',
          errorCode: 'client_required',
          action: plan.actions[0],
        },
        {
          status: 'blocked',
          message: 'waiting_on_dependencies:a1',
          action: plan.actions[1],
        },
      ],
    });
    agentApi.executePlan.mockResolvedValueOnce({
      executionId: 'e-nav-2',
      planId: plan.planId,
      status: 'applied',
      actionResults: [
        {
          status: 'client_required',
          message: 'client_action_required:app.summarize_current_page',
          errorCode: 'client_required',
          action: plan.actions[1],
        },
      ],
    });

    const navigateToTab = jest.fn();
    const cycle = await executeAgentPlanCycle({
      plan,
      context: {
        currentTab: 'agent',
        colorContext: null,
        modelingImageContext: null,
        latestExecuteResult: null,
      },
      clientHandlers: {
        navigateToTab,
        summarizeCurrentPage: () => '当前页面：调色页',
      },
    });

    expect(agentApi.executePlan).toHaveBeenCalledTimes(2);
    expect(cycle.executeResult?.status).toBe('applied');
    expect(cycle.executeResult?.pageSummary).toContain('当前页面');
    expect(navigateToTab).toHaveBeenCalledWith('create');
  });

  it('keeps convert action in waiting_async_result until modeling job succeeds, then resumes downstream actions', async () => {
    const plan: AgentPlanResponse = {
      planId: 'p5',
      plannerSource: 'cloud',
      estimatedSteps: 3,
      reasoningSummary: 'workflow',
      actions: [
        createAction({
          actionId: 'a1',
          domain: 'convert',
          operation: 'start_task',
          args: {
            image: {
              mimeType: 'image/jpeg',
              fileName: 'agent.jpg',
              base64: 'ZmFrZQ==',
            },
          },
          riskLevel: 'medium',
          requiresConfirmation: true,
          requiredScopes: ['convert:write'],
        }),
        createAction({
          actionId: 'a2',
          domain: 'community',
          operation: 'create_draft',
          dependsOn: ['a1'],
        }),
        createAction({
          actionId: 'a3',
          domain: 'community',
          operation: 'publish_draft',
          dependsOn: ['a2'],
          riskLevel: 'high',
          requiresConfirmation: true,
        }),
      ],
    };

    agentApi.executePlan.mockResolvedValueOnce({
      executionId: 'e-async-1',
      planId: plan.planId,
      status: 'waiting_async_result',
      workflowRun: {
        runId: 'e-async-1',
        status: 'waiting_async_result',
        currentStep: 1,
        totalSteps: 3,
        nextRequiredContext: null,
        blockedReason: 'waiting_async_result',
        updatedAt: new Date().toISOString(),
        waitingActionId: 'a1',
        pendingTask: {
          taskId: 'task-1',
          taskStatus: 'queued',
          pollAfterMs: 1000,
        },
      },
      workflowState: {
        currentStep: 1,
        totalSteps: 3,
        nextRequiredContext: null,
      },
      actionResults: [
        {
          status: 'waiting_async_result',
          message: 'modeling_task_created',
          output: {
            taskId: 'task-1',
            status: 'queued',
            pollAfterMs: 1000,
          },
          action: plan.actions[0],
        },
        {
          status: 'blocked',
          message: 'waiting_on_dependencies:a1',
          action: plan.actions[1],
        },
        {
          status: 'blocked',
          message: 'waiting_on_dependencies:a2',
          action: plan.actions[2],
        },
      ],
    });

    const firstCycle = await executeAgentPlanCycle({
      plan,
      context: {
        currentTab: 'model',
        colorContext: null,
        modelingImageContext: {
          image: {
            mimeType: 'image/jpeg',
            fileName: 'agent.jpg',
            base64: 'ZmFrZQ==',
          },
        },
        latestExecuteResult: null,
      },
      clientHandlers: {
        navigateToTab: () => undefined,
        summarizeCurrentPage: () => 'summary',
      },
      options: {
        allowConfirmActions: true,
      },
    });

    expect(firstCycle.executeResult?.status).toBe('waiting_async_result');
    expect(firstCycle.executeResult?.workflowRun?.pendingTask?.taskId).toBe('task-1');

    agentApi.resumeWorkflowRun.mockResolvedValueOnce({
      executionId: 'e-async-2',
      planId: plan.planId,
      status: 'pending_confirm',
      workflowRun: {
        runId: 'e-async-1',
        status: 'waiting_confirm',
        currentStep: 3,
        totalSteps: 3,
        nextRequiredContext: 'context.community.draftId',
        blockedReason: 'waiting_confirm',
        updatedAt: new Date().toISOString(),
        waitingActionId: 'a3',
        pendingTask: null,
      },
      workflowState: {
        currentStep: 3,
        totalSteps: 3,
        nextRequiredContext: 'context.community.draftId',
      },
      actionResults: [
        {
          status: 'applied',
          message: 'draft_ok',
          output: {draftId: 'd-1'},
          action: plan.actions[1],
        },
        {
          status: 'pending_confirm',
          message: 'confirmation_required',
          errorCode: 'confirmation_required',
          action: plan.actions[2],
        },
      ],
    });

    const resumed = await resumePendingAgentWorkflow({
      context: {
        currentTab: 'community',
        colorContext: null,
        modelingImageContext: {
          image: {
            mimeType: 'image/jpeg',
            fileName: 'agent.jpg',
            base64: 'ZmFrZQ==',
          },
        },
        latestExecuteResult: firstCycle.executeResult,
      },
      clientHandlers: {
        navigateToTab: () => undefined,
        summarizeCurrentPage: () => 'summary',
      },
    });

    expect(agentApi.resumeWorkflowRun).toHaveBeenCalledWith('e-async-1', {
      allowConfirmActions: false,
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
    expect(resumed?.executeResult?.status).toBe('pending_confirm');
  });

  it('resumes waiting-context workflow through backend context patch after image is provided', async () => {
    const plan: AgentPlanResponse = {
      planId: 'p6',
      plannerSource: 'cloud',
      estimatedSteps: 1,
      reasoningSummary: 'workflow',
      actions: [
        createAction({
          actionId: 'a1',
          domain: 'grading',
          operation: 'apply_visual_suggest',
        }),
      ],
    };

    agentApi.executePlan.mockResolvedValueOnce({
      executionId: 'blocked-1',
      planId: plan.planId,
      status: 'client_required',
      workflowRun: {
        runId: 'run-ctx-1',
        status: 'waiting_context',
        currentStep: 1,
        totalSteps: 1,
        nextRequiredContext: 'context.color.image',
        blockedReason: 'waiting_context',
        updatedAt: new Date().toISOString(),
        waitingActionId: 'a1',
        pendingTask: null,
      },
      actionResults: [],
    });

    const firstCycle = await executeAgentPlanCycle({
      plan,
      context: {
        currentTab: 'agent',
        colorContext: null,
        modelingImageContext: null,
        latestExecuteResult: null,
      },
      clientHandlers: {
        navigateToTab: () => undefined,
        summarizeCurrentPage: () => '',
      },
    });

    agentApi.resumeWorkflowRun.mockResolvedValueOnce({
      executionId: 'exec-ctx-2',
      planId: plan.planId,
      status: 'applied',
      workflowRun: {
        runId: 'run-ctx-1',
        status: 'succeeded',
        currentStep: 1,
        totalSteps: 1,
        nextRequiredContext: null,
        blockedReason: null,
        updatedAt: new Date().toISOString(),
        waitingActionId: null,
        pendingTask: null,
      },
      workflowState: {
        currentStep: 1,
        totalSteps: 1,
        nextRequiredContext: null,
      },
      actionResults: [
        {
          status: 'applied',
          message: 'grading_ok',
          action: plan.actions[0],
        },
      ],
    });

    const resumed = await resumePendingAgentWorkflow({
      context: {
        currentTab: 'create',
        colorContext: {
          locale: 'zh-CN',
          currentParams: {} as never,
          image: {
            mimeType: 'image/jpeg',
            width: 120,
            height: 80,
            base64: 'ZmFrZQ==',
          },
          imageStats: {} as never,
        },
        modelingImageContext: null,
        latestExecuteResult: firstCycle.executeResult,
      },
      clientHandlers: {
        navigateToTab: () => undefined,
        summarizeCurrentPage: () => '',
      },
    });

    expect(agentApi.resumeWorkflowRun).toHaveBeenCalledWith('run-ctx-1', {
      allowConfirmActions: false,
      contextPatch: {
        colorContext: {
          locale: 'zh-CN',
          currentParams: {},
          image: {
            mimeType: 'image/jpeg',
            width: 120,
            height: 80,
            base64: 'ZmFrZQ==',
          },
          imageStats: {},
        },
      },
    });
    expect(resumed?.executeResult?.status).toBe('applied');
  });

  it('detects context recovery readiness for missing guides', () => {
    const guides = [
      {
        operation: 'grading.apply_visual_suggest' as const,
        targetTab: 'create' as const,
        message: '缺少调色图片上下文，请先到调色页选择图片。',
      },
    ];
    expect(
      areMissingContextGuidesResolved(guides, {
        colorContext: null,
        modelingImageContext: null,
      }),
    ).toBe(false);
    expect(
      areMissingContextGuidesResolved(guides, {
        colorContext: {
          locale: 'zh-CN',
          currentParams: {} as never,
          image: {
            mimeType: 'image/jpeg',
            width: 10,
            height: 10,
            base64: 'ZmFrZQ==',
          },
          imageStats: {} as never,
        },
        modelingImageContext: null,
      }),
    ).toBe(true);
  });
});
