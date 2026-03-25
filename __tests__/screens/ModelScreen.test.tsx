import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {ModelScreen} from '../../src/screens/ModelScreen';

jest.mock('../../src/assets/design', () => ({
  HERO_MODEL: 1,
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
    subtleCard: {},
    primaryButton: {},
    secondaryButton: {},
    progressTrack: {},
    progressFill: {},
  },
  cardSurfaceBlue: {},
  glassShadow: {},
}));

jest.mock('../../src/hooks/useImagePicker', () => ({
  useImagePicker: jest.fn(),
}));

jest.mock('../../src/modules/api', () => {
  class ApiRequestError extends Error {
    code?: string;
    details?: unknown;

    constructor(payload: {message?: string; code?: string; details?: unknown} = {}) {
      super(payload.message || 'api error');
      this.name = 'ApiRequestError';
      this.code = payload.code;
      this.details = payload.details;
    }
  }

  return {
    ApiRequestError,
    formatApiErrorMessage: jest.fn((error: unknown, fallback: string) => {
      if (error instanceof Error && error.message) {
        return error.message;
      }
      return fallback;
    }),
    modelingApi: {
      createJob: jest.fn(),
      getJob: jest.fn(),
      createCaptureSession: jest.fn(),
      uploadCaptureFrame: jest.fn(),
      generateCapture: jest.fn(),
      getModelAsset: jest.fn(),
    },
  };
});

const {useImagePicker} = jest.requireMock('../../src/hooks/useImagePicker') as {
  useImagePicker: jest.Mock;
};

const {modelingApi} = jest.requireMock('../../src/modules/api') as {
  modelingApi: {
    createJob: jest.Mock;
    getJob: jest.Mock;
    createCaptureSession: jest.Mock;
    uploadCaptureFrame: jest.Mock;
    generateCapture: jest.Mock;
    getModelAsset: jest.Mock;
  };
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

const flushMicrotasks = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('ModelScreen behaviors', () => {
  let renderer: TestRenderer.ReactTestRenderer;
  let pickerCallCount = 0;
  let jobSelectedImage: any = null;
  let captureSelectedImage: any = null;
  let nextJobPickResult: any = null;
  let nextCapturePickResult: any = null;

  const jobPickFromGallery = jest.fn(async () => {
    if (nextJobPickResult?.success) {
      jobSelectedImage = nextJobPickResult;
      return nextJobPickResult;
    }
    return {success: false};
  });

  const capturePickFromGallery = jest.fn(async () => {
    if (nextCapturePickResult?.success) {
      captureSelectedImage = nextCapturePickResult;
      return nextCapturePickResult;
    }
    return {success: false};
  });

  const renderScreen = async () => {
    await act(async () => {
      renderer = TestRenderer.create(
        <ModelScreen capabilities={[{module: 'modeling', strictMode: true, provider: 'tripo'} as never]} />,
      );
    });
  };

  const rerenderScreen = async () => {
    await act(async () => {
      renderer.update(
        <ModelScreen capabilities={[{module: 'modeling', strictMode: true, provider: 'tripo'} as never]} />,
      );
    });
  };

  const renderedText = () => stringifyNodeText(renderer.toJSON());

  const findPressableByLabel = (label: string) => {
    const textNode = renderer.root.find(
      node =>
        (typeof node.props?.children === 'string' && node.props.children.includes(label)) ||
        (Array.isArray(node.props?.children) &&
          stringifyNodeText(node.props.children).includes(label)),
    );
    let current: TestRenderer.ReactTestInstance | null = textNode;
    while (current && typeof current.props?.onPress !== 'function') {
      current = current.parent;
    }
    if (!current) {
      throw new Error(`no pressable found for label: ${label}`);
    }
    return current;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    pickerCallCount = 0;
    jobSelectedImage = null;
    captureSelectedImage = null;
    nextJobPickResult = null;
    nextCapturePickResult = null;
    jobPickFromGallery.mockClear();
    capturePickFromGallery.mockClear();

    useImagePicker.mockImplementation(() => {
      pickerCallCount += 1;
      if (pickerCallCount % 2 === 1) {
        return {
          selectedImage: jobSelectedImage,
          isLoading: false,
          pickFromGallery: jobPickFromGallery,
          pickFromCamera: jest.fn(),
          clearImage: jest.fn(),
        };
      }
      return {
        selectedImage: captureSelectedImage,
        isLoading: false,
        pickFromGallery: capturePickFromGallery,
        pickFromCamera: jest.fn(),
        clearImage: jest.fn(),
      };
    });

    modelingApi.createJob.mockReset();
    modelingApi.getJob.mockReset();
    modelingApi.createCaptureSession.mockReset();
    modelingApi.uploadCaptureFrame.mockReset();
    modelingApi.generateCapture.mockReset();
    modelingApi.getModelAsset.mockReset();
    modelingApi.createJob.mockResolvedValue({
      taskId: 'job-1',
      status: 'processing',
      pollAfterMs: 5000,
      message: '处理中',
    });
    modelingApi.getJob.mockResolvedValue({
      taskId: 'job-1',
      status: 'processing',
      pollAfterMs: 5000,
      message: '处理中',
    });
    modelingApi.createCaptureSession.mockResolvedValue({
      id: 'session-1',
      status: 'collecting',
      targetFrameCount: 8,
      minimumFrameCount: 4,
      acceptedFrameCount: 1,
      taskId: null,
      missingAngleTags: [],
      suggestedAngleTag: 'front',
      statusHint: '请继续拍摄',
    });
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => {
        renderer.unmount();
      });
    }
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('shows uploaded image preview immediately after image selection', async () => {
    await renderScreen();
    expect(renderer.root.findAllByProps({testID: 'job-upload-preview'})).toHaveLength(0);

    nextJobPickResult = {
      success: true,
      uri: 'file:///tmp/preview.jpg',
      fileName: 'preview.jpg',
      type: 'image/jpeg',
    };
    await act(async () => {
      findPressableByLabel('选图').props.onPress();
    });
    await flushMicrotasks();
    await rerenderScreen();

    expect(jobPickFromGallery).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByProps({testID: 'job-upload-preview'}).length).toBeGreaterThan(0);
    expect(renderer.root.findByProps({testID: 'job-upload-preview-image'}).props.source).toEqual({
      uri: 'file:///tmp/preview.jpg',
    });
  });

  it('auto-renders model preview when job moves from processing to succeeded', async () => {
    jobSelectedImage = {
      success: true,
      uri: 'file:///tmp/task.jpg',
      fileName: 'task.jpg',
      type: 'image/jpeg',
    };
    modelingApi.createJob.mockResolvedValueOnce({
      taskId: 'task-1',
      status: 'processing',
      pollAfterMs: 100,
      message: '排队中',
    });
    modelingApi.getJob.mockResolvedValueOnce({
      taskId: 'task-1',
      status: 'succeeded',
      pollAfterMs: 100,
      message: '完成',
      downloadUrl: 'https://example.com/assets/task-1.glb',
    });

    await renderScreen();
    await act(async () => {
      findPressableByLabel('创建任务').props.onPress();
    });
    await flushMicrotasks();

    await act(async () => {
      jest.advanceTimersByTime(120);
    });
    await flushMicrotasks();

    expect(modelingApi.getJob).toHaveBeenCalledWith('task-1');
    const viewer = renderer.root.findByProps({testID: 'inline-model-viewer'});
    expect(String(viewer.props.source.html)).toContain('https://example.com/assets/task-1.glb');
  });

  it('shows empty model state without modal/open-preview buttons when viewer url is unavailable', async () => {
    jobSelectedImage = {
      success: true,
      uri: 'file:///tmp/no-model.jpg',
      fileName: 'no-model.jpg',
      type: 'image/jpeg',
    };
    modelingApi.createJob.mockResolvedValueOnce({
      taskId: 'task-2',
      status: 'succeeded',
      message: '完成但无预览',
    });

    await renderScreen();
    await act(async () => {
      findPressableByLabel('创建任务').props.onPress();
    });
    await flushMicrotasks();

    expect(renderedText()).toContain('暂无可预览模型');
    expect(renderedText()).not.toContain('打开内嵌预览');
    expect(renderedText()).not.toContain('查看模型');
    expect(renderedText()).not.toContain('加载模型资产');
  });

  it('keeps capture actions but removes suggested-angle/status-hint guidance text', async () => {
    modelingApi.createCaptureSession.mockResolvedValueOnce({
      id: 'session-2',
      status: 'collecting',
      targetFrameCount: 8,
      minimumFrameCount: 4,
      acceptedFrameCount: 2,
      taskId: null,
      missingAngleTags: ['left'],
      suggestedAngleTag: 'front_left',
      statusHint: '按建议角度继续拍摄',
    });

    await renderScreen();
    await act(async () => {
      findPressableByLabel('实景捕捉').props.onPress();
    });
    await flushMicrotasks();

    await act(async () => {
      findPressableByLabel('创建会话').props.onPress();
    });
    await flushMicrotasks();

    expect(renderedText()).toContain('上传一帧');
    expect(renderedText()).toContain('生成3D模型');
    expect(renderedText()).not.toContain('建议角度');
    expect(renderedText()).not.toContain('按建议角度继续拍摄');
  });
});
