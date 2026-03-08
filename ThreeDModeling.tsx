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
  type ViewerFile,
  type ViewerFormat,
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

type ViewerEvent = {
  type?: 'loaded' | 'error';
  message?: string;
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
    } catch (_serializationError) {
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

function serializeForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function renderThreePreviewHtml(viewerFormat: ViewerFormat, viewerFiles: ViewerFile[]): string {
  const serializedPayload = serializeForHtml({viewerFormat, viewerFiles});

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
        <style>
          html, body {
            margin: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: #101010;
            font-family: sans-serif;
          }
          #root {
            position: relative;
            width: 100%;
            height: 100%;
          }
          #canvas {
            width: 100%;
            height: 100%;
            display: block;
          }
          #status {
            position: absolute;
            left: 12px;
            right: 12px;
            bottom: 12px;
            padding: 10px 12px;
            border-radius: 12px;
            background: rgba(0, 0, 0, 0.68);
            color: #ffffff;
            font-size: 13px;
            line-height: 1.5;
          }
          #status[data-hidden="true"] {
            display: none;
          }
        </style>
        <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/FBXLoader.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/OBJLoader.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/MTLLoader.js"></script>
      </head>
      <body>
        <div id="root">
          <canvas id="canvas"></canvas>
          <div id="status">Loading 3D preview...</div>
        </div>
        <script>
          const payload = ${serializedPayload};
          const statusNode = document.getElementById('status');
          const canvas = document.getElementById('canvas');
          const scene = new THREE.Scene();
          scene.background = new THREE.Color(0x111111);

          const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

          const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
          camera.position.set(2.4, 1.8, 2.4);

          const controls = new THREE.OrbitControls(camera, renderer.domElement);
          controls.enableDamping = true;
          controls.target.set(0, 0, 0);

          scene.add(new THREE.AmbientLight(0xffffff, 1.2));
          const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
          keyLight.position.set(4, 6, 8);
          scene.add(keyLight);
          const fillLight = new THREE.DirectionalLight(0x9db4ff, 0.5);
          fillLight.position.set(-5, 3, -4);
          scene.add(fillLight);
          const grid = new THREE.GridHelper(10, 10, 0x2f2f2f, 0x1b1b1b);
          grid.position.y = -1.2;
          scene.add(grid);

          function postMessage(type, message) {
            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type, message }));
            }
          }

          function setStatus(message, isError) {
            if (!statusNode) {
              return;
            }
            statusNode.dataset.hidden = 'false';
            statusNode.textContent = message;
            statusNode.style.background = isError ? 'rgba(106, 20, 20, 0.82)' : 'rgba(0, 0, 0, 0.68)';
          }

          function clearStatus() {
            if (!statusNode) {
              return;
            }
            statusNode.dataset.hidden = 'true';
          }

          function reportError(message) {
            const safeMessage = message || '3D preview failed to load.';
            setStatus(safeMessage, true);
            postMessage('error', safeMessage);
          }

          function resizeRenderer() {
            const width = window.innerWidth || 1;
            const height = window.innerHeight || 1;
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
          }

          function fileByType(type) {
            return (payload.viewerFiles || []).find(file => file.type === type) || null;
          }

          function basePath(url) {
            const lastSlashIndex = url.lastIndexOf('/');
            return lastSlashIndex >= 0 ? url.slice(0, lastSlashIndex + 1) : url;
          }

          function frameObject(object) {
            const box = new THREE.Box3().setFromObject(object);
            if (box.isEmpty()) {
              return;
            }
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            object.position.sub(center);
            const maxDimension = Math.max(size.x, size.y, size.z) || 1;
            camera.position.set(maxDimension * 1.6, maxDimension * 1.2, maxDimension * 1.6);
            controls.target.set(0, 0, 0);
            controls.update();
          }

          function onLoaded(object) {
            scene.add(object);
            frameObject(object);
            clearStatus();
            postMessage('loaded', '3D preview ready.');
          }

          function loadGlbLike() {
            const modelFile = fileByType(payload.viewerFormat === 'gltf' ? 'GLTF' : 'GLB');
            if (!modelFile || !modelFile.url) {
              reportError('The generated model file is missing.');
              return;
            }

            const loader = new THREE.GLTFLoader();
            loader.load(
              modelFile.url,
              gltf => onLoaded(gltf.scene),
              undefined,
              error => reportError(error && error.message ? error.message : 'Failed to load the generated model.'),
            );
          }

          function loadFbx() {
            const modelFile = fileByType('FBX');
            if (!modelFile || !modelFile.url) {
              reportError('The generated FBX file is missing.');
              return;
            }

            const loader = new THREE.FBXLoader();
            loader.load(
              modelFile.url,
              object => onLoaded(object),
              undefined,
              error => reportError(error && error.message ? error.message : 'Failed to load the generated FBX model.'),
            );
          }

          function loadObj() {
            const objFile = fileByType('OBJ');
            if (!objFile || !objFile.url) {
              reportError('The generated OBJ file is missing.');
              return;
            }

            const mtlFile = fileByType('MTL');
            const objLoader = new THREE.OBJLoader();
            if (!mtlFile || !mtlFile.url) {
              objLoader.load(
                objFile.url,
                object => onLoaded(object),
                undefined,
                error => reportError(error && error.message ? error.message : 'Failed to load the generated OBJ model.'),
              );
              return;
            }

            const mtlLoader = new THREE.MTLLoader();
            mtlLoader.setResourcePath(basePath(mtlFile.url));
            mtlLoader.load(
              mtlFile.url,
              materials => {
                materials.preload();
                objLoader.setMaterials(materials);
                objLoader.load(
                  objFile.url,
                  object => onLoaded(object),
                  undefined,
                  error => reportError(error && error.message ? error.message : 'Failed to load the generated OBJ model.'),
                );
              },
              undefined,
              error => reportError(error && error.message ? error.message : 'Failed to load the generated material file.'),
            );
          }

          resizeRenderer();
          window.addEventListener('resize', resizeRenderer);

          (function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
          })();

          try {
            if (payload.viewerFormat === 'glb' || payload.viewerFormat === 'gltf') {
              loadGlbLike();
            } else if (payload.viewerFormat === 'obj') {
              loadObj();
            } else if (payload.viewerFormat === 'fbx') {
              loadFbx();
            } else {
              reportError('This 3D file format is not supported for in-app preview.');
            }
          } catch (error) {
            reportError(error && error.message ? error.message : '3D preview failed to initialize.');
          }
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
    return Boolean(job?.viewerFormat && job.viewerFiles.length > 0);
  }, [job]);

  const hasPreviewImage = Boolean(job?.previewImageUrl);

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
    setPreviewErrorMessage(null);

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
        previewImageUrl: null,
        downloadUrl: null,
        fileType: null,
        viewerFormat: null,
        viewerFiles: [],
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
    canPreviewModel && job?.viewerFormat
      ? renderThreePreviewHtml(job.viewerFormat, job.viewerFiles)
      : null;

  const handlePreviewMessage = (rawEventData: string) => {
    try {
      const payload = JSON.parse(rawEventData) as ViewerEvent;
      if (payload.type === 'loaded') {
        setPreviewErrorMessage(null);
        return;
      }

      if (payload.type === 'error') {
        setPreviewErrorMessage(payload.message || '3D preview failed to load.');
      }
    } catch (_error) {
      if (rawEventData) {
        setPreviewErrorMessage(rawEventData);
      }
    }
  };

  const renderPreviewSection = () => {
    if (screenStage !== 'succeeded' || !job) {
      return null;
    }

    const showStaticPreview = Boolean(job.previewImageUrl) && (!previewHtml || Boolean(previewErrorMessage));
    const showInteractivePreview = Boolean(previewHtml && !previewErrorMessage);

    return (
      <View style={styles.previewCard}>
        <Text style={styles.previewTitle}>3D Preview</Text>
        {previewErrorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{previewErrorMessage}</Text>
          </View>
        ) : null}

        {showInteractivePreview ? (
          <View style={styles.webViewWrapper} testID="model-preview">
            <WebView
              testID="model-preview-webview"
              originWhitelist={['http://*', 'https://*', 'about:blank', 'data:*', 'blob:*']}
              source={{
                html: previewHtml ?? '',
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
              onMessage={syntheticEvent => {
                handlePreviewMessage(syntheticEvent.nativeEvent.data);
              }}
              onError={syntheticEvent => {
                const {nativeEvent} = syntheticEvent;
                setPreviewErrorMessage(getErrorMessage(nativeEvent));
              }}
            />
          </View>
        ) : null}

        {showStaticPreview ? (
          <View testID="preview-image-fallback">
            <Image source={{uri: job.previewImageUrl!}} style={styles.previewImage} />
            <Text style={styles.previewHint}>
              Showing the static preview image because this WebView could not render the generated 3D file directly.
            </Text>
          </View>
        ) : null}

        {!showInteractivePreview && !showStaticPreview ? (
          <View style={styles.messageCard}>
            <Text style={styles.messageTitle}>Preview unavailable</Text>
            <Text style={styles.messageBody}>
              3D generation succeeded, but the returned result is not previewable on this device.
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

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

        {renderPreviewSection()}
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
  previewImage: {
    width: '100%',
    height: 360,
    borderRadius: 18,
    resizeMode: 'cover',
    backgroundColor: '#111111',
  },
  previewHint: {
    marginTop: 12,
    color: '#D7D7D7',
    fontSize: 13,
    lineHeight: 18,
  },
});