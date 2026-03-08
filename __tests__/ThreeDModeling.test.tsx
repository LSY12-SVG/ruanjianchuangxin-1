import React from 'react';
import { PermissionsAndroid } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import ThreeDModeling from '../ThreeDModeling';
import { resetThreeDModelingSession } from '../ThreeDModelingSession';
import { launchImageLibrary } from 'react-native-image-picker';

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
}));

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    WebView: ({ testID }: { testID?: string }) => <View testID={testID || 'mock-webview'} />,
  };
});

describe('ThreeDModeling', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    resetThreeDModelingSession();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    (launchImageLibrary as jest.Mock).mockResolvedValue({
      assets: [
        {
          uri: 'file:///tmp/portrait.png',
          type: 'image/png',
          fileName: 'portrait.png',
        },
      ],
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('uploads an image, polls the backend, and renders a GLB preview', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ taskId: 'task-1', status: 'queued', pollAfterMs: 5000 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          taskId: 'task-1',
          status: 'processing',
          message: '3D model is being generated.',
          previewUrl: null,
          downloadUrl: null,
          fileType: null,
          expiresAt: null,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          taskId: 'task-1',
          status: 'succeeded',
          message: '3D model is ready.',
          previewUrl: 'https://modelviewer.dev/shared-assets/models/Astronaut.glb',
          downloadUrl: 'https://modelviewer.dev/shared-assets/models/Astronaut.glb',
          fileType: 'GLB',
          expiresAt: '2030-01-01T00:00:00.000Z',
        }),
      });

    const screen = render(<ThreeDModeling onBack={jest.fn()} />);

    fireEvent.press(screen.getByTestId('upload-placeholder'));
    await waitFor(() => expect(launchImageLibrary).toHaveBeenCalled());

    fireEvent.press(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/image-to-3d/jobs'),
        expect.objectContaining({ method: 'POST' })
      );
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
      expect(screen.getByTestId('download-button')).toBeTruthy();
      expect(screen.getByText('Model ready')).toBeTruthy();
    });
  });

  it('shows a retry action when generation fails', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ taskId: 'task-2', status: 'queued', pollAfterMs: 5000 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          taskId: 'task-2',
          status: 'failed',
          message: '3D generation failed.',
          previewUrl: null,
          downloadUrl: null,
          fileType: null,
          expiresAt: null,
        }),
      });

    const screen = render(<ThreeDModeling onBack={jest.fn()} />);

    fireEvent.press(screen.getByTestId('upload-placeholder'));
    await waitFor(() => expect(launchImageLibrary).toHaveBeenCalled());

    fireEvent.press(screen.getByTestId('generate-button'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toBeTruthy();
      expect(screen.getByText('Generation failed')).toBeTruthy();
    });
  });
});


