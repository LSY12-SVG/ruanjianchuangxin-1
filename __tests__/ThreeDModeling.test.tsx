import React from 'react';
import {PermissionsAndroid, Platform} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';

import ThreeDModeling from '../ThreeDModeling';
import {
  createImageTo3DJob,
  getImageTo3DJob,
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
  launchImageLibrary: jest.fn(),
}));

jest.mock('../ImageTo3DService', () => ({
  createImageTo3DJob: jest.fn(),
  getImageTo3DJob: jest.fn(),
  isTerminalJobStatus: (status: string) =>
    status === 'succeeded' || status === 'failed' || status === 'expired',
}));

const {launchImageLibrary} = jest.requireMock('react-native-image-picker') as {
  launchImageLibrary: jest.Mock;
};

const createImageTo3DJobMock = createImageTo3DJob as jest.MockedFunction<
  typeof createImageTo3DJob
>;
const getImageTo3DJobMock = getImageTo3DJob as jest.MockedFunction<
  typeof getImageTo3DJob
>;

const selectedAsset = {
  uri: 'file:///tmp/input.jpg',
  type: 'image/jpeg',
  fileName: 'input.jpg',
};

describe('ThreeDModeling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: 32,
    });
    jest
      .spyOn(PermissionsAndroid, 'check')
      .mockResolvedValue(true);
    jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('requests permission and shows retry state when photo access is denied', async () => {
    jest
      .spyOn(PermissionsAndroid, 'check')
      .mockResolvedValue(false);
    jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);

    const screen = render(<ThreeDModeling />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('upload-card'));
    });

    expect(PermissionsAndroid.request).toHaveBeenCalled();
    expect(screen.getByText('Photo access required')).toBeTruthy();
    expect(screen.getByTestId('retry-permission-button')).toBeTruthy();
  });

  it('enables generate after selecting one image from the gallery', async () => {
    launchImageLibrary.mockResolvedValue({
      assets: [selectedAsset],
      didCancel: false,
    });

    const screen = render(<ThreeDModeling />);
    const generateButton = screen.getByTestId('generate-button');

    expect(generateButton.props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      fireEvent.press(screen.getByTestId('upload-card'));
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('generate-button').props.accessibilityState.disabled,
      ).toBe(false);
    });
  });

  it('polls until a GLB model becomes previewable', async () => {
    launchImageLibrary.mockResolvedValue({
      assets: [selectedAsset],
      didCancel: false,
    });

    createImageTo3DJobMock.mockResolvedValue({
      taskId: 'task-1',
      status: 'queued',
      pollAfterMs: 5000,
      message: null,
    });

    getImageTo3DJobMock
      .mockResolvedValueOnce({
        taskId: 'task-1',
        status: 'processing',
        message: 'still working',
        previewUrl: null,
        previewImageUrl: null,
        downloadUrl: null,
        fileType: null,
        viewerFormat: null,
        viewerFiles: [],
        expiresAt: null,
      })
      .mockResolvedValueOnce({
        taskId: 'task-1',
        status: 'succeeded',
        message: 'done',
        previewUrl: 'https://example.com/model.glb',
        previewImageUrl: 'https://example.com/model.webp',
        downloadUrl: 'https://example.com/model.glb',
        fileType: 'GLB',
        viewerFormat: 'glb',
        viewerFiles: [{type: 'GLB', url: 'https://example.com/model.glb'}],
        expiresAt: '2026-03-09T00:00:00.000Z',
      });

    const screen = render(<ThreeDModeling />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('upload-card'));
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('generate-button'));
    });

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('model-preview')).toBeTruthy();
    });
    expect(screen.getByTestId('model-preview-webview')).toBeTruthy();
  });

  it('renders an OBJ preview when the backend returns rapid-format metadata', async () => {
    launchImageLibrary.mockResolvedValue({
      assets: [selectedAsset],
      didCancel: false,
    });

    createImageTo3DJobMock.mockResolvedValue({
      taskId: 'task-obj',
      status: 'queued',
      pollAfterMs: 5000,
      message: null,
    });

    getImageTo3DJobMock.mockResolvedValue({
      taskId: 'task-obj',
      status: 'succeeded',
      message: 'done',
      previewUrl: 'https://example.com/model.obj',
      previewImageUrl: 'https://example.com/model.webp',
      downloadUrl: 'https://example.com/model.obj',
      fileType: 'OBJ',
      viewerFormat: 'obj',
      viewerFiles: [
        {type: 'OBJ', url: 'https://example.com/model.obj'},
        {type: 'MTL', url: 'https://example.com/model.mtl'},
      ],
      expiresAt: '2026-03-09T00:00:00.000Z',
    });

    const screen = render(<ThreeDModeling />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('upload-card'));
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('generate-button'));
    });

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('model-preview-webview')).toBeTruthy();
    });
  });

  it('shows readable preview errors instead of object stringification', async () => {
    launchImageLibrary.mockResolvedValue({
      assets: [selectedAsset],
      didCancel: false,
    });

    createImageTo3DJobMock.mockResolvedValue({
      taskId: 'task-fbx',
      status: 'succeeded',
      pollAfterMs: 5000,
      message: null,
    });

    getImageTo3DJobMock.mockResolvedValue({
      taskId: 'task-fbx',
      status: 'succeeded',
      message: 'done',
      previewUrl: 'https://example.com/model.fbx',
      previewImageUrl: 'https://example.com/model.webp',
      downloadUrl: 'https://example.com/model.fbx',
      fileType: 'FBX',
      viewerFormat: 'fbx',
      viewerFiles: [{type: 'FBX', url: 'https://example.com/model.fbx'}],
      expiresAt: '2026-03-09T00:00:00.000Z',
    });

    const screen = render(<ThreeDModeling />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('upload-card'));
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('generate-button'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('model-preview-webview')).toBeTruthy();
    });

    fireEvent(screen.getByTestId('model-preview-webview'), 'onMessage', {
      nativeEvent: {
        data: JSON.stringify({type: 'error', message: 'Rapid preview failed.'}),
      },
    });

    expect(screen.getByText('Rapid preview failed.')).toBeTruthy();
    expect(screen.queryByText('[object Object]')).toBeNull();
  });
});