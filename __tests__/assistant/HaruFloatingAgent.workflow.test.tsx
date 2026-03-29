import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {Text} from 'react-native';
import {HaruFloatingAgent} from '../../src/components/assistant/HaruFloatingAgent';
import {useAgentWorkflowContinuationStore} from '../../src/agent/workflowContinuationStore';

jest.mock('react-native-webview', () => ({
  WebView: 'WebView',
}));

jest.mock('../../src/assistant/frequency', () => ({
  markRuleIgnored: jest.fn((state: unknown) => state),
  markRuleShown: jest.fn((state: unknown) => state),
  shouldTriggerRule: jest.fn(() => false),
}));

jest.mock('../../src/assistant/rules', () => ({
  assistantTriggerRules: [],
}));

jest.mock('../../src/assistant/stateMachine', () => ({
  reduceAssistantUiState: jest.fn((state: unknown) => state),
}));

jest.mock('../../src/agent/executionContextStore', () => ({
  useAgentExecutionContextStore: jest.fn((selector: (state: any) => unknown) =>
    selector({colorContext: null, modelingImageContext: null}),
  ),
}));

jest.mock('../../src/store/appStore', () => ({
  useAppStore: jest.fn((selector: (state: any) => unknown) =>
    selector({assistantFrequency: {}, setAssistantFrequency: jest.fn()}),
  ),
}));

jest.mock('../../src/modules/api', () => ({
  agentApi: {
    getWorkflowRun: jest.fn(),
    cancelWorkflowRun: jest.fn(async () => null),
    registerWorkflowRun: jest.fn(async (input: any) => input.latestExecuteResult),
  },
  formatApiErrorMessage: jest.fn((error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback,
  ),
}));

jest.mock('../../src/agent/dualEntryOrchestrator', () => ({
  areMissingContextGuidesResolved: jest.fn(() => false),
  buildCurrentPageSummary: jest.fn(() => ''),
  buildExecuteStatusPresentation: jest.fn(() => ({
    statusLine: '',
    chatLines: [],
  })),
  buildMissingContextHintText: jest.fn(() => ''),
  cancelPendingAgentWorkflow: jest.fn(async () => null),
  executeAgentPlanCycle: jest.fn(async () => ({hydratedActions: [], missingContextGuides: []})),
  resumePendingAgentWorkflow: jest.fn(async () => null),
  runAgentGoalCycle: jest.fn(async () => ({plan: null, cycle: {hydratedActions: [], missingContextGuides: []}})),
  toResultStatusText: jest.fn(() => '已完成'),
}));

jest.mock('../../src/agent/useAgentVoiceGoal', () => ({
  useAgentVoiceGoal: jest.fn(() => ({
    recording: false,
    phase: 'idle',
    liveTranscript: '',
    errorText: '',
    onPressIn: jest.fn(),
    onPressOut: jest.fn(),
    clearError: jest.fn(),
  })),
}));

describe('HaruFloatingAgent workflow sync', () => {
  let renderer: TestRenderer.ReactTestRenderer;

  const textFromInstance = (instance: TestRenderer.ReactTestInstance): string =>
    instance.children
      .map(child => (typeof child === 'string' ? child : textFromInstance(child)))
      .join('');

  beforeEach(() => {
    useAgentWorkflowContinuationStore.getState().setPendingWorkflow({
      plan: {
        planId: 'plan-sync-1',
        reasoningSummary: '同步测试',
        estimatedSteps: 2,
        plannerSource: 'cloud',
        actions: [
          {
            actionId: 'a1',
            id: 'a1',
            domain: 'grading',
            operation: 'apply_visual_suggest',
            riskLevel: 'low',
            requiresConfirmation: false,
            requiredScopes: [],
          },
          {
            actionId: 'a2',
            id: 'a2',
            domain: 'convert',
            operation: 'start_task',
            riskLevel: 'low',
            requiresConfirmation: false,
            requiredScopes: [],
          },
        ],
      },
      latestExecuteResult: {
        executionId: 'exec-sync-1',
        planId: 'plan-sync-1',
        status: 'client_required',
        workflowState: {
          currentStep: 2,
          totalSteps: 2,
          nextRequiredContext: 'context.modeling.image',
        },
        actionResults: [
          {
            status: 'applied',
            message: '调色已完成',
            action: {
              actionId: 'a1',
              id: 'a1',
              domain: 'grading',
              operation: 'apply_visual_suggest',
              riskLevel: 'low',
              requiresConfirmation: false,
              requiredScopes: [],
            },
          },
        ],
      },
      missingContextGuides: [],
      workflowRun: null,
    });
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => {
        renderer.unmount();
      });
    }
    await act(async () => {
      useAgentWorkflowContinuationStore.getState().clearPendingWorkflow();
    });
  });

  it('shows synced workflow progress after opening the floating panel', async () => {
    await act(async () => {
      renderer = TestRenderer.create(
        <HaruFloatingAgent
          activeTab="agent"
          capabilities={[{module: 'agent', enabled: true} as never]}
          bottomInset={0}
          onNavigateTab={jest.fn()}
        />,
      );
    });

    const collapsedTrigger = renderer.root.find(
      node => typeof node.props?.onPress === 'function' && typeof node.props?.onLongPress === 'function',
    );

    await act(async () => {
      collapsedTrigger.props.onPress();
    });

    const panelText = renderer.root
      .findAllByType(Text)
      .map(node => textFromInstance(node))
      .join(' | ');
    expect(panelText).toContain('等待补充建模图片');
    expect(panelText).toContain('1/2');
    expect(panelText).toContain('执行首轮智能调色');
    expect(panelText).toContain('启动 2D 转 3D 建模');
  });
});
