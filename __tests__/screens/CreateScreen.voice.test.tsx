import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {CreateScreen} from '../../src/screens/CreateScreen';
import {ApiRequestError} from '../../src/modules/api/http';

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
  createSpeechRecognizer: jest.fn(),
  requestRecordAudioPermission: jest.fn(async () => true),
}));

jest.mock('../../src/modules/api', () => {
  const colorApi = {
    initialSuggest: jest.fn(async () => ({})),
    voiceTranscribe: jest.fn(async () => ({
      transcript: '高光降低一点',
      language: 'zh-CN',
    })),
    voiceRefine: jest.fn(async () => ({
      actions: [],
      confidence: 0.9,
      needsConfirmation: false,
      fallbackUsed: false,
      reasoningSummary: 'ok',
      message: 'ok',
      source: 'cloud',
    })),
    autoGrade: jest.fn(async () => ({
      globalActions: [],
      confidence: 0.7,
      fallbackUsed: false,
      explanation: 'ok',
      sceneProfile: 'general',
      qualityRiskFlags: [],
    })),
    segment: jest.fn(async () => ({
      masks: [],
    })),
  };

  return {
    colorApi,
    formatApiErrorMessage: jest.fn((error: unknown, fallback: string) => {
      if (error instanceof Error && error.message) {
        return error.message;
      }
      return fallback;
    }),
  };
});

const {useImagePicker} = jest.requireMock('../../src/hooks/useImagePicker') as {
  useImagePicker: jest.Mock;
};

const {buildVoiceImageContext} = jest.requireMock('../../src/voice/imageContext') as {
  buildVoiceImageContext: jest.Mock;
};

const {parseLocalVoiceCommand} = jest.requireMock('../../src/voice/localParser') as {
  parseLocalVoiceCommand: jest.Mock;
};

const {
  createSpeechRecognizer,
  requestRecordAudioPermission,
} = jest.requireMock('../../src/voice/speechRecognizer') as {
  createSpeechRecognizer: jest.Mock;
  requestRecordAudioPermission: jest.Mock;
};

const {colorApi} = jest.requireMock('../../src/modules/api') as {
  colorApi: {
    voiceTranscribe: jest.Mock;
    voiceRefine: jest.Mock;
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

describe('CreateScreen voice flow', () => {
  let recognizerCallbacks: Record<string, (...args: any[]) => void>;
  let renderer: TestRenderer.ReactTestRenderer;

  beforeEach(async () => {
    jest.useFakeTimers();
    recognizerCallbacks = {};

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

    requestRecordAudioPermission.mockResolvedValue(true);
    colorApi.voiceTranscribe.mockClear();
    colorApi.voiceTranscribe.mockResolvedValue({
      transcript: '高光降低一点',
      language: 'zh-CN',
    });
    colorApi.voiceRefine.mockClear();
    colorApi.voiceRefine.mockResolvedValue({
      actions: [],
      confidence: 0.9,
      needsConfirmation: false,
      fallbackUsed: false,
      reasoningSummary: 'ok',
      message: 'ok',
      source: 'cloud',
    });
    parseLocalVoiceCommand.mockReset();
    parseLocalVoiceCommand.mockReturnValue({
      actions: [],
      confidence: 0,
      needsConfirmation: true,
      fallbackUsed: true,
      reasoningSummary: 'no_match',
      message: 'no_match',
      source: 'fallback',
    });

    createSpeechRecognizer.mockImplementation((callbacks: Record<string, (...args: any[]) => void>) => {
      recognizerCallbacks = callbacks;
      return {
        start: jest.fn(async () => undefined),
        stop: jest.fn(async () => undefined),
        destroy: jest.fn(async () => undefined),
      };
    });

    await act(async () => {
      renderer = TestRenderer.create(
        <CreateScreen
          capabilities={[{module: 'color', strictMode: true, provider: 'tripo'} as never]}
        />,
      );
    });
  });

  afterEach(async () => {
    await act(async () => {
      renderer.unmount();
    });
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const renderedText = () => stringifyNodeText(renderer.toJSON());

  it('calls transcribe first and refines once after audio is ready', async () => {
    await act(async () => {
      recognizerCallbacks.onAudioReady?.({
        uri: 'file:///tmp/mock-audio.m4a',
        mimeType: 'audio/mp4',
      });
    });
    await flushMicrotasks();

    expect(colorApi.voiceTranscribe).toHaveBeenCalledTimes(1);
    expect(colorApi.voiceRefine).toHaveBeenCalledTimes(1);
    expect(colorApi.voiceRefine).toHaveBeenCalledWith(
      expect.any(Object),
      '高光降低一点',
    );
    const transcribeOrder = colorApi.voiceTranscribe.mock.invocationCallOrder[0];
    const refineOrder = colorApi.voiceRefine.mock.invocationCallOrder[0];
    expect(transcribeOrder).toBeLessThan(refineOrder);
  });

  it('exits parsing with retry hint when no transcript is produced before watchdog timeout', async () => {
    const voiceHoldButton = renderer.root.find(
      node =>
        typeof node.props?.onPressIn === 'function' &&
        typeof node.props?.onPressOut === 'function',
    );

    await act(async () => {
      voiceHoldButton.props.onPressIn();
    });
    await flushMicrotasks();

    await act(async () => {
      voiceHoldButton.props.onPressOut();
    });
    await flushMicrotasks();

    await act(async () => {
      jest.advanceTimersByTime(2600);
    });
    await flushMicrotasks();

    expect(renderedText()).toContain('语音采集未获得可转写内容，请重试');
    expect(renderedText()).toContain(
      '错误: 未识别到有效语音，请重试。可尝试：亮度加10、色温冷一点、饱和度减5。',
    );
  });

  it('clears recording/parsing state immediately on recognizer error', async () => {
    const voiceHoldButton = renderer.root.find(
      node =>
        typeof node.props?.onPressIn === 'function' &&
        typeof node.props?.onPressOut === 'function',
    );

    await act(async () => {
      voiceHoldButton.props.onPressIn();
    });
    await flushMicrotasks();
    expect(renderedText()).toContain('松开结束');

    await act(async () => {
      recognizerCallbacks.onError?.('识别服务异常');
    });
    await flushMicrotasks();

    expect(renderedText()).toContain('按住说话');
    expect(renderedText()).toContain('错误: 识别服务异常');
  });

  it('falls back to local parser when cloud refine is rejected by strict mode', async () => {
    colorApi.voiceTranscribe.mockResolvedValueOnce({
      transcript: '对比度加10',
      language: 'zh-CN',
    });
    colorApi.voiceRefine.mockRejectedValueOnce(
      new ApiRequestError({
        code: 'REAL_MODEL_REQUIRED',
        message: 'strict mode reject fallback',
        requestId: 'req-1',
        status: 502,
      }),
    );
    parseLocalVoiceCommand.mockReturnValueOnce({
      actions: [{action: 'adjust_param', target: 'contrast', delta: 10}],
      confidence: 0.9,
      needsConfirmation: false,
      fallbackUsed: false,
      reasoningSummary: 'local_hit',
      message: 'local_hit',
      source: 'local',
    });

    await act(async () => {
      recognizerCallbacks.onAudioReady?.({
        uri: 'file:///tmp/mock-audio-strict.m4a',
        mimeType: 'audio/mp4',
      });
    });
    await flushMicrotasks();

    expect(parseLocalVoiceCommand).toHaveBeenCalledWith('对比度加10');
    expect(renderedText()).toContain('语音精修(本地兜底):');
    expect(renderedText()).not.toContain('错误:');
  });

  it('shows actionable hint when local fallback still has no actions', async () => {
    colorApi.voiceTranscribe.mockResolvedValueOnce({
      transcript: '帮我处理一下',
      language: 'zh-CN',
    });
    colorApi.voiceRefine.mockRejectedValueOnce(
      new ApiRequestError({
        code: 'PROVIDER_TIMEOUT',
        message: 'timeout',
        requestId: 'req-2',
        status: 504,
      }),
    );
    parseLocalVoiceCommand.mockReturnValueOnce({
      actions: [],
      confidence: 0.2,
      needsConfirmation: true,
      fallbackUsed: true,
      reasoningSummary: 'no_match',
      message: 'no_match',
      source: 'fallback',
    });

    await act(async () => {
      recognizerCallbacks.onAudioReady?.({
        uri: 'file:///tmp/mock-audio-no-action.m4a',
        mimeType: 'audio/mp4',
      });
    });
    await flushMicrotasks();

    expect(parseLocalVoiceCommand).toHaveBeenCalledWith('帮我处理一下');
    expect(renderedText()).toContain('未识别到明确调色命令。可尝试：亮度加10、色温冷一点、饱和度减5。');
  });

  it('maps missing speech recognition service error to actionable text', async () => {
    await act(async () => {
      recognizerCallbacks.onError?.('No speech recognition service available on this device');
    });
    await flushMicrotasks();

    expect(renderedText()).toContain('错误: 设备未检测到可用语音识别服务，请安装并启用系统语音识别服务后重试。');
  });

  it('shows retry hint when transcribe returns empty transcript', async () => {
    colorApi.voiceTranscribe.mockResolvedValueOnce({
      transcript: '',
      language: 'zh-CN',
    });

    await act(async () => {
      recognizerCallbacks.onAudioReady?.({
        uri: 'file:///tmp/mock-audio-empty.m4a',
        mimeType: 'audio/mp4',
      });
    });
    await flushMicrotasks();

    expect(colorApi.voiceRefine).not.toHaveBeenCalled();
    expect(renderedText()).toContain('语音转写未返回有效文本，请重试');
    expect(renderedText()).toContain(
      '错误: 未识别到有效语音，请重试。可尝试：亮度加10、色温冷一点、饱和度减5。',
    );
  });

  it('shows readable message when transcribe times out', async () => {
    colorApi.voiceTranscribe.mockRejectedValueOnce(
      new ApiRequestError({
        code: 'ASR_TIMEOUT',
        message: 'timeout',
        requestId: 'req-asr-timeout',
        status: 504,
      }),
    );

    await act(async () => {
      recognizerCallbacks.onAudioReady?.({
        uri: 'file:///tmp/mock-audio-timeout.m4a',
        mimeType: 'audio/mp4',
      });
    });
    await flushMicrotasks();

    expect(renderedText()).toContain('错误: 语音转写超时，请检查网络后重试。');
    expect(colorApi.voiceRefine).not.toHaveBeenCalled();
  });
});
