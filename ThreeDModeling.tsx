
import React, {useEffect, useRef, useState} from 'react';
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
import type {Asset, CameraOptions} from 'react-native-image-picker';
import {launchCamera} from 'react-native-image-picker';
import {WebView} from 'react-native-webview';

import {
  createCaptureSession,
  generateCaptureSession,
  getCaptureSession,
  getModelAsset,
  getReconstructionTask,
  isTerminalJobStatus,
  uploadCaptureFrame,
  type CaptureFrame,
  type CaptureSession,
  type ModelAsset,
  type ReconstructionTask,
  type UploadableImageAsset,
} from './ImageTo3DService';
import {
  getThreeDModelingSession,
  resetThreeDModelingSession,
  setThreeDModelingSession,
} from './ThreeDModelingSession';

type PermissionState = 'unknown' | 'granted' | 'denied' | 'blocked';

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

type LocalQualityResult = {
  score: number;
  issues: string[];
  blocking: boolean;
  hint: string | null;
};

const MAX_POLLING_MS = 10 * 60 * 1000;
const DEFAULT_POLL_AFTER_MS = 5000;
const CAMERA_PERMISSION = PermissionsAndroid.PERMISSIONS.CAMERA;
const cameraOptions: CameraOptions = {
  mediaType: 'photo',
  quality: 1,
  saveToPhotos: false,
  includeBase64: false,
  cameraType: 'back',
  presentationStyle: 'fullScreen',
};

const ANGLE_LABELS: Record<string, string> = {
  front: '正前方',
  front_right: '前右侧',
  right: '右侧',
  back_right: '后右侧',
  back: '正后方',
  back_left: '后左侧',
  left: '左侧',
  front_left: '前左侧',
  front_upper_right: '右前上方',
  back_upper_right: '右后上方',
  back_upper_left: '左后上方',
  front_upper_left: '左前上方',
  top_front: '顶部前侧',
  top_back: '顶部后侧',
};

const ISSUE_LABELS: Record<string, string> = {
  duplicate_angle: '该角度已采集',
  blurry_risk: '画面可能模糊',
  subject_too_small: '主体距离过远',
  exposure_risk: '曝光可能异常',
  off_center: '主体可能偏离取景框',
};

function getAngleLabel(angleTag: string | null | undefined): string {
  if (!angleTag) {
    return '当前角度';
  }

  return ANGLE_LABELS[angleTag] || angleTag;
}

function getTaskStatusMessage(task: ReconstructionTask | null): string {
  if (!task) {
    return '';
  }

  switch (task.status) {
    case 'queued':
      return '素材已提交，正在进入 Tripo 队列。';
    case 'processing':
      return 'Tripo 正在生成 3D 模型，请稍候。';
    case 'succeeded':
      return '3D 模型已生成完成。';
    case 'failed':
      return task.message || '3D 生成失败。';
    case 'expired':
      return '模型资源已过期，请重新生成。';
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

    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') {
        return serialized;
      }
    } catch (_serializationError) {
    }
  }

  return '发生了意外错误，请稍后重试。';
}

function toUploadableAsset(asset: Asset): UploadableImageAsset {
  return {
    uri: asset.uri ?? '',
    type: asset.type ?? 'image/jpeg',
    fileName: asset.fileName ?? `capture-${Date.now()}.jpg`,
    fileSize: asset.fileSize,
    width: asset.width,
    height: asset.height,
  };
}

function serializeForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function renderThreePreviewHtml(modelAsset: ModelAsset): string {
  const serializedPayload = serializeForHtml({
    viewerFormat: modelAsset.viewerFormat,
    viewerFiles: modelAsset.viewerFiles,
    defaultCamera: modelAsset.defaultCamera,
    autoRotateSpeed: modelAsset.autoRotateSpeed,
    thumbnailUrl: modelAsset.thumbnailUrl,
  });

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <style>
          html, body {
            margin: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: radial-gradient(circle at top, #1b2d4b 0%, #081018 58%, #05070c 100%);
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
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
            background: rgba(3, 8, 18, 0.74);
            color: #ffffff;
            font-size: 13px;
            line-height: 1.5;
          }
          #status[data-hidden="true"] {
            display: none;
          }
          #toolbar {
            position: absolute;
            top: 12px;
            right: 12px;
            display: flex;
            gap: 8px;
          }
          .tool-button {
            border: 0;
            border-radius: 999px;
            padding: 10px 14px;
            background: rgba(7, 19, 34, 0.72);
            color: white;
            font-size: 12px;
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
          <div id="toolbar">
            <button class="tool-button" id="toggle-rotate">暂停转动</button>
            <button class="tool-button" id="reset-view">重置视角</button>
          </div>
          <div id="status">正在加载 3D 演示视图...</div>
        </div>
        <script>
          const payload = ${serializedPayload};
          const statusNode = document.getElementById('status');
          const canvas = document.getElementById('canvas');
          const toggleRotateButton = document.getElementById('toggle-rotate');
          const resetViewButton = document.getElementById('reset-view');
          const scene = new THREE.Scene();
          scene.background = new THREE.Color(0x071019);

          const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

          const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
          const defaultCamera = payload.defaultCamera || {};
          const defaultPosition = defaultCamera.position || { x: 2.2, y: 1.6, z: 2.2 };
          const defaultTarget = defaultCamera.target || { x: 0, y: 0, z: 0 };
          camera.position.set(defaultPosition.x, defaultPosition.y, defaultPosition.z);

          const controls = new THREE.OrbitControls(camera, renderer.domElement);
          controls.enableDamping = true;
          controls.autoRotate = false;
          controls.autoRotateSpeed = payload.autoRotateSpeed || 0.85;
          controls.target.set(defaultTarget.x, defaultTarget.y, defaultTarget.z);

          scene.add(new THREE.AmbientLight(0xffffff, 1.25));
          const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
          keyLight.position.set(4, 6, 8);
          scene.add(keyLight);
          const fillLight = new THREE.DirectionalLight(0x8fb9ff, 0.55);
          fillLight.position.set(-5, 4, -3);
          scene.add(fillLight);
          const rimLight = new THREE.DirectionalLight(0xffd48f, 0.35);
          rimLight.position.set(2, 1, -5);
          scene.add(rimLight);
          const floor = new THREE.Mesh(
            new THREE.CircleGeometry(4, 64),
            new THREE.MeshPhongMaterial({ color: 0x152231, transparent: true, opacity: 0.6 })
          );
          floor.rotation.x = -Math.PI / 2;
          floor.position.y = -1.1;
          scene.add(floor);

          let autoRotatePaused = false;
          let idleHandle = null;

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
            statusNode.style.background = isError ? 'rgba(92, 18, 20, 0.88)' : 'rgba(3, 8, 18, 0.74)';
          }

          function clearStatus() {
            if (statusNode) {
              statusNode.dataset.hidden = 'true';
            }
          }

          function scheduleAutoRotate() {
            if (idleHandle) {
              clearTimeout(idleHandle);
            }
            if (autoRotatePaused) {
              controls.autoRotate = false;
              return;
            }
            controls.autoRotate = false;
            idleHandle = setTimeout(() => {
              controls.autoRotate = true;
            }, 2000);
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
            camera.position.set(maxDimension * 1.65, maxDimension * 1.2, maxDimension * 1.65);
            controls.target.set(0, 0, 0);
            controls.update();
          }

          function reportError(message) {
            const safeMessage = message || '3D 视图加载失败。';
            setStatus(safeMessage, true);
            postMessage('error', safeMessage);
          }

          function onLoaded(object) {
            scene.add(object);
            frameObject(object);
            scheduleAutoRotate();
            clearStatus();
            postMessage('loaded', '3D preview ready.');
          }

          function resetView() {
            camera.position.set(defaultPosition.x, defaultPosition.y, defaultPosition.z);
            controls.target.set(defaultTarget.x, defaultTarget.y, defaultTarget.z);
            controls.update();
            scheduleAutoRotate();
          }

          function loadGlbLike() {
            const modelFile = fileByType(payload.viewerFormat === 'gltf' ? 'GLTF' : 'GLB');
            if (!modelFile || !modelFile.url) {
              reportError('生成结果中没有可用的 GLB 文件。');
              return;
            }

            const loader = new THREE.GLTFLoader();
            loader.load(
              modelFile.url,
              gltf => onLoaded(gltf.scene),
              event => {
                if (event && event.total) {
                  const progress = Math.min(99, Math.round((event.loaded / event.total) * 100));
                  setStatus('正在加载模型 ' + progress + '%', false);
                }
              },
              error => reportError(error && error.message ? error.message : 'GLB 模型加载失败。')
            );
          }

          function loadFbx() {
            const modelFile = fileByType('FBX');
            if (!modelFile || !modelFile.url) {
              reportError('生成结果中没有可用的 FBX 文件。');
              return;
            }

            const loader = new THREE.FBXLoader();
            loader.load(modelFile.url, onLoaded, undefined, error => {
              reportError(error && error.message ? error.message : 'FBX 模型加载失败。');
            });
          }

          function loadObj() {
            const objFile = fileByType('OBJ');
            if (!objFile || !objFile.url) {
              reportError('生成结果中没有可用的 OBJ 文件。');
              return;
            }

            const mtlFile = fileByType('MTL');
            const objLoader = new THREE.OBJLoader();
            if (!mtlFile || !mtlFile.url) {
              objLoader.load(objFile.url, onLoaded, undefined, error => {
                reportError(error && error.message ? error.message : 'OBJ 模型加载失败。');
              });
              return;
            }

            const mtlLoader = new THREE.MTLLoader();
            mtlLoader.setResourcePath(basePath(mtlFile.url));
            mtlLoader.load(
              mtlFile.url,
              materials => {
                materials.preload();
                objLoader.setMaterials(materials);
                objLoader.load(objFile.url, onLoaded, undefined, error => {
                  reportError(error && error.message ? error.message : 'OBJ 模型加载失败。');
                });
              },
              undefined,
              error => reportError(error && error.message ? error.message : 'MTL 材质加载失败。')
            );
          }

          resizeRenderer();
          window.addEventListener('resize', resizeRenderer);
          renderer.domElement.addEventListener('pointerdown', scheduleAutoRotate);
          renderer.domElement.addEventListener('wheel', scheduleAutoRotate, { passive: true });
          controls.addEventListener('change', scheduleAutoRotate);
          toggleRotateButton.addEventListener('click', () => {
            autoRotatePaused = !autoRotatePaused;
            toggleRotateButton.textContent = autoRotatePaused ? '开启转动' : '暂停转动';
            scheduleAutoRotate();
          });
          resetViewButton.addEventListener('click', resetView);

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
              reportError('当前结果格式暂不支持交互式预览。');
            }
          } catch (error) {
            reportError(error && error.message ? error.message : '3D 视图初始化失败。');
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

function evaluateCaptureQuality(
  asset: UploadableImageAsset,
  angleTag: string,
  session: CaptureSession,
): LocalQualityResult {
  const issues: string[] = [];
  let score = 0.96;

  if (session.frames.some(frame => frame.accepted && frame.angleTag === angleTag)) {
    issues.push('duplicate_angle');
    score -= 0.45;
  }

  const width = asset.width ?? 0;
  const height = asset.height ?? 0;
  const fileSize = asset.fileSize ?? 0;

  if (width > 0 && height > 0) {
    const shortestEdge = Math.min(width, height);
    if (shortestEdge < 1080) {
      issues.push('subject_too_small');
      score -= 0.28;
    }

    const aspectRatio = width / height;
    if (aspectRatio < 0.75 || aspectRatio > 1.5) {
      issues.push('off_center');
      score -= 0.1;
    }

    const bytesPerPixel = fileSize > 0 ? fileSize / (width * height) : 0;
    if (bytesPerPixel > 0 && bytesPerPixel < 0.08) {
      issues.push('blurry_risk');
      score -= 0.24;
    }
  }

  if (fileSize > 0 && fileSize < 180000) {
    issues.push('exposure_risk');
    score -= 0.16;
  }

  const blocking =
    issues.includes('duplicate_angle') ||
    issues.includes('blurry_risk') ||
    issues.includes('subject_too_small') ||
    score < 0.58;

  const hint = blocking
    ? `建议重拍 ${getAngleLabel(angleTag)}，${issues
        .map(issue => ISSUE_LABELS[issue] || issue)
        .join('、')}`
    : null;

  return {
    score: Math.max(0, Math.min(1, Number(score.toFixed(2)))),
    issues: [...new Set(issues)],
    blocking,
    hint,
  };
}

export default function ThreeDModeling({navigation, onBack}: Props) {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [permissionState, setPermissionState] =
    useState<PermissionState>('unknown');
  const [captureSession, setCaptureSession] = useState<CaptureSession | null>(null);
  const [task, setTask] = useState<ReconstructionTask | null>(null);
  const [modelAsset, setModelAsset] = useState<ModelAsset | null>(null);
  const [localFrameUris, setLocalFrameUris] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [viewerErrorMessage, setViewerErrorMessage] = useState<string | null>(null);

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollDeadlineRef = useRef<number>(0);

  useEffect(() => {
    void initializeSession();

    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  const currentAngleTag =
    captureSession?.suggestedAngleTag || captureSession?.missingAngleTags?.[0] || 'front';
  const canGenerate =
    Boolean(captureSession) &&
    (captureSession?.acceptedFrameCount ?? 0) >= (captureSession?.minimumFrameCount ?? Infinity) &&
    !generateBusy &&
    !(task && !isTerminalJobStatus(task.status));

  async function initializeSession() {
    setBootstrapping(true);
    setErrorMessage(null);

    const persisted = getThreeDModelingSession();
    try {
      if (persisted.captureSessionId) {
        const restoredSession = await getCaptureSession(persisted.captureSessionId);
        setCaptureSession(restoredSession);
        setLocalFrameUris(persisted.localFrameUris || {});
        setStatusMessage(restoredSession.statusHint || '继续你的多视角采集。');

        const restoredTaskId =
          persisted.reconstructionTaskId || restoredSession.taskId || null;
        if (restoredTaskId) {
          const restoredTask = await getReconstructionTask(restoredTaskId);
          setTask(restoredTask);
          setStatusMessage(getTaskStatusMessage(restoredTask));
          if (restoredTask.modelId) {
            const restoredModel = await getModelAsset(restoredTask.modelId);
            setModelAsset(restoredModel);
          }
        }
      } else {
        const nextSession = await createCaptureSession();
        setCaptureSession(nextSession);
        setStatusMessage(nextSession.statusHint || '按提示依次拍摄 14 个视角。');
        setThreeDModelingSession({
          captureSessionId: nextSession.id,
          reconstructionTaskId: null,
          modelId: null,
          localFrameUris: {},
        });
      }
    } catch (error) {
      resetThreeDModelingSession();
      try {
        const nextSession = await createCaptureSession();
        setCaptureSession(nextSession);
        setStatusMessage(nextSession.statusHint || '按提示依次拍摄 14 个视角。');
        setThreeDModelingSession({
          captureSessionId: nextSession.id,
          reconstructionTaskId: null,
          modelId: null,
          localFrameUris: {},
        });
      } catch (sessionError) {
        setErrorMessage(getErrorMessage(sessionError || error));
      }
    } finally {
      setBootstrapping(false);
    }
  }

  function clearPolling() {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }

  async function fetchModel(modelId: string) {
    const nextModel = await getModelAsset(modelId);
    setModelAsset(nextModel);
    setViewerErrorMessage(null);
    setThreeDModelingSession({modelId: modelId});
  }

  async function applyTask(nextTask: ReconstructionTask) {
    setTask(nextTask);
    setStatusMessage(getTaskStatusMessage(nextTask));
    setThreeDModelingSession({
      reconstructionTaskId: nextTask.taskId,
      modelId: nextTask.modelId,
    });

    if (nextTask.sessionId) {
      try {
        const refreshedSession = await getCaptureSession(nextTask.sessionId);
        setCaptureSession(refreshedSession);
      } catch (_error) {
      }
    }

    if (nextTask.status === 'succeeded' && nextTask.modelId) {
      await fetchModel(nextTask.modelId);
      return;
    }

    if (nextTask.status === 'failed' || nextTask.status === 'expired') {
      setErrorMessage(nextTask.message || getTaskStatusMessage(nextTask));
    }
  }

  function pollTaskStatus(taskId: string, pollAfterMs: number) {
    clearPolling();

    pollTimeoutRef.current = setTimeout(async () => {
      try {
        const latestTask = await getReconstructionTask(taskId);
        await applyTask(latestTask);

        if (!isTerminalJobStatus(latestTask.status)) {
          if (Date.now() >= pollDeadlineRef.current) {
            setErrorMessage('3D 生成超时，请稍后重试。');
            return;
          }

          pollTaskStatus(taskId, DEFAULT_POLL_AFTER_MS);
        }
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      }
    }, pollAfterMs);
  }

  async function requestCameraPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      setPermissionState('granted');
      return true;
    }

    const hasPermission = await PermissionsAndroid.check(CAMERA_PERMISSION);
    if (hasPermission) {
      setPermissionState('granted');
      return true;
    }

    const result = await PermissionsAndroid.request(CAMERA_PERMISSION, {
      title: '需要相机权限',
      message: 'Vision Genie 需要相机权限来拍摄手工艺品原型。',
      buttonPositive: '允许',
      buttonNegative: '拒绝',
    });

    if (result === PermissionsAndroid.RESULTS.GRANTED) {
      setPermissionState('granted');
      return true;
    }

    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      setPermissionState('blocked');
      setErrorMessage('相机权限已被永久拒绝，请在系统设置中手动开启。');
      return false;
    }

    setPermissionState('denied');
    setErrorMessage('需要相机权限后才能开始多视角采集。');
    return false;
  }

  async function handleCaptureFrame() {
    if (!captureSession) {
      return;
    }

    setErrorMessage(null);
    setReviewMessage(null);

    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      return;
    }

    const result = await launchCamera(cameraOptions);
    if (result.didCancel) {
      return;
    }

    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
      return;
    }

    const asset = result.assets?.[0];
    if (!asset?.uri) {
      setErrorMessage('本次拍摄没有返回有效图片。');
      return;
    }

    const uploadableAsset = toUploadableAsset(asset);
    const quality = evaluateCaptureQuality(uploadableAsset, currentAngleTag, captureSession);
    if (quality.blocking) {
      setReviewMessage(quality.hint || '本次拍摄质量不足，建议重拍。');
      return;
    }

    setCaptureBusy(true);
    try {
      const response = await uploadCaptureFrame(captureSession.id, uploadableAsset, {
        angleTag: currentAngleTag,
        width: uploadableAsset.width,
        height: uploadableAsset.height,
        fileSize: uploadableAsset.fileSize,
      });

      const nextLocalFrameUris = {
        ...localFrameUris,
        [response.frame.id]: uploadableAsset.uri,
      };

      setCaptureSession(response.session);
      setLocalFrameUris(nextLocalFrameUris);
      setStatusMessage(response.session.statusHint || '继续按提示拍摄剩余角度。');
      setReviewMessage(
        response.frame.accepted
          ? `已接收 ${getAngleLabel(response.frame.angleTag)} 视角，质量分 ${Math.round(
              response.frame.qualityScore * 100,
            )}。`
          : `已记录，但建议重拍 ${getAngleLabel(response.frame.angleTag)}。`,
      );
      setThreeDModelingSession({
        captureSessionId: response.session.id,
        localFrameUris: nextLocalFrameUris,
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setCaptureBusy(false);
    }
  }

  async function handleGenerate() {
    if (!captureSession || !canGenerate) {
      return;
    }

    clearPolling();
    setErrorMessage(null);
    setViewerErrorMessage(null);
    setGenerateBusy(true);

    try {
      const createdTask = await generateCaptureSession(captureSession.id);
      const initialTask = await getReconstructionTask(createdTask.taskId);
      pollDeadlineRef.current = Date.now() + MAX_POLLING_MS;
      await applyTask(initialTask);

      if (!isTerminalJobStatus(initialTask.status)) {
        pollTaskStatus(initialTask.taskId, createdTask.pollAfterMs ?? DEFAULT_POLL_AFTER_MS);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setGenerateBusy(false);
    }
  }

  async function handleStartOver() {
    clearPolling();
    resetThreeDModelingSession();
    setCaptureSession(null);
    setTask(null);
    setModelAsset(null);
    setLocalFrameUris({});
    setStatusMessage('');
    setErrorMessage(null);
    setReviewMessage(null);
    setViewerErrorMessage(null);
    await initializeSession();
  }

  const previewHtml = modelAsset ? renderThreePreviewHtml(modelAsset) : null;

  function handlePreviewMessage(rawEventData: string) {
    try {
      const payload = JSON.parse(rawEventData) as ViewerEvent;
      if (payload.type === 'loaded') {
        setViewerErrorMessage(null);
        return;
      }

      if (payload.type === 'error') {
        setViewerErrorMessage(payload.message || '3D 视图加载失败。');
      }
    } catch (_error) {
      if (rawEventData) {
        setViewerErrorMessage(rawEventData);
      }
    }
  }

  function renderFrameItem(frame: CaptureFrame, index: number) {
    const imageSource = localFrameUris[frame.id]
      ? {uri: localFrameUris[frame.id]}
      : frame.imageUrl
        ? {uri: frame.imageUrl}
        : null;

    return (
      <View key={frame.id} style={styles.frameChip}>
        <View style={[styles.frameThumbnail, !imageSource && styles.frameThumbnailPlaceholder]}>
          {imageSource ? <Image source={imageSource} style={styles.frameThumbnailImage} /> : null}
        </View>
        <View style={styles.frameMeta}>
          <Text style={styles.frameTitle}>{`${index + 1}. ${getAngleLabel(frame.angleTag)}`}</Text>
          <Text style={styles.frameSubtitle}>
            {frame.accepted ? '已通过' : '建议重拍'} · {Math.round(frame.qualityScore * 100)} 分
          </Text>
          {frame.qualityIssues.length > 0 ? (
            <Text style={styles.frameIssues}>
              {frame.qualityIssues.map(issue => ISSUE_LABELS[issue] || issue).join('、')}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

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
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>AGI 相机 3D 建模</Text>
            <Text style={styles.headerSubtitle}>拍摄手工艺品原型，实时生成可交互 360° 演示</Text>
          </View>
        </View>

        {bootstrapping ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#6FE7FF" />
            <Text style={styles.loadingCardText}>正在恢复拍摄会话...</Text>
          </View>
        ) : null}

        {captureSession ? (
          <View style={styles.heroCard} testID="capture-guide-card">
            <View style={styles.heroHeaderRow}>
              <View>
                <Text style={styles.heroEyebrow}>当前建议角度</Text>
                <Text style={styles.heroAngle}>{getAngleLabel(currentAngleTag)}</Text>
              </View>
              <View style={styles.progressRing}>
                <Text style={styles.progressCount}>{captureSession.acceptedFrameCount}</Text>
                <Text style={styles.progressTotal}>/ {captureSession.targetFrameCount}</Text>
              </View>
            </View>

            <View style={styles.cameraFrame}>
              <View style={styles.cameraOuterBorder} />
              <View style={styles.cameraCenterDot} />
              <Text style={styles.cameraHint}>将手工艺品放入取景框中央，保持背景尽量干净</Text>
            </View>

            <Text style={styles.statusHint}>{captureSession.statusHint}</Text>

            <View style={styles.angleRow}>
              {Object.keys(ANGLE_LABELS).map(angleTag => {
                const captured = captureSession.frames.some(
                  frame => frame.accepted && frame.angleTag === angleTag,
                );
                const active = currentAngleTag === angleTag;

                return (
                  <View
                    key={angleTag}
                    style={[
                      styles.angleBadge,
                      captured && styles.angleBadgeComplete,
                      active && styles.angleBadgeActive,
                    ]}>
                    <Text
                      style={[
                        styles.angleBadgeText,
                        captured && styles.angleBadgeTextComplete,
                        active && styles.angleBadgeTextActive,
                      ]}>
                      {getAngleLabel(angleTag)}
                    </Text>
                  </View>
                );
              })}
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.9}
              onPress={handleCaptureFrame}
              disabled={captureBusy || bootstrapping}
              style={[styles.captureButton, captureBusy && styles.buttonDisabled]}
              testID="capture-button">
              <Text style={styles.captureButtonText}>
                {captureBusy ? '上传当前视角...' : `拍摄 ${getAngleLabel(currentAngleTag)}`}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {statusMessage ? (
          <View style={styles.messageCard}>
            <Text style={styles.messageBody}>{statusMessage}</Text>
          </View>
        ) : null}

        {reviewMessage ? (
          <View style={styles.reviewCard}>
            <Text style={styles.reviewText}>{reviewMessage}</Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {captureSession ? (
          <View style={styles.captureSummaryCard}>
            <Text style={styles.sectionTitle}>拍摄进度</Text>
            <Text style={styles.summaryText}>
              已通过 {captureSession.acceptedFrameCount} / {captureSession.targetFrameCount} 张，
              至少需要 {captureSession.minimumFrameCount} 张才能开始生成。
            </Text>
            {permissionState !== 'granted' && permissionState !== 'unknown' ? (
              <Text style={styles.summaryText}>当前未授权相机权限，请先允许访问后再继续。</Text>
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{disabled: !canGenerate}}
              disabled={!canGenerate}
              onPress={handleGenerate}
              style={[styles.generateButton, !canGenerate && styles.buttonDisabled]}
              testID="generate-button">
              <Text style={styles.generateButtonText}>
                {generateBusy || (task && !isTerminalJobStatus(task.status))
                  ? '正在生成 3D 模型...'
                  : '开始生成 3D 演示'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {captureSession?.frames?.length ? (
          <View style={styles.frameListCard}>
            <Text style={styles.sectionTitle}>已采集视角</Text>
            {captureSession.frames.map(renderFrameItem)}
          </View>
        ) : null}

        {modelAsset ? (
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={styles.sectionTitle}>360° 3D 演示</Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={handleStartOver}
                style={styles.restartButton}
                testID="restart-button">
                <Text style={styles.restartButtonText}>重新拍摄</Text>
              </TouchableOpacity>
            </View>

            {viewerErrorMessage ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{viewerErrorMessage}</Text>
              </View>
            ) : null}

            {previewHtml ? (
              <View style={styles.webViewWrapper} testID="model-preview">
                <WebView
                  testID="model-preview-webview"
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
                  onMessage={syntheticEvent => {
                    handlePreviewMessage(syntheticEvent.nativeEvent.data);
                  }}
                  onError={syntheticEvent => {
                    setViewerErrorMessage(getErrorMessage(syntheticEvent.nativeEvent));
                  }}
                />
              </View>
            ) : null}

            {modelAsset.thumbnailUrl && viewerErrorMessage ? (
              <Image source={{uri: modelAsset.thumbnailUrl}} style={styles.previewImage} />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#071019',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 36,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  backButton: {
    marginRight: 12,
    paddingVertical: 8,
    paddingRight: 8,
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 34,
    lineHeight: 36,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#A8BDCC',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  loadingCard: {
    borderRadius: 24,
    backgroundColor: '#0E1A26',
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  loadingCardText: {
    color: '#DDEAF3',
    fontSize: 14,
  },
  heroCard: {
    borderRadius: 28,
    padding: 20,
    backgroundColor: '#102131',
    marginBottom: 18,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  heroEyebrow: {
    color: '#6FE7FF',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroAngle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '700',
    marginTop: 4,
  },
  progressRing: {
    minWidth: 82,
    minHeight: 82,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: '#6FE7FF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(111,231,255,0.08)',
  },
  progressCount: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
  },
  progressTotal: {
    color: '#9FC0D3',
    fontSize: 12,
  },
  cameraFrame: {
    height: 320,
    borderRadius: 26,
    backgroundColor: '#07131D',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  cameraOuterBorder: {
    position: 'absolute',
    width: '72%',
    height: '72%',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.78)',
  },
  cameraCenterDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#6FE7FF',
  },
  cameraHint: {
    position: 'absolute',
    bottom: 18,
    left: 18,
    right: 18,
    color: '#D2E3EE',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  statusHint: {
    color: '#D7E5EE',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 16,
  },
  angleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  angleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#173043',
  },
  angleBadgeComplete: {
    backgroundColor: '#1E6A57',
  },
  angleBadgeActive: {
    backgroundColor: '#255B91',
  },
  angleBadgeText: {
    color: '#A9C6D6',
    fontSize: 12,
  },
  angleBadgeTextComplete: {
    color: '#DDFBF0',
  },
  angleBadgeTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  captureButton: {
    marginTop: 18,
    minHeight: 58,
    borderRadius: 999,
    backgroundColor: '#6FE7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonText: {
    color: '#071019',
    fontSize: 17,
    fontWeight: '700',
  },
  messageCard: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#11202D',
  },
  messageBody: {
    color: '#D9E7F0',
    fontSize: 14,
    lineHeight: 20,
  },
  reviewCard: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#16281C',
  },
  reviewText: {
    color: '#DDF5E3',
    fontSize: 14,
    lineHeight: 20,
  },
  errorCard: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#34181B',
  },
  errorText: {
    color: '#FFC7CB',
    fontSize: 14,
    lineHeight: 20,
  },
  captureSummaryCard: {
    borderRadius: 24,
    backgroundColor: '#0E1A26',
    padding: 18,
    marginBottom: 18,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  summaryText: {
    color: '#B7CDD9',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  generateButton: {
    marginTop: 16,
    minHeight: 60,
    borderRadius: 999,
    backgroundColor: '#1F8CFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  frameListCard: {
    borderRadius: 24,
    backgroundColor: '#0E1A26',
    padding: 18,
    marginBottom: 18,
  },
  frameChip: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  frameThumbnail: {
    width: 74,
    height: 74,
    borderRadius: 18,
    backgroundColor: '#163041',
    overflow: 'hidden',
  },
  frameThumbnailPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  frameThumbnailImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  frameMeta: {
    flex: 1,
  },
  frameTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  frameSubtitle: {
    color: '#9EC0D2',
    fontSize: 13,
    marginTop: 4,
  },
  frameIssues: {
    color: '#7FA3B6',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  previewCard: {
    borderRadius: 24,
    backgroundColor: '#0E1A26',
    padding: 18,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  restartButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#173043',
  },
  restartButtonText: {
    color: '#D8EEF8',
    fontSize: 13,
    fontWeight: '600',
  },
  webViewWrapper: {
    height: 380,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#071019',
  },
  previewImage: {
    width: '100%',
    height: 360,
    borderRadius: 18,
    resizeMode: 'cover',
    backgroundColor: '#071019',
  },
});


