import React from 'react';
import {PermissionsAndroid, Platform} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';

import ThreeDModeling from '../ThreeDModeling';
import {
  createCaptureSession,
  generateCaptureSession,
  getCaptureSession,
  getModelAsset,
  getReconstructionTask,
  uploadCaptureFrame,
} from '../ImageTo3DService';
import {
  resetThreeDModelingSession,
  setThreeDModelingSession,
} from '../ThreeDModelingSession';

jest.mock('react-native-webview', () => {
  const React = require('react');
  const {View} = require('react-native');
  return {
    WebView: ({testID, ...rest}: {testID?: string}) => (
      <View testID={testID ?? 'webview'} {...rest} />
    ),
  };
});

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(),
}));

jest.mock('../ImageTo3DService', () => ({
  createCaptureSession: jest.fn(),
  getCaptureSession: jest.fn(),
  uploadCaptureFrame: jest.fn(),
  generateCaptureSession: jest.fn(),
  getReconstructionTask: jest.fn(),
  getModelAsset: jest.fn(),
  isTerminalJobStatus: (status: string) =>
    status === 'succeeded' || status === 'failed' || status === 'expired',
}));

const {launchCamera} = jest.requireMock('react-native-image-picker') as {
  launchCamera: jest.Mock;
};

const createCaptureSessionMock = createCaptureSession as jest.MockedFunction<
  typeof createCaptureSession
>;
const getCaptureSessionMock = getCaptureSession as jest.MockedFunction<
  typeof getCaptureSession
>;
const uploadCaptureFrameMock = uploadCaptureFrame as jest.MockedFunction<
  typeof uploadCaptureFrame
>;
const generateCaptureSessionMock = generateCaptureSession as jest.MockedFunction<
  typeof generateCaptureSession
>;
const getReconstructionTaskMock = getReconstructionTask as jest.MockedFunction<
  typeof getReconstructionTask
>;
const getModelAssetMock = getModelAsset as jest.MockedFunction<typeof getModelAsset>;

const baseSession = {
  id: 'session-1',
  status: 'collecting' as const,
  targetFrameCount: 14,
  minimumFrameCount: 8,
  acceptedFrameCount: 0,
  coverFrameId: null,
  taskId: null,
  createdAt: '2026-03-09T00:00:00.000Z',
  updatedAt: '2026-03-09T00:00:00.000Z',
  lastErrorCode: null,
  lastErrorMessage: null,
  frames: [],
  missingAngleTags: ['front', 'front_right', 'right'],
  suggestedAngleTag: 'front',
  remainingCount: 14,
  statusHint: '点击任意角度开始拍摄；当前质量提示只做参考，不再强制固定顺序。',
};

describe('ThreeDModeling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    resetThreeDModelingSession();
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    createCaptureSessionMock.mockResolvedValue(baseSession);
    getCaptureSessionMock.mockResolvedValue(baseSession);
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
    jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    resetThreeDModelingSession();
  });

  it('requests camera permission and shows an error when access is denied', async () => {
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);

    const screen = render(<ThreeDModeling />);

    await waitFor(() => {
      expect(screen.getByTestId('capture-guide-card')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('capture-button'));
    });

    expect(PermissionsAndroid.request).toHaveBeenCalled();
    expect(screen.getByText('需要相机权限后才能开始多视角采集。')).toBeTruthy();
  });

  it('uploads an accepted capture frame and advances the suggested next angle', async () => {
    launchCamera.mockResolvedValue({
      assets: [
        {
          uri: 'file:///tmp/capture.jpg',
          type: 'image/jpeg',
          fileName: 'capture.jpg',
          fileSize: 420000,
          width: 2200,
          height: 2200,
        },
      ],
      didCancel: false,
    });

    uploadCaptureFrameMock.mockResolvedValue({
      session: {
        ...baseSession,
        acceptedFrameCount: 1,
        frames: [
          {
            id: 'frame-1',
            sessionId: 'session-1',
            imageUrl: 'http://127.0.0.1:3001/api/capture-sessions/session-1/frames/frame-1/asset',
            angleTag: 'front',
            qualityScore: 0.91,
            qualityIssues: [],
            accepted: true,
            width: 2200,
            height: 2200,
            capturedAt: '2026-03-09T00:01:00.000Z',
          },
        ],
        missingAngleTags: ['front_right', 'right'],
        suggestedAngleTag: 'front_right',
        remainingCount: 13,
        statusHint: '当前覆盖已经足够生成。你也可以继续自由补拍其它角度。',
      },
      frame: {
        id: 'frame-1',
        sessionId: 'session-1',
        imageUrl: 'http://127.0.0.1:3001/api/capture-sessions/session-1/frames/frame-1/asset',
        angleTag: 'front',
        qualityScore: 0.91,
        qualityIssues: [],
        accepted: true,
        width: 2200,
        height: 2200,
        capturedAt: '2026-03-09T00:01:00.000Z',
      },
    });

    const screen = render(<ThreeDModeling />);

    await waitFor(() => {
      expect(screen.getByTestId('capture-guide-card')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('capture-button'));
    });

    await waitFor(() => {
      expect(uploadCaptureFrameMock).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({uri: 'file:///tmp/capture.jpg'}),
        expect.objectContaining({angleTag: 'front'}),
      );
    });

    expect(screen.getByText(/已接收 正前方 视角/)).toBeTruthy();
    expect(screen.getByText('拍摄 前右侧')).toBeTruthy();
  });

  it('lets the user manually choose the capture angle before shooting', async () => {
    launchCamera.mockResolvedValue({
      assets: [
        {
          uri: 'file:///tmp/right.jpg',
          type: 'image/jpeg',
          fileName: 'right.jpg',
          fileSize: 420000,
          width: 2200,
          height: 2200,
        },
      ],
      didCancel: false,
    });

    uploadCaptureFrameMock.mockResolvedValue({
      session: {
        ...baseSession,
        frames: [],
      },
      frame: {
        id: 'frame-right',
        sessionId: 'session-1',
        imageUrl: 'http://127.0.0.1:3001/api/capture-sessions/session-1/frames/frame-right/asset',
        angleTag: 'right',
        qualityScore: 0.7,
        qualityIssues: [],
        accepted: true,
        width: 2200,
        height: 2200,
        capturedAt: '2026-03-09T00:02:00.000Z',
      },
    });

    const screen = render(<ThreeDModeling />);

    await waitFor(() => {
      expect(screen.getByText('右侧')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByText('右侧'));
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('capture-button'));
    });

    await waitFor(() => {
      expect(uploadCaptureFrameMock).toHaveBeenCalledWith(
        'session-1',
        expect.anything(),
        expect.objectContaining({angleTag: 'right'}),
      );
    });
  });

  it('still uploads the frame when local quality looks weak', async () => {
    launchCamera.mockResolvedValue({
      assets: [
        {
          uri: 'file:///tmp/low-quality.jpg',
          type: 'image/jpeg',
          fileName: 'low-quality.jpg',
          fileSize: 90000,
          width: 640,
          height: 640,
        },
      ],
      didCancel: false,
    });

    uploadCaptureFrameMock.mockResolvedValue({
      session: baseSession,
      frame: {
        id: 'frame-low',
        sessionId: 'session-1',
        imageUrl: 'http://127.0.0.1:3001/api/capture-sessions/session-1/frames/frame-low/asset',
        angleTag: 'front',
        qualityScore: 0.32,
        qualityIssues: ['subject_too_small'],
        accepted: false,
        width: 640,
        height: 640,
        capturedAt: '2026-03-09T00:03:00.000Z',
      },
    });

    const screen = render(<ThreeDModeling />);

    await waitFor(() => {
      expect(screen.getByTestId('capture-guide-card')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('capture-button'));
    });

    await waitFor(() => {
      expect(uploadCaptureFrameMock).toHaveBeenCalled();
    });
  });

  it('starts reconstruction and renders the interactive preview when the model is ready', async () => {
    createCaptureSessionMock.mockResolvedValue({
      ...baseSession,
      status: 'ready',
      acceptedFrameCount: 8,
      statusHint: '当前覆盖已经足够生成。你也可以继续自由补拍其它角度。',
    });

    generateCaptureSessionMock.mockResolvedValue({
      taskId: 'task-1',
      modelId: 'task-1',
      sessionId: 'session-1',
      status: 'queued',
      pollAfterMs: 5000,
    });

    getReconstructionTaskMock.mockResolvedValue({
      taskId: 'task-1',
      status: 'succeeded',
      message: 'done',
      previewUrl: 'http://127.0.0.1:3001/api/v1/image-to-3d/jobs/task-1/assets/0',
      previewImageUrl: 'https://example.com/model.webp',
      downloadUrl: 'http://127.0.0.1:3001/api/v1/image-to-3d/jobs/task-1/assets/0',
      fileType: 'GLB',
      viewerFormat: 'glb',
      viewerFiles: [{type: 'GLB', url: 'http://127.0.0.1:3001/api/v1/image-to-3d/jobs/task-1/assets/0'}],
      expiresAt: '2026-03-10T00:00:00.000Z',
      sessionId: 'session-1',
      modelId: 'task-1',
    });

    getCaptureSessionMock.mockResolvedValue({
      ...baseSession,
      status: 'ready_to_view',
      acceptedFrameCount: 8,
      taskId: 'task-1',
      statusHint: '3D result is ready to view.',
    });

    getModelAssetMock.mockResolvedValue({
      id: 'task-1',
      sessionId: 'session-1',
      glbUrl: 'http://127.0.0.1:3001/api/v1/image-to-3d/jobs/task-1/assets/0',
      thumbnailUrl: 'https://example.com/model.webp',
      boundingBox: {x: 1, y: 1, z: 1},
      defaultCamera: {
        position: {x: 2.2, y: 1.6, z: 2.2},
        target: {x: 0, y: 0, z: 0},
        fov: 45,
      },
      autoRotateSpeed: 0.85,
      viewerFormat: 'glb',
      viewerFiles: [{type: 'GLB', url: 'http://127.0.0.1:3001/api/v1/image-to-3d/jobs/task-1/assets/0'}],
      createdAt: '2026-03-09T00:10:00.000Z',
    });

    const screen = render(<ThreeDModeling />);

    await waitFor(() => {
      expect(screen.getByTestId('generate-button').props.accessibilityState.disabled).toBe(false);
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('generate-button'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('model-preview-webview')).toBeTruthy();
    });
  });

  it('restores a persisted capture session and resumes task polling', async () => {
    setThreeDModelingSession({
      captureSessionId: 'session-1',
      reconstructionTaskId: 'task-restore',
      selectedAngleTag: 'right',
    });

    getCaptureSessionMock.mockResolvedValue({
      ...baseSession,
      taskId: 'task-restore',
      status: 'generating',
    });
    getReconstructionTaskMock.mockResolvedValue({
      taskId: 'task-restore',
      status: 'processing',
      message: 'processing',
      previewUrl: null,
      previewImageUrl: null,
      downloadUrl: null,
      fileType: null,
      viewerFormat: null,
      viewerFiles: [],
      expiresAt: null,
      sessionId: 'session-1',
      modelId: null,
    });

    render(<ThreeDModeling />);

    await waitFor(() => {
      expect(getCaptureSessionMock).toHaveBeenCalledWith('session-1');
      expect(getReconstructionTaskMock).toHaveBeenCalledWith('task-restore');
    });

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    await waitFor(() => {
      expect(getReconstructionTaskMock).toHaveBeenCalledTimes(2);
    });
  });

  it('shows a timeout error when reconstruction polling exceeds the max window', async () => {
    createCaptureSessionMock.mockResolvedValue({
      ...baseSession,
      status: 'ready',
      acceptedFrameCount: 8,
      statusHint: '当前覆盖已经足够生成。你也可以继续自由补拍其它角度。',
    });

    generateCaptureSessionMock.mockResolvedValue({
      taskId: 'task-timeout',
      modelId: 'task-timeout',
      sessionId: 'session-1',
      status: 'queued',
      pollAfterMs: 5000,
    });

    getReconstructionTaskMock.mockResolvedValue({
      taskId: 'task-timeout',
      status: 'processing',
      message: 'processing',
      previewUrl: null,
      previewImageUrl: null,
      downloadUrl: null,
      fileType: null,
      viewerFormat: null,
      viewerFiles: [],
      expiresAt: null,
      sessionId: 'session-1',
      modelId: null,
    });

    const screen = render(<ThreeDModeling />);

    await waitFor(() => {
      expect(screen.getByTestId('generate-button').props.accessibilityState.disabled).toBe(false);
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('generate-button'));
    });

    await act(async () => {
      jest.advanceTimersByTime(10 * 60 * 1000 + 5000);
    });

    await waitFor(() => {
      expect(screen.getByText('3D 生成超时，请稍后重试。')).toBeTruthy();
    });
  });
});
