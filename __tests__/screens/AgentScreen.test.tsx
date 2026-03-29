import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {TextInput} from 'react-native';
import {AgentScreen} from '../../src/screens/AgentScreen';
import {useAgentExecutionContextStore} from '../../src/agent/executionContextStore';

jest.mock('../../src/assets/design', () => ({
  HERO_AGENT: 1,
}));

jest.mock('../../src/components/app/PageHero', () => ({
  PageHero: 'PageHero',
}));

jest.mock('../../src/theme/canvasDesign', () => ({
  canvasText: {
    body: {},
    bodyStrong: {},
    bodyMuted: {},
    sectionTitle: {},
    caption: {},
  },
  canvasUi: {
    titleWithIcon: {},
    iconBadge: {},
    input: {},
    chip: {},
    primaryButton: {},
    secondaryButton: {},
    progressTrack: {},
    progressFill: {},
    subtleCard: {},
  },
  cardSurfaceViolet: {},
  glassShadow: {},
}));

jest.mock('../../src/agent/useAgentVoiceGoal', () => ({
  useAgentVoiceGoal: () => ({
    recording: false,
    phase: 'idle',
    liveTranscript: '',
    errorText: '',
    onPressIn: jest.fn(),
    onPressOut: jest.fn(),
    clearError: jest.fn(),
  }),
}));

jest.mock('../../src/modules/api', () => ({
  agentApi: {
    createPlan: jest.fn(),
    executePlan: jest.fn(),
    getWorkflowRun: jest.fn(),
    getWorkflowRunHistory: jest.fn(async () => ({ok: true, runId: 'run-1', planId: 'plan-agent-1', history: [], latestExecuteResult: null})),
    retryWorkflowRun: jest.fn(),
    registerWorkflowRun: jest.fn(async (input: any) => input.latestExecuteResult),
    cancelWorkflowRun: jest.fn(async () => ({
      executionId: 'exec-cancel',
      planId: 'plan-agent-1',
      status: 'cancelled',
      actionResults: [],
    })),
  },
  formatApiErrorMessage: jest.fn((error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return fallback;
  }),
}));

const {agentApi} = jest.requireMock('../../src/modules/api') as {
  agentApi: {
    createPlan: jest.Mock;
    executePlan: jest.Mock;
    getWorkflowRun: jest.Mock;
    getWorkflowRunHistory: jest.Mock;
    retryWorkflowRun: jest.Mock;
    registerWorkflowRun: jest.Mock;
    cancelWorkflowRun: jest.Mock;
  };
};

const flushMicrotasks = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const stringifyNodeText = (node: any): string => {
  if (node == null) {
    return '';
  }
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(item => stringifyNodeText(item)).join('');
  }
  if (typeof node === 'object' && node.children) {
    return stringifyNodeText(node.children);
  }
  return '';
};

const textFromInstance = (instance: TestRenderer.ReactTestInstance): string =>
  instance.children
    .map(child => (typeof child === 'string' ? child : textFromInstance(child)))
    .join('');

describe('AgentScreen action args injection', () => {
  let renderer: TestRenderer.ReactTestRenderer;
  const navigateTabMock = jest.fn();

  const basePlan = {
    planId: 'plan-agent-1',
    reasoningSummary: 'ok',
    estimatedSteps: 2,
    plannerSource: 'cloud' as const,
    actions: [
      {
        actionId: 'a1',
        id: 'a1',
        domain: 'grading',
        operation: 'apply_visual_suggest',
        riskLevel: 'low' as const,
        requiresConfirmation: false,
        requiredScopes: ['grading:write'],
      },
      {
        actionId: 'a2',
        id: 'a2',
        domain: 'convert',
        operation: 'start_task',
        riskLevel: 'low' as const,
        requiresConfirmation: false,
        requiredScopes: ['convert:write'],
      },
    ],
  };

  const renderScreen = async () => {
    await act(async () => {
      renderer = TestRenderer.create(
        <AgentScreen
          capabilities={[{module: 'agent', strictMode: true, provider: 'local', auth: {required: true}} as never]}
          activeTab="agent"
          onNavigateTab={navigateTabMock}
        />,
      );
    });
  };

  const findPressableByLabel = (label: string) => {
    const candidates = renderer.root.findAll(
      node =>
        typeof node.props?.onPress === 'function' &&
        textFromInstance(node).includes(label),
    );
    if (!candidates.length) {
      throw new Error(`no pressable found for label: ${label}`);
    }
    return candidates[0];
  };

  beforeEach(() => {
    agentApi.createPlan.mockReset();
    agentApi.executePlan.mockReset();
    agentApi.getWorkflowRun.mockReset();
    agentApi.getWorkflowRunHistory.mockReset();
    agentApi.retryWorkflowRun.mockReset();
    agentApi.registerWorkflowRun.mockReset();
    agentApi.cancelWorkflowRun.mockReset();
    agentApi.createPlan.mockResolvedValue(basePlan);
    agentApi.executePlan.mockResolvedValue({
      executionId: 'exec-1',
      planId: 'plan-agent-1',
      status: 'applied',
      actionResults: [],
    });
    agentApi.getWorkflowRunHistory.mockResolvedValue({ok: true, runId: 'run-1', planId: 'plan-agent-1', history: [], latestExecuteResult: null});
    agentApi.executePlan.mockResolvedValue({
      executionId: 'exec-1',
      planId: 'plan-agent-1',
      status: 'applied',
      actionResults: [],
    });
    agentApi.registerWorkflowRun.mockImplementation(async (input: any) => input.latestExecuteResult);
    agentApi.retryWorkflowRun.mockResolvedValue({
      executionId: 'exec-retry',
      planId: 'plan-agent-1',
      status: 'failed',
      actionResults: [],
    });
    agentApi.cancelWorkflowRun.mockResolvedValue({
      executionId: 'exec-cancel',
      planId: 'plan-agent-1',
      status: 'cancelled',
      actionResults: [],
    });
    useAgentExecutionContextStore.setState({
      colorContext: null,
      modelingImageContext: null,
    });
    navigateTabMock.mockReset();
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => {
        renderer.unmount();
      });
    }
  });

  it('injects grading/convert args from execution context before execute', async () => {
    useAgentExecutionContextStore.setState({
      colorContext: {
        locale: 'zh-CN',
        currentParams: {basic: {}, colorBalance: {}, curves: {}, colorWheels: {}} as never,
        image: {
          mimeType: 'image/jpeg',
          width: 1080,
          height: 720,
          base64: 'ZmFrZS1pbWFnZQ==',
        },
        imageStats: {
          lumaMean: 0.3,
          lumaStd: 0.2,
          highlightClipPct: 0.1,
          shadowClipPct: 0.15,
          saturationMean: 0.4,
        },
      },
      modelingImageContext: {
        image: {
          mimeType: 'image/jpeg',
          fileName: 'agent.jpg',
          base64: 'ZmFrZS1tb2RlbA==',
        },
      },
    });
    await renderScreen();

    const input = renderer.root.findByType(TextInput);
    await act(async () => {
      input.props.onChangeText('执行任务');
    });

    await act(async () => {
      findPressableByLabel('生成计划').props.onPress();
    });
    await flushMicrotasks();

    await act(async () => {
      findPressableByLabel('确认执行').props.onPress();
    });
    await flushMicrotasks();

    expect(agentApi.executePlan).toHaveBeenCalledTimes(1);
    const [, actions] = agentApi.executePlan.mock.calls[0];
    expect(actions[0].args).toEqual(
      expect.objectContaining({
        locale: 'zh-CN',
        image: expect.objectContaining({
          mimeType: 'image/jpeg',
          base64: 'ZmFrZS1pbWFnZQ==',
        }),
      }),
    );
    expect(actions[1].args).toEqual({
      image: {
        mimeType: 'image/jpeg',
        fileName: 'agent.jpg',
        base64: 'ZmFrZS1tb2RlbA==',
      },
    });
  }, 15000);

  it('shows missing-context warning and blocks execute request', async () => {
    await renderScreen();
    const input = renderer.root.findByType(TextInput);
    await act(async () => {
      input.props.onChangeText('执行任务');
    });
    await act(async () => {
      findPressableByLabel('生成计划').props.onPress();
    });
    await flushMicrotasks();

    await act(async () => {
      findPressableByLabel('确认执行').props.onPress();
    });
    await flushMicrotasks();

    const text = stringifyNodeText(renderer.toJSON());
    expect(text).toContain('执行前缺少上下文');
    expect(agentApi.executePlan).not.toHaveBeenCalled();
  }, 15000);

  it('renders result cards when execute response includes them', async () => {
    agentApi.executePlan.mockResolvedValueOnce({
      executionId: 'exec-2',
      planId: 'plan-agent-1',
      status: 'applied',
      resultCards: [
        {
          kind: 'draft_ready',
          title: '社区草稿已创建',
          summary: '草稿已生成，可以继续编辑或确认发布。',
          status: 'applied',
          nextAction: {label: '确认后发布'},
        },
      ],
      actionResults: [],
    });

    useAgentExecutionContextStore.setState({
      colorContext: {
        locale: 'zh-CN',
        currentParams: {basic: {}, colorBalance: {}, curves: {}, colorWheels: {}} as never,
        image: {
          mimeType: 'image/jpeg',
          width: 1080,
          height: 720,
          base64: 'ZmFrZS1pbWFnZQ==',
        },
        imageStats: {
          lumaMean: 0.3,
          lumaStd: 0.2,
          highlightClipPct: 0.1,
          shadowClipPct: 0.15,
          saturationMean: 0.4,
        },
      },
      modelingImageContext: {
        image: {
          mimeType: 'image/jpeg',
          fileName: 'agent.jpg',
          base64: 'ZmFrZS1tb2RlbA==',
        },
      },
    });

    await renderScreen();
    const input = renderer.root.findByType(TextInput);
    await act(async () => {
      input.props.onChangeText('执行任务');
    });
    await act(async () => {
      findPressableByLabel('生成计划').props.onPress();
    });
    await flushMicrotasks();
    await act(async () => {
      findPressableByLabel('确认执行').props.onPress();
    });
    await flushMicrotasks();

    const text = stringifyNodeText(renderer.toJSON());
    expect(text).toContain('结果卡');
    expect(text).toContain('社区草稿已创建');
    expect(text).toContain('确认后发布');
  }, 15000);
});


