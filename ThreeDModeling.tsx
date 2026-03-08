import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Linking,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { AppStateStatus } from 'react-native';
import { launchImageLibrary, type Asset, type ImagePickerResponse } from 'react-native-image-picker';
import { WebView } from 'react-native-webview';
import {
  ImageTo3DService,
  type ImageTo3DJobResponse,
  type ImageTo3DTaskStatus,
  type SelectedImageAsset,
} from './ImageTo3DService';
import {
  createEmptyTaskSession,
  getThreeDModelingSession,
  resetThreeDModelingSession,
  setThreeDModelingSession,
  type ThreeDModelingTaskSession,
} from './ThreeDModelingSession';

interface ThreeDModelingProps {
  onBack: () => void;
}

const MAX_POLLING_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_POLL_AFTER_MS = 5000;

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function buildModelViewerHtml(modelUrl: string) {
  const safeUrl = escapeHtmlAttribute(modelUrl);

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
        <style>
          html, body {
            margin: 0;
            height: 100%;
            background: #050505;
          }

          model-viewer {
            width: 100%;
            height: 100%;
            background: radial-gradient(circle at top, rgba(0, 168, 255, 0.18), transparent 55%), #050505;
            --poster-color: transparent;
          }
        </style>
      </head>
      <body>
        <model-viewer
          src="${safeUrl}"
          camera-controls
          auto-rotate
          shadow-intensity="1.1"
          exposure="1"
          ar>
        </model-viewer>
      </body>
    </html>
  `;
}

async function requestPhotoPermission() {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    const permission =
      Platform.Version >= 33 && PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
        ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
        : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

    const result = await PermissionsAndroid.request(permission, {
      title: 'Photo Permission',
      message: 'Vision Genie needs access to your photos to generate a 3D model.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    });

    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.warn('Photo permission request failed', error);
    return false;
  }
}

function toSelectedImage(asset: Asset): SelectedImageAsset | null {
  if (!asset.uri) {
    return null;
  }

  return {
    uri: asset.uri,
    type: asset.type || 'image/jpeg',
    fileName: asset.fileName || 'upload.jpg',
  };
}

export default function ThreeDModeling({ onBack }: ThreeDModelingProps) {
  const persistedSession = useMemo(() => getThreeDModelingSession(), []);
  const serviceRef = useRef(new ImageTo3DService());
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskRef = useRef<ThreeDModelingTaskSession>(persistedSession.task);
  const [selectedImage, setSelectedImage] = useState<SelectedImageAsset | null>(persistedSession.selectedImage);
  const [task, setTask] = useState<ThreeDModelingTaskSession>(persistedSession.task);

  const isBusy = task.status === 'submitting' || task.status === 'queued' || task.status === 'processing';
  const canGenerate = Boolean(selectedImage) && !isBusy;
  const canPreviewInApp = task.status === 'succeeded' && task.fileType === 'GLB' && Boolean(task.previewUrl);

  const persistState = (nextImage: SelectedImageAsset | null, nextTask: ThreeDModelingTaskSession) => {
    taskRef.current = nextTask;
    setSelectedImage(nextImage);
    setTask(nextTask);
    setThreeDModelingSession({
      selectedImage: nextImage,
      task: nextTask,
    });
  };

  const clearPolling = () => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  };

  const updateTaskFromResponse = (response: ImageTo3DJobResponse) => {
    const nextTask: ThreeDModelingTaskSession = {
      taskId: response.taskId,
      status: response.status,
      message: response.message,
      previewUrl: response.previewUrl,
      downloadUrl: response.downloadUrl,
      fileType: response.fileType,
      expiresAt: response.expiresAt,
      pollAfterMs: taskRef.current.pollAfterMs || DEFAULT_POLL_AFTER_MS,
      pollStartedAt: taskRef.current.pollStartedAt,
    };

    persistState(selectedImage, nextTask);
    return nextTask;
  };

  const schedulePoll = (delayMs: number) => {
    clearPolling();
    pollTimeoutRef.current = setTimeout(() => {
      void pollTask();
    }, delayMs);
  };

  const pollTask = async () => {
    const currentTask = taskRef.current;

    if (!currentTask.taskId) {
      return;
    }

    const pollStartedAt = currentTask.pollStartedAt ?? Date.now();
    if (Date.now() - pollStartedAt > MAX_POLLING_WINDOW_MS) {
      persistState(selectedImage, {
        ...currentTask,
        status: 'failed',
        message: '3D generation timed out. Please try again.',
      });
      return;
    }

    try {
      const response = await serviceRef.current.getJob(currentTask.taskId);
      const nextTask = updateTaskFromResponse(response);

      if (nextTask.status === 'queued' || nextTask.status === 'processing') {
        schedulePoll(nextTask.pollAfterMs || DEFAULT_POLL_AFTER_MS);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refresh 3D job status.';
      persistState(selectedImage, {
        ...currentTask,
        status: 'failed',
        message,
      });
    }
  };

  useEffect(() => {
    if (task.status === 'queued' || task.status === 'processing') {
      schedulePoll(0);
    }

    return () => {
      clearPolling();
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const currentTask = taskRef.current;
        if (currentTask.status === 'queued' || currentTask.status === 'processing') {
          schedulePoll(0);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleImageUpload = async () => {
    if (isBusy) {
      return;
    }

    const hasPermission = await requestPhotoPermission();
    if (!hasPermission) {
      Alert.alert('Permission required', 'Please grant photo access to upload a reference image.');
      return;
    }

    try {
      const result: ImagePickerResponse = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        includeBase64: false,
      });

      if (result.didCancel) {
        return;
      }

      if (result.errorCode) {
        Alert.alert('Upload failed', result.errorMessage || 'Unable to open the photo library.');
        return;
      }

      const nextImage = result.assets?.[0] ? toSelectedImage(result.assets[0]) : null;
      if (!nextImage) {
        Alert.alert('Upload failed', 'Please select a valid image.');
        return;
      }

      clearPolling();
      persistState(nextImage, createEmptyTaskSession());
    } catch (error) {
      console.error('Image picker error', error);
      Alert.alert('Upload failed', 'An unexpected error occurred while selecting the image.');
    }
  };

  const handleGenerate3D = async () => {
    if (!selectedImage || isBusy) {
      return;
    }

    const submittingTask: ThreeDModelingTaskSession = {
      taskId: null,
      status: 'submitting',
      message: 'Uploading your image to the backend...',
      previewUrl: null,
      downloadUrl: null,
      fileType: null,
      expiresAt: null,
      pollAfterMs: DEFAULT_POLL_AFTER_MS,
      pollStartedAt: Date.now(),
    };

    persistState(selectedImage, submittingTask);

    try {
      const createdTask = await serviceRef.current.createJob(selectedImage);
      const nextTask: ThreeDModelingTaskSession = {
        taskId: createdTask.taskId,
        status: 'queued',
        message: 'Image uploaded. Waiting for the 3D model to start generating...',
        previewUrl: null,
        downloadUrl: null,
        fileType: null,
        expiresAt: null,
        pollAfterMs: createdTask.pollAfterMs || DEFAULT_POLL_AFTER_MS,
        pollStartedAt: Date.now(),
      };

      persistState(selectedImage, nextTask);
      schedulePoll(nextTask.pollAfterMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start 3D generation.';
      persistState(selectedImage, {
        ...submittingTask,
        status: 'failed',
        message,
      });
      Alert.alert('Generation failed', message);
    }
  };

  const handleRetry = async () => {
    if (selectedImage) {
      await handleGenerate3D();
    }
  };

  const handleDownload = async () => {
    if (!task.downloadUrl) {
      return;
    }

    try {
      await Linking.openURL(task.downloadUrl);
    } catch (_error) {
      Alert.alert('Download failed', 'Unable to open the generated model link.');
    }
  };

  const handleBack = () => {
    clearPolling();
    onBack();
  };

  const handleReset = () => {
    clearPolling();
    resetThreeDModelingSession();
    persistState(null, createEmptyTaskSession());
  };

  const statusLabel = (() => {
    switch (task.status as ImageTo3DTaskStatus) {
      case 'submitting':
        return 'Uploading image';
      case 'queued':
        return 'Queued';
      case 'processing':
        return 'Generating 3D model';
      case 'succeeded':
        return 'Model ready';
      case 'failed':
        return 'Generation failed';
      case 'expired':
        return 'Result expired';
      default:
        return '';
    }
  })();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>3D Modeling (Misako)</Text>
      </View>

      <View style={styles.content}>
        <TouchableOpacity
          testID="upload-placeholder"
          style={styles.imageContainer}
          activeOpacity={0.9}
          onPress={handleImageUpload}>
          {selectedImage ? (
            <>
              <Image source={{ uri: selectedImage.uri }} style={styles.previewImage} resizeMode="cover" />
              <View style={styles.imageOverlay}>
                <Text style={styles.imageOverlayText}>{isBusy ? 'Generating…' : 'Tap to change image'}</Text>
              </View>
            </>
          ) : (
            <View style={styles.uploadPlaceholder}>
              <Text style={styles.uploadText}>Tap to Upload 2D Image</Text>
            </View>
          )}
        </TouchableOpacity>

        {selectedImage ? (
          <TouchableOpacity
            testID="generate-button"
            style={[styles.generateButton, !canGenerate && styles.disabledButton]}
            disabled={!canGenerate}
            onPress={handleGenerate3D}>
            {isBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.generateButtonText}>Generate 3D Model</Text>}
          </TouchableOpacity>
        ) : null}

        {task.status !== 'idle' ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>{statusLabel}</Text>
            <Text style={styles.statusMessage}>{task.message}</Text>
          </View>
        ) : null}

        {canPreviewInApp && task.previewUrl ? (
          <View style={styles.viewerSection}>
            <Text style={styles.viewerTitle}>3D Preview</Text>
            <View style={styles.viewerFrame}>
              <WebView
                testID="model-preview"
                originWhitelist={['*']}
                source={{ html: buildModelViewerHtml(task.previewUrl) }}
                style={styles.viewerWebView}
                javaScriptEnabled
                domStorageEnabled
                mixedContentMode="always"
              />
            </View>
          </View>
        ) : null}

        {task.status === 'succeeded' && !canPreviewInApp ? (
          <View style={styles.fallbackCard}>
            <Text style={styles.fallbackTitle}>Preview unavailable in-app</Text>
            <Text style={styles.fallbackText}>This result is not a GLB file, so the app will offer download only.</Text>
          </View>
        ) : null}

        {(task.status === 'succeeded' || task.status === 'expired') && task.downloadUrl ? (
          <TouchableOpacity testID="download-button" style={styles.secondaryButton} onPress={handleDownload}>
            <Text style={styles.secondaryButtonText}>Download Model</Text>
          </TouchableOpacity>
        ) : null}

        {(task.status === 'failed' || task.status === 'expired') && selectedImage ? (
          <TouchableOpacity testID="retry-button" style={styles.secondaryButton} onPress={handleRetry}>
            <Text style={styles.secondaryButtonText}>Retry Generation</Text>
          </TouchableOpacity>
        ) : null}

        {selectedImage ? (
          <TouchableOpacity style={styles.ghostButton} onPress={handleReset}>
            <Text style={styles.ghostButtonText}>Clear Session</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 18,
  },
  backButton: {
    paddingVertical: 10,
    paddingRight: 12,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 26,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  imageContainer: {
    height: 320,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#141414',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  uploadPlaceholder: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadText: {
    color: '#8b8b8b',
    fontSize: 18,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  imageOverlayText: {
    color: '#fff',
    fontSize: 14,
  },
  generateButton: {
    height: 58,
    borderRadius: 29,
    backgroundColor: '#2a9af2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  disabledButton: {
    backgroundColor: '#4f6474',
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  statusCard: {
    borderRadius: 18,
    backgroundColor: '#111827',
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(42,154,242,0.25)',
  },
  statusLabel: {
    color: '#73c2ff',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  statusMessage: {
    color: '#f3f4f6',
    fontSize: 15,
    lineHeight: 22,
  },
  viewerSection: {
    marginBottom: 18,
  },
  viewerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  viewerFrame: {
    height: 280,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#050505',
  },
  viewerWebView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  fallbackCard: {
    borderRadius: 18,
    backgroundColor: '#131313',
    padding: 16,
    marginBottom: 18,
  },
  fallbackTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  fallbackText: {
    color: '#c5c5c5',
    fontSize: 14,
    lineHeight: 20,
  },
  secondaryButton: {
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryButtonText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  ghostButton: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  ghostButtonText: {
    color: '#9ca3af',
    fontSize: 14,
  },
});
