import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {HaruFloatingAgent} from '../../src/components/assistant/HaruFloatingAgent';

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
  buildMissingContextHintText: jest.fn(() => ''),
  executeAgentPlanCycle: jest.fn(async () => ({hydratedActions: [], missingContextGuides: []})),
  resumePendingAgentWorkflow: jest.fn(async () => null),
  runAgentGoalCycle: jest.fn(async () => ({plan: null, cycle: {hydratedActions: [], missingContextGuides: []}})),
  toResultStatusText: jest.fn(() => ''),
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

describe('HaruFloatingAgent expanded drag affordance', () => {
  let renderer: TestRenderer.ReactTestRenderer;

  beforeEach(async () => {
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
  });

  afterEach(async () => {
    await act(async () => {
      renderer.unmount();
    });
  });

  it('shows drag handle in expanded panel and close action still works', async () => {
    const collapsedTrigger = renderer.root.find(
      node => typeof node.props?.onPress === 'function' && typeof node.props?.onLongPress === 'function',
    );

    await act(async () => {
      collapsedTrigger.props.onPress();
    });

    const dragHandle = renderer.root.findByProps({testID: 'floating-agent-drag-handle'});
    const responderKeys = Object.keys(dragHandle.props).filter(key => key.toLowerCase().includes('responder'));
    expect(responderKeys.length).toBeGreaterThan(0);
    expect(
      responderKeys.some(key => typeof (dragHandle.props as Record<string, unknown>)[key] === 'function'),
    ).toBe(true);

    await act(async () => {
      renderer.root.findByProps({testID: 'floating-agent-close-btn'}).props.onPress();
    });

    expect(renderer.root.findAllByProps({testID: 'floating-agent-drag-handle'})).toHaveLength(0);
  });
});
