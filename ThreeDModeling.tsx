import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type {Asset, ImageLibraryOptions} from 'react-native-image-picker';
import {launchImageLibrary} from 'react-native-image-picker';
import {WebView} from 'react-native-webview';

import {
  createImageTo3DJob,
  getImageTo3DJob,
  isTerminalJobStatus,
  type ImageTo3DJob,
  type ImageTo3DJobStatus,
  type UploadableImageAsset,
} from './ImageTo3DService';

type PermissionState = 'unknown' | 'granted' | 'denied' | 'blocked';
type ScreenStage =
  | 'idle'
  | 'permission_required'
  | 'image_selected'
  | 'submitting'
  | 'processing'
  | 'succeeded'
  | 'failed';

type Props = {
  navigation?: {
    goBack?: () => void;
  };
  onBack?: () => void;
};

const MAX_POLLING_MS = 10 * 60 * 1000;
const DEFAULT_POLL_AFTER_MS = 5000;
const READ_MEDIA_IMAGES_PERMISSION = 'android.permission.READ_MEDIA_IMAGES';

const imagePickerOptions: ImageLibraryOptions = {
  mediaType: 'photo',
  selectionLimit: 1,
  quality: 1,
  includeBase64: false,
};

function getGalleryPermission(): string {
  return Number(Platform.Version) >= 33
    ? READ_MEDIA_IMAGES_PERMISSION
    : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
}

function getStatusMessage(status: ImageTo3DJobStatus): string {
  switch (status) {
    case 'queued':
      return 'Image uploaded. Waiting for the 3D generation job to start.';
    case 'processing':
      return 'Generating the 3D model. This can take a few minutes.';
    case 'succeeded':
      return '3D model generated successfully.';
    case 'failed':
      return '3D generation failed. Try another image or retry.';
    case 'expired':
      return 'The preview link expired. Generate again to refresh the model.';
    default:
      return '';
  }
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === 'object') {
    const message = (error as {message?: unknown}).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }

    const description = (error as {description?: unknown}).description;
    if (typeof description === 'string' && description.trim()) {
      return description;
    }

    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') {
        return serialized;
      }
    } catch (serializationError) {
    }
  }

  return 'Something went wrong. Please try again.';
}

function toUploadableAsset(asset: Asset): UploadableImageAsset {
  return {
    uri: asset.uri ?? '',
    type: asset.type ?? 'image/jpeg',
    fileName: asset.fileName ?? `upload-${Date.now()}.jpg`,
    fileSize: asset.fileSize,
  };
}

function renderModelViewerHtml(modelUrl: string): string {
  const escapedUrl = modelUrl.replace(/"/g, '&quot;');

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
        <script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
        <script nomodule src="https://unpkg.com/@google/model-viewer/dist/model-viewer-legacy.js"></script>
        <style>
          html, body {
            margin: 0;
            height: 100%;
            overflow: hidden;
            background: #111111;
          }
          #viewer {
            width: 100%;
            height: 100%;
            background: radial-gradient(circle at top, #202020, #0f0f0f 70%);
          }
          .fallback {
            display: none;
            box-sizing: border-box;
            padding: 24px;
            color: #ffffff;
            font-family: sans-serif;
            line-height: 1.5;
          }
          .loading {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #d7d7d7;
            font-family: sans-serif;
          }
        </style>
      </head>
      <body>
        <div id="loading" class="loading">Loading 3D preview...</div>
        <model-viewer
          id="viewer"
          src="${escapedUrl}"
          alt="Generated 3D model"
          camera-controls
          auto-rotate
          shadow-intensity="1"
          exposure="1"
          touch-action="pan-y"
          ar="false"
          ar-modes="none"
          interaction-prompt="none"
        ></model-viewer>
        <div id="fallback" class="fallback">Inline preview is unavailable on this WebView. The 3D model was generated successfully, but this device cannot render it inside the app.</div>
        <script>
          const allowedSchemes = ['http:', 'https:', 'about:', 'data:', 'blob:'];
          const loading = document.getElementById('loading');
          const fallback = document.getElementById('fallback');
          const viewer = document.getElementById('viewer');
          const showFallback = () => {
            if (loading) {
              loading.style.display = 'none';
            }
            if (viewer) {
              viewer.style.display = 'none';
            }
            if (fallback) {
              fallback.style.display = 'block';
            }
          };
          const hideLoading = () => {
            if (loading) {
              loading.style.display = 'none';
            }
          };
          const originalOpen = window.open;
          window.open = function(url) {
            if (!url) {
              return null;
            }
            try {
              const parsed = new URL(url, window.location.href);
              if (!allowedSchemes.includes(parsed.protocol)) {
                return null;
              }
            } catch (error) {
              return null;
            }
            return originalOpen ? originalOpen.apply(window, arguments) : null;
          };
          document.addEventListener('click', function(event) {
            const anchor = event.target.closest('a');
            if (!anchor || !anchor.href) {
              return;
            }
            try {
              const parsed = new URL(anchor.href, window.location.href);
              if (!allowedSchemes.includes(parsed.protocol)) {
                event.preventDefault();
              }
            } catch (error) {
              event.preventDefault();
            }
          }, true);
          window.addEventListener('load', function() {
            setTimeout(function() {
              if (!customElements.get('model-viewer')) {
                showFallback();
              }
            }, 3000);
          });
          if (viewer) {
            viewer.addEventListener('load', hideLoading);
            viewer.addEventListener('model-visibility', hideLoading);
            viewer.addEventListener('error', showFallback);
          }
          setTimeout(function() {
            if (loading && loading.style.display !== 'none') {
              showFallback();
            }
          }, 10000);
        </script>
      </body>
    </html>
  `;
}

function shouldAllowWebViewRequest(url?: string): boolean {
  if (!url) {
    return false;
  }

  return (
    url.startsWith('about:blank') ||
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('http://') ||
    url.startsWith('https://')
  );
}

export default function ThreeDModeling({navigation, onBack}: Props) {
  const [permissionState, setPermissionState] =
    useState<PermissionState>('unknown');
  const [screenStage, setScreenStage] = useState<ScreenStage>('idle');
  const [selectedImage, setSelectedImage] = useState<UploadableImageAsset | null>(
    null,
  );
  const [job, setJob] = useState<ImageTo3DJob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [previewErrorMessage, setPreviewErrorMessage] = useState<string | null>(null);

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollDeadlineRef = useRef<number>(0);

  const canGenerate =
    Boolean(selectedImage) &&
    screenStage !== 'submitting' &&
    screenStage !== 'processing';

  const canPreviewModel = useMemo(() => {
    return (
      job?.status === 'succeeded' &&
      Boolean(job.previewUrl) &&
      job.fileType?.toUpperCase() === 'GLB'
    );
  }, [job]);

  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  const clearPolling = () => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  };

  const resetJobState = (nextStage: ScreenStage) => {
    clearPolling();
    setJob(null);
    setErrorMessage(null);
    setStatusMessage('');
    setPreviewErrorMessage(null);
    setScreenStage(nextStage);
  };

  const applyJob = (nextJob: ImageTo3DJob) => {
    setJob(nextJob);
    setStatusMessage(getStatusMessage(nextJob.status));

    if (nextJob.status === 'queued' || nextJob.status === 'processing') {
      setScreenStage('processing');
      return;
    }

    if (nextJob.status === 'succeeded') {
      setScreenStage('succeeded');
      return;
    }

    setScreenStage('failed');
    setErrorMessage(nextJob.message || getStatusMessage(nextJob.status));
  };

  const pollJobStatus = async (taskId: string, pollAfterMs: number) => {
    clearPolling();

    pollTimeoutRef.current = setTimeout(async () => {
      try {
        const latestJob = await getImageTo3DJob(taskId);
        applyJob(latestJob);

        if (!isTerminalJobStatus(latestJob.status)) {
          if (Date.now() >= pollDeadlineRef.current) {
            setScreenStage('failed');
            setErrorMessage('3D generation timed out. Please try again.');
            return;
          }

          pollJobStatus(taskId, DEFAULT_POLL_AFTER_MS);
        }
      } catch (error) {
        setScreenStage('failed');
        setErrorMessage(getErrorMessage(error));
      }
    }, pollAfterMs);
  };

  const requestGalleryPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      setPermissionState('granted');
      return true;
    }

    const permission = getGalleryPermission();
    const hasPermission = await PermissionsAndroid.check(permission as any);
    if (hasPermission) {
      setPermissionState('granted');
      return true;
    }

    const result = await PermissionsAndroid.request(permission as any, {
      title: 'Photo access required',
      message:
        'VisionGenie needs photo access so you can pick a 2D image for 3D generation.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    });

    if (result === PermissionsAndroid.RESULTS.GRANTED) {
      setPermissionState('granted');
      return true;
    }

    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      setPermissionState('blocked');
      setScreenStage('permission_required');
      setErrorMessage(
        'Photo access is blocked. Please enable gallery permission in system settings and try again.',
      );
      return false;
    }

    setPermissionState('denied');
    setScreenStage('permission_required');
    setErrorMessage(
      'Photo access is required before you can choose an image. Tap retry to request permission again.',
    );
    return false;
  };

  const handlePickImage = async () => {
    setErrorMessage(null);

    const hasPermission = await requestGalleryPermission();
    if (!hasPermission) {
      return;
    }

    const result = await launchImageLibrary(imagePickerOptions);

    if (result?.didCancel) {
      if (!selectedImage) {
        setScreenStage('idle');
      }
      return;
    }

    if (result?.errorMessage) {
      setScreenStage('failed');
      setErrorMessage(result.errorMessage);
      return;
    }

    const asset = result?.assets?.[0];
    if (!asset?.uri) {
      setScreenStage('failed');
      setErrorMessage('No image was returned from the gallery.');
      return;
    }

    setPermissionState('granted');
    setSelectedImage(toUploadableAsset(asset));
    resetJobState('image_selected');
  };

  const handleGenerate = async () => {
    if (!selectedImage) {
      return;
    }

    try {
      clearPolling();
      setErrorMessage(null);
      setPreviewErrorMessage(null);
      setStatusMessage('Uploading image and creating the generation job.');
      setScreenStage('submitting');

      const createdJob = await createImageTo3DJob(selectedImage);
      setJob({
        taskId: createdJob.taskId,
        status: createdJob.status,
        message: createdJob.message ?? null,
        previewUrl: null,
        downloadUrl: null,
        fileType: null,
        expiresAt: null,
      });
      pollDeadlineRef.current = Date.now() + MAX_POLLING_MS;

      if (isTerminalJobStatus(createdJob.status)) {
        const finishedJob = await getImageTo3DJob(createdJob.taskId);
        applyJob(finishedJob);
        return;
      }

      setScreenStage('processing');
      setStatusMessage(getStatusMessage(createdJob.status));
      pollJobStatus(createdJob.taskId, createdJob.pollAfterMs ?? DEFAULT_POLL_AFTER_MS);
    } catch (error) {
      setScreenStage('failed');
      setErrorMessage(getErrorMessage(error));
    }
  };

  const previewHtml =
    canPreviewModel && job?.previewUrl ? renderModelViewerHtml(job.previewUrl) : null;

  return (
    <View style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => onBack?.() ?? navigation?.goBack?.()}
            style={styles.backButton}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>3D Modeling (Misako)</Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.85}
          onPress={handlePickImage}
          style={styles.uploadCard}
          testID="upload-card">
          {selectedImage?.uri ? (
            <Image source={{uri: selectedImage.uri}} style={styles.uploadedImage} />
          ) : (
            <Text style={styles.uploadPlaceholder}>Tap to Upload 2D Image</Text>
          )}
        </TouchableOpacity>

        {screenStage === 'permission_required' && (
          <View style={styles.messageCard}>
            <Text style={styles.messageTitle}>Photo access required</Text>
            <Text style={styles.messageBody}>
              {errorMessage ??
                (permissionState === 'blocked'
                  ? 'Photo access is blocked. Enable it in system settings and try again.'
                  : 'Gallery permission is required before you can select an image.')}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={handlePickImage}
              style={styles.secondaryButton}
              testID="retry-permission-button">
              <Text style={styles.secondaryButtonText}>Retry Permission</Text>
            </TouchableOpacity>
          </View>
        )}

        {statusMessage ? (
          <View style={styles.messageCard}>
            <Text style={styles.messageBody}>{statusMessage}</Text>
          </View>
        ) : null}

        {errorMessage && screenStage !== 'permission_required' ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {(screenStage === 'submitting' || screenStage === 'processing') && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#3798EC" />
            <Text style={styles.loadingText}>Generating 3D model...</Text>
          </View>
        )}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{disabled: !canGenerate}}
          disabled={!canGenerate}
          onPress={handleGenerate}
          style={[
            styles.primaryButton,
            !canGenerate && styles.primaryButtonDisabled,
          ]}
          testID="generate-button">
          <Text style={styles.primaryButtonText}>Generate 3D Model</Text>
        </TouchableOpacity>

        {screenStage === 'succeeded' && canPreviewModel && previewHtml ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>3D Preview</Text>
            {previewErrorMessage ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{previewErrorMessage}</Text>
              </View>
            ) : null}
            <View style={styles.webViewWrapper} testID="model-preview">
              <WebView
                originWhitelist={['http://*', 'https://*', 'about:blank', 'data:*', 'blob:*']}
                source={{
                  html: previewHtml,
                  baseUrl: 'https://appassets.androidplatform.net/',
                }}
                javaScriptEnabled
                domStorageEnabled
                mixedContentMode="always"
                setSupportMultipleWindows={false}
                scrollEnabled={false}
                allowsInlineMediaPlayback
                onShouldStartLoadWithRequest={request =>
                  shouldAllowWebViewRequest(request.url)
                }
                onError={syntheticEvent => {
                  const {nativeEvent} = syntheticEvent;
                  setPreviewErrorMessage(getErrorMessage(nativeEvent));
                }}
              />
            </View>
          </View>
        ) : null}

        {screenStage === 'succeeded' && !canPreviewModel ? (
          <View style={styles.messageCard}>
            <Text style={styles.messageTitle}>Preview unavailable</Text>
            <Text style={styles.messageBody}>
              3D generation succeeded, but the returned result is not a previewable
              GLB model.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },
  backButton: {
    marginRight: 16,
    paddingVertical: 8,
    paddingRight: 8,
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 36,
    lineHeight: 40,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '500',
  },
  uploadCard: {
    height: 360,
    borderRadius: 28,
    backgroundColor: '#141414',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadedImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  uploadPlaceholder: {
    color: '#9A9A9A',
    fontSize: 20,
  },
  messageCard: {
    marginTop: 20,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#151A22',
  },
  messageTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  messageBody: {
    color: '#D7D7D7',
    fontSize: 14,
    lineHeight: 20,
  },
  errorCard: {
    marginTop: 20,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#2A1212',
  },
  errorText: {
    color: '#FFB4B4',
    fontSize: 14,
    lineHeight: 20,
  },
  loadingRow: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#E9E9E9',
    fontSize: 15,
  },
  primaryButton: {
    marginTop: 28,
    minHeight: 72,
    borderRadius: 36,
    backgroundColor: '#3798EC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#1D4463',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 14,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: '#2A87DA',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  previewCard: {
    marginTop: 28,
    borderRadius: 24,
    backgroundColor: '#111111',
    padding: 16,
  },
  previewTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  webViewWrapper: {
    height: 360,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#111111',
  },
});
