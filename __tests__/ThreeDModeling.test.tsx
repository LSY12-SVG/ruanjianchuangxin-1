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
  missingAngleTags: ['front', 'front_right'],
  suggestedAngleTag: 'front',
  remainingCount: 14,
  statusHint: 'Keep the object centered and follow the suggested angle order.',
};

describe('ThreeDModeling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
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

  it('uploads an accepted capture frame and advances the guidance angle', async () => {
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
        missingAngleTags: ['front_right'],
        suggestedAngleTag: 'front_right',
        remainingCount: 13,
        statusHint: 'Keep shooting for fuller coverage.',
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

  it('starts reconstruction and renders the interactive preview when the model is ready', async () => {
    createCaptureSessionMock.mockResolvedValue({
      ...baseSession,
      status: 'ready',
      acceptedFrameCount: 8,
      statusHint: 'Coverage is already good enough to generate.',
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
});

