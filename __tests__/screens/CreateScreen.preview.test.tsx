import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {CreateScreen} from '../../src/screens/CreateScreen';

jest.mock('@react-native-community/slider', () => 'Slider');

jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const {View} = require('react-native');
  return {
    Canvas: ({children, ...props}: any) => <View {...props}>{children}</View>,
    ColorMatrix: ({children, ...props}: any) => <View {...props}>{children}</View>,
    Image: (props: any) => <View {...props} />,
    Skia: {
      Data: {
        fromBase64: jest.fn(() => ({mock: true})),
      },
      Image: {
        MakeImageFromEncoded: jest.fn(() => ({mockImage: true})),
      },
    },
  };
});

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
    useAgentExecutionContextStore: jest.fn((selector: (state: any) => unknown) =>
      selector({setColorContext: mockSetColorContext, modelingImageContext: null}),
    ),
  };
});

jest.mock('../../src/agent/workflowContinuationStore', () => ({
  useAgentWorkflowContinuationStore: jest.fn((selector: (state: any) => unknown) =>
    selector({pendingWorkflow: null}),
  ),
}));

jest.mock('../../src/agent/clientNavigationBridge', () => ({
  useAgentClientNavigationBridge: jest.fn((selector: (state: any) => unknown) =>
    selector({navigateToTab: jest.fn()}),
  ),
}));

const {useImagePicker} = jest.requireMock('../../src/hooks/useImagePicker') as {
  useImagePicker: jest.Mock;
};

const {buildVoiceImageContext} = jest.requireMock('../../src/voice/imageContext') as {
  buildVoiceImageContext: jest.Mock;
};

const flattenStyleHeight = (style: unknown): number | undefined => {
  if (Array.isArray(style)) {
    for (let index = style.length - 1; index >= 0; index -= 1) {
      const value = flattenStyleHeight(style[index]);
      if (typeof value === 'number') {
        return value;
      }
    }
    return undefined;
  }
  if (style && typeof style === 'object' && 'height' in (style as Record<string, unknown>)) {
    const value = (style as Record<string, unknown>).height;
    if (typeof value === 'number') {
      return value;
    }
  }
  return undefined;
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

describe('CreateScreen preview sizing', () => {
  let renderer: TestRenderer.ReactTestRenderer;

  beforeEach(async () => {
    useImagePicker.mockReturnValue({
      selectedImage: {
        success: true,
        uri: 'file:///tmp/mock-tall.jpg',
        base64: 'ZmFrZQ==',
        type: 'image/jpeg',
        fileName: 'mock-tall.jpg',
        width: 1000,
        height: 2000,
      },
      pickFromGallery: jest.fn(),
      pickFromCamera: jest.fn(),
      clearImage: jest.fn(),
    });

    buildVoiceImageContext.mockReturnValue({
      image: {uri: 'file:///tmp/mock-tall.jpg'},
      imageStats: {brightness: 0.5},
    });

    await act(async () => {
      renderer = TestRenderer.create(
        <CreateScreen capabilities={[{module: 'color', strictMode: true, provider: 'tripo'} as never]} />,
      );
    });
  });

  afterEach(async () => {
    await act(async () => {
      renderer.unmount();
    });
  });

  it('uses adaptive preview height and contain resize for uploaded image', async () => {
    await act(async () => {
      renderer.root.findByProps({testID: 'create-preview-frame'}).props.onLayout({
        nativeEvent: {layout: {width: 300, height: 220}},
      });
    });

    const imagePreview = renderer.root.findByProps({testID: 'create-preview-image'});
    expect(imagePreview.props.resizeMode).toBe('contain');
    expect(flattenStyleHeight(imagePreview.props.style)).toBe(420);
  });

  it('uses contain fit for skia preview after preset is applied', async () => {
    await act(async () => {
      renderer.root.findByProps({testID: 'create-preview-frame'}).props.onLayout({
        nativeEvent: {layout: {width: 300, height: 220}},
      });
    });

    await act(async () => {
      findPressableByLabel(renderer, '电影暖色').props.onPress();
    });

    const skiaNodes = renderer.root.findAll(node => node.props?.fit === 'contain');
    expect(skiaNodes.length).toBeGreaterThan(0);
    expect(skiaNodes[0].props.height).toBe(420);
  });
});
