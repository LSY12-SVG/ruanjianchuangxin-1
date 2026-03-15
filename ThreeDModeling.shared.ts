import {PermissionsAndroid} from 'react-native';
import type {Asset, CameraOptions} from 'react-native-image-picker';

import type {
  CaptureSession,
  ModelAsset,
  ReconstructionTask,
  UploadableImageAsset,
} from './ImageTo3DService';

export type PermissionState = 'unknown' | 'granted' | 'denied' | 'blocked';
export type FlowStage = 'restore' | 'capture' | 'generate' | 'preview';

export type ViewerEvent = {
  type?: 'loaded' | 'error';
  message?: string;
};

export type LocalQualityResult = {
  score: number;
  issues: string[];
  blocking: boolean;
  hint: string | null;
};

export const MAX_POLLING_MS = 10 * 60 * 1000;
export const DEFAULT_POLL_AFTER_MS = 5000;
export const CAMERA_PERMISSION = PermissionsAndroid.PERMISSIONS.CAMERA;
export const cameraOptions: CameraOptions = {
  mediaType: 'photo',
  quality: 1,
  saveToPhotos: false,
  includeBase64: false,
  cameraType: 'back',
  presentationStyle: 'fullScreen',
};

export const ANGLE_LABELS: Record<string, string> = {
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

export const ISSUE_LABELS: Record<string, string> = {
  duplicate_angle: '该角度已采集',
  blurry_risk: '画面可能模糊',
  subject_too_small: '主体距离过远',
  exposure_risk: '曝光可能异常',
  off_center: '主体可能偏离取景框',
};

export function getAngleLabel(angleTag: string | null | undefined): string {
  if (!angleTag) {
    return '当前角度';
  }

  return ANGLE_LABELS[angleTag] || angleTag;
}

export function getTaskStatusMessage(task: ReconstructionTask | null): string {
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

export function getErrorMessage(error: unknown): string {
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

export function toUploadableAsset(asset: Asset): UploadableImageAsset {
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

export function renderThreePreviewHtml(modelAsset: ModelAsset): string {
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
            background: radial-gradient(circle at top, #1d3b5d 0%, #071018 56%, #03060a 100%);
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

export function shouldAllowWebViewRequest(url?: string): boolean {
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

export function evaluateCaptureQuality(
  asset: UploadableImageAsset,
  angleTag: string,
  session: CaptureSession,
): LocalQualityResult {
  const issues: string[] = [];
  let score = 0.92;

  if (session.frames.some(frame => frame.accepted && frame.angleTag === angleTag)) {
    issues.push('duplicate_angle');
    score -= 0.35;
  }

  const width = asset.width ?? 0;
  const height = asset.height ?? 0;
  const fileSize = asset.fileSize ?? 0;

  if (width > 0 && height > 0) {
    const shortestEdge = Math.min(width, height);
    if (shortestEdge < 720) {
      issues.push('subject_too_small');
      score -= 0.16;
    }

    const aspectRatio = width / height;
    if (aspectRatio < 0.65 || aspectRatio > 1.7) {
      issues.push('off_center');
      score -= 0.06;
    }

    const bytesPerPixel = fileSize > 0 ? fileSize / (width * height) : 0;
    if (bytesPerPixel > 0 && bytesPerPixel < 0.03) {
      issues.push('blurry_risk');
      score -= 0.1;
    }
  }

  if (fileSize > 0 && fileSize < 120000) {
    issues.push('exposure_risk');
    score -= 0.08;
  }

  const hint =
    issues.length > 0
      ? `已继续上传 ${getAngleLabel(angleTag)}，质量提示：${issues
          .map(issue => ISSUE_LABELS[issue] || issue)
          .join('、')}`
      : null;

  return {
    score: Math.max(0, Math.min(1, Number(score.toFixed(2)))),
    issues: [...new Set(issues)],
    blocking: false,
    hint,
  };
}

export function resolveFlowStage(
  bootstrapping: boolean,
  task: ReconstructionTask | null,
  modelAsset: ModelAsset | null,
): FlowStage {
  if (bootstrapping) {
    return 'restore';
  }

  if (modelAsset || task?.status === 'succeeded') {
    return 'preview';
  }

  if (task) {
    return 'generate';
  }

  return 'capture';
}
