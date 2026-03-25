import {
  applyClientRequiredActions,
  buildMissingContextHintText,
  executeAgentPlanCycle,
} from '../dualEntryOrchestrator';
import type {AgentExecuteResponse, AgentPlanResponse} from '../../modules/api';

jest.mock('../../modules/api', () => ({
  agentApi: {
    executePlan: jest.fn(),
  },
}));

const {agentApi} = jest.requireMock('../../modules/api') as {
  agentApi: {
    executePlan: jest.Mock;
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
  });

  it('auto-handles client-required navigation on client side', () => {
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

    const normalized = applyClientRequiredActions(result, {
      navigateToTab,
      summarizeCurrentPage: () => '',
    });

    expect(navigateToTab).toHaveBeenCalledWith('create');
    expect(normalized.status).toBe('applied');
    expect(normalized.actionResults[0].status).toBe('applied');
    expect(normalized.clientHandledActions?.length).toBe(1);
  });

  it('auto-handles summarize_current_page and returns summary text', () => {
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

    const normalized = applyClientRequiredActions(result, {
      navigateToTab: () => undefined,
      summarizeCurrentPage: () => '当前页面：调色页；已加载调色图片上下文',
    });

    expect(normalized.status).toBe('applied');
    expect(normalized.pageSummary).toContain('当前页面');
    expect(normalized.actionResults[0].status).toBe('applied');
  });

  it('blocks execution when required image context is missing', async () => {
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
        navigateToTab: () => undefined,
        summarizeCurrentPage: () => '',
      },
    });

    expect(cycle.executeResult).toBeNull();
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
      }),
    );
    expect(secondCycle.missingContextGuides).toHaveLength(0);
    expect(secondCycle.executeResult?.status).toBe('applied');
  });
});
