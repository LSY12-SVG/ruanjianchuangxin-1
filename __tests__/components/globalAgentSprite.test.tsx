import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GlobalAgentSprite} from '../../src/components/agent/GlobalAgentSprite';
import {useAppStore} from '../../src/store/appStore';
import type {AgentAction} from '../../src/agent/types';

jest.mock('../../src/agent/runtimeContext', () => ({
  useAgentRuntime: jest.fn(),
}));

jest.mock('../../src/voice/speechRecognizer', () => ({
  requestRecordAudioPermission: jest.fn(async () => true),
  createSpeechRecognizer: jest.fn(() => ({
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    destroy: jest.fn(async () => undefined),
  })),
}));

const {useAgentRuntime} = jest.requireMock('../../src/agent/runtimeContext') as {
  useAgentRuntime: jest.Mock;
};

const basePendingAction: AgentAction = {
  actionId: 'action_1',
  domain: 'settings',
  operation: 'apply_patch',
  riskLevel: 'medium',
  requiresConfirmation: true,
};

const createRuntime = (overrides?: Record<string, unknown>) => ({
  panelVisible: false,
  assistantPanelMode: 'hidden',
  lastAssistantEvent: null,
  togglePanel: jest.fn(),
  closePanel: jest.fn(),
  openAssistantHalfPanel: jest.fn(),
  openAssistantFullPanel: jest.fn(),
  emitAssistantEvent: jest.fn(),
  spriteState: 'idle',
  phase: 'idle',
  goalInput: '',
  setGoalInput: jest.fn(),
  submitGoal: jest.fn(async () => undefined),
  runQuickOptimizeCurrentPage: jest.fn(async () => undefined),
  continueLastTask: jest.fn(async () => undefined),
  pendingActions: [] as AgentAction[],
  confirmPendingActions: jest.fn(async () => undefined),
  dismissPendingActions: jest.fn(),
  undoLastExecution: jest.fn(async () => undefined),
  latestPlan: null,
  lastReasoning: '',
  lastError: '',
  lastMessage: '',
  currentTab: 'assistant',
  ...overrides,
});

const renderSprite = async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(
      <SafeAreaProvider>
        <GlobalAgentSprite />
      </SafeAreaProvider>,
    );
  });
};

describe('GlobalAgentSprite', () => {
  beforeEach(() => {
    useAppStore.setState({
      activeMainTab: 'assistant',
      createRoute: 'hub',
      motionEnabled: true,
      pushConversation: jest.fn(),
    });
    useAgentRuntime.mockReturnValue(createRuntime());
  });

  it('renders collapsed sprite when panel is hidden', async () => {
    useAgentRuntime.mockReturnValue(createRuntime({panelVisible: false}));
    await expect(renderSprite()).resolves.toBeUndefined();
  });

  it('renders panel with pending actions', async () => {
    useAgentRuntime.mockReturnValue(
      createRuntime({
        panelVisible: true,
        assistantPanelMode: 'full',
        phase: 'pending_confirm',
        spriteState: 'confirm',
        pendingActions: [basePendingAction],
        latestPlan: {estimatedSteps: 3},
      }),
    );
    await expect(renderSprite()).resolves.toBeUndefined();
  });

  it('renders panel when motion is disabled', async () => {
    useAppStore.setState({motionEnabled: false});
    useAgentRuntime.mockReturnValue(
      createRuntime({
        panelVisible: true,
        assistantPanelMode: 'full',
        phase: 'running',
        spriteState: 'executing',
      }),
    );
    await expect(renderSprite()).resolves.toBeUndefined();
  });
});
