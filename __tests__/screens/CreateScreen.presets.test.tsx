import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {CreateScreen} from '../../src/screens/CreateScreen';
import {BUILTIN_PRESETS, defaultColorGradingParams} from '../../src/types/colorGrading';

jest.mock('@react-native-community/slider', () => 'Slider');

jest.mock('../../src/assets/design', () => ({
  HERO_CREATE: 1,
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
    chip: {},
    chipActive: {},
    titleWithIcon: {},
    iconBadge: {},
    input: {},
    primaryButton: {},
    secondaryButton: {},
    dangerButton: {},
    subtleCard: {},
  },
  cardSurfaceBlue: {},
  glassShadow: {},
}));

jest.mock('../../src/hooks/useImagePicker', () => ({
  useImagePicker: jest.fn(),
}));

jest.mock('../../src/voice/imageContext', () => ({
  buildVoiceImageContext: jest.fn(),
}));

jest.mock('../../src/voice/localParser', () => ({
  parseLocalVoiceCommand: jest.fn(),
}));

jest.mock('../../src/voice/speechRecognizer', () => ({
  createSpeechRecognizer: jest.fn(() => ({
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    destroy: jest.fn(async () => undefined),
  })),
}));

jest.mock('../../src/permissions/clientPermissionBroker', () => ({
  requestClientPermission: jest.fn(async () => ({
    permission: 'microphone',
    granted: true,
    state: 'granted',
    canOpenSettings: false,
  })),
}));

jest.mock('../../src/modules/api', () => ({
  colorApi: {
    initialSuggest: jest.fn(async () => ({})),
    voiceTranscribe: jest.fn(async () => ({transcript: '', language: 'zh-CN'})),
    voiceRefine: jest.fn(async () => ({
      actions: [],
      confidence: 0,
      needsConfirmation: false,
      fallbackUsed: false,
      reasoningSummary: '',
      message: '',
      source: 'cloud',
    })),
    autoGrade: jest.fn(async () => ({
      globalActions: [],
      confidence: 0,
      fallbackUsed: false,
      explanation: '',
      sceneProfile: 'general',
      qualityRiskFlags: [],
    })),
    segment: jest.fn(async () => ({masks: []})),
  },
  formatApiErrorMessage: jest.fn((error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback,
  ),
}));

jest.mock('../../src/agent/executionContextStore', () => {
  const mockSetColorContext = jest.fn();
  return {
    __mockSetColorContext: mockSetColorContext,
    useAgentExecutionContextStore: jest.fn((selector: (state: any) => unknown) =>
      selector({setColorContext: mockSetColorContext}),
    ),
  };
});

const {useImagePicker} = jest.requireMock('../../src/hooks/useImagePicker') as {
  useImagePicker: jest.Mock;
};

const {buildVoiceImageContext} = jest.requireMock('../../src/voice/imageContext') as {
  buildVoiceImageContext: jest.Mock;
};

const {__mockSetColorContext: mockSetColorContext} = jest.requireMock(
  '../../src/agent/executionContextStore',
) as {
  __mockSetColorContext: jest.Mock;
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

const findPressableByLabel = (
  renderer: TestRenderer.ReactTestRenderer,
  label: string,
): TestRenderer.ReactTestInstance =>
  renderer.root.find(
    node =>
      typeof node.props?.onPress === 'function' &&
      stringifyNodeText(node).replace(/\s+/g, '') === label.replace(/\s+/g, ''),
  );

describe('CreateScreen presets flow', () => {
  let renderer: TestRenderer.ReactTestRenderer;

  beforeEach(async () => {
    useImagePicker.mockReturnValue({
      selectedImage: {
        success: true,
        uri: 'file:///tmp/mock.jpg',
        base64: 'ZmFrZQ==',
        type: 'image/jpeg',
        fileName: 'mock.jpg',
        width: 1080,
        height: 720,
      },
      pickFromGallery: jest.fn(),
      pickFromCamera: jest.fn(),
      clearImage: jest.fn(),
    });

    buildVoiceImageContext.mockReturnValue({
      image: {uri: 'file:///tmp/mock.jpg'},
      imageStats: {brightness: 0.5},
    });

    mockSetColorContext.mockClear();

    await act(async () => {
      renderer = TestRenderer.create(
        <CreateScreen capabilities={[{module: 'color', strictMode: true, provider: 'tripo'} as never]} />,
      );
    });
    await flushMicrotasks();
    mockSetColorContext.mockClear();
  });

  afterEach(async () => {
    await act(async () => {
      renderer.unmount();
    });
  });

  it('applies builtin preset with full params and logs preset history', async () => {
    const warmPreset = BUILTIN_PRESETS.find(item => item.id === 'preset_cinematic_warm');
    expect(warmPreset).toBeDefined();

    await act(async () => {
      findPressableByLabel(renderer, '电影暖色').props.onPress();
    });
    await flushMicrotasks();

    const renderedText = stringifyNodeText(renderer.toJSON());
    expect(renderedText).toContain('已应用预设: 电影暖色');

    await act(async () => {
      findPressableByLabel(renderer, '历史').props.onPress();
    });
    await flushMicrotasks();
    expect(stringifyNodeText(renderer.toJSON())).toContain('预设:电影暖色');

    const latestContext = mockSetColorContext.mock.calls.at(-1)?.[0];
    expect(latestContext).toBeTruthy();
    expect(latestContext.currentParams.pro).toEqual(warmPreset?.params.pro);
  });

  it('resets to default params when original preset is selected', async () => {
    await act(async () => {
      findPressableByLabel(renderer, '电影暖色').props.onPress();
    });
    await flushMicrotasks();

    await act(async () => {
      findPressableByLabel(renderer, '原图').props.onPress();
    });
    await flushMicrotasks();

    const renderedText = stringifyNodeText(renderer.toJSON());
    expect(renderedText).toContain('已应用预设: 原图');
    const latestContext = mockSetColorContext.mock.calls.at(-1)?.[0];
    expect(latestContext.currentParams).toEqual(defaultColorGradingParams);
  });
});
