import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRMExpressionPresetName } from './vendor/three-vrm.module.js';

const root = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
root.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, window.innerWidth / window.innerHeight, 0.01, 100);
const cameraTarget = new THREE.Vector3(0, 0.92, 0);
let cameraDistance = 1.55;
camera.position.set(0, cameraTarget.y, cameraDistance);
camera.lookAt(cameraTarget);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.06);
keyLight.position.set(0.5, 1.2, 1.0);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xbad4ff, 0.65);
fillLight.position.set(-0.8, 1.0, 0.2);
scene.add(fillLight);

scene.add(new THREE.AmbientLight(0xcfe2ff, 0.46));

let currentVrm = null;
let currentState = 'idle';

const clock = new THREE.Clock();

const motionConfigByState = {
  idle: { breathe: 0.008, sway: 0.04, blink: 1.0, pace: 1.0 },
  remind: { breathe: 0.01, sway: 0.06, blink: 1.0, pace: 1.1 },
  focus: { breathe: 0.007, sway: 0.03, blink: 0.8, pace: 0.9 },
  thinking: { breathe: 0.005, sway: 0.015, blink: 0.5, pace: 0.75 },
  talking: { breathe: 0.009, sway: 0.05, blink: 0.9, pace: 1.2 },
  success: { breathe: 0.011, sway: 0.07, blink: 1.0, pace: 1.25 },
  sleep: { breathe: 0.003, sway: 0.008, blink: 0.25, pace: 0.55 },
};

const postToReactNative = payload => {
  try {
    if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  } catch (_) {
    // noop
  }
};

const emitLoaded = () => postToReactNative({ type: 'loaded' });
const emitTap = () => postToReactNative({ type: 'tap' });
const emitError = message => postToReactNative({ type: 'error', message: String(message || 'unknown') });

const frameCameraToVrm = vrm => {
  const box = new THREE.Box3().setFromObject(vrm.scene);
  if (!Number.isFinite(box.min.x) || !Number.isFinite(box.min.y) || !Number.isFinite(box.min.z)) {
    return;
  }
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  cameraTarget.set(center.x, center.y + size.y * 0.18, center.z);
  cameraDistance = Math.max(
    0.95,
    (size.y * 0.62) / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)),
  );
  camera.position.set(center.x, cameraTarget.y, center.z + cameraDistance);
  camera.lookAt(cameraTarget);
};

const resolveModelUri = () => {
  const params = new URLSearchParams(window.location.search || '');
  const model = params.get('model');
  if (!model) {
    return './models/Avatar01_Neutral.vrm';
  }
  try {
    return decodeURIComponent(model);
  } catch (_) {
    return model;
  }
};

const resolveBasePath = uri => {
  const normalized = String(uri || '').split('?')[0];
  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex === -1) {
    return './';
  }
  return normalized.slice(0, slashIndex + 1);
};

const loadArrayBufferByXhr = uri =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', uri, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => {
      const status = Number(xhr.status || 0);
      if ((status >= 200 && status < 300) || status === 0) {
        resolve(xhr.response);
        return;
      }
      reject(new Error(`xhr_status_${status}`));
    };
    xhr.onerror = () => {
      reject(new Error('xhr_network_error'));
    };
    xhr.send();
  });

const loadModel = async () => {
  const loader = new GLTFLoader();
  loader.register(parser => new VRMLoaderPlugin(parser));

  const uri = resolveModelUri();
  try {
    const buffer = await loadArrayBufferByXhr(uri);
    loader.parse(
      buffer,
      resolveBasePath(uri),
      gltf => {
        const vrm = gltf.userData.vrm;
        if (!vrm) {
          emitError('vrm_not_found');
          return;
        }

      VRMUtils.rotateVRM0(vrm);
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.removeUnnecessaryJoints(gltf.scene);

      vrm.scene.position.set(0, -0.22, 0);
        vrm.scene.traverse(object => {
          object.frustumCulled = false;
        });
        scene.add(vrm.scene);
        frameCameraToVrm(vrm);
        currentVrm = vrm;
        emitLoaded();
      },
      error => {
        emitError(error?.message || 'parse_failed');
      },
    );
  } catch (error) {
    emitError(error?.message || 'load_failed');
  }
};

const onStateMessage = raw => {
  if (typeof raw !== 'string' || !raw.trim()) {
    return;
  }
  try {
    const payload = JSON.parse(raw);
    if (payload?.type === 'state' && typeof payload.state === 'string' && motionConfigByState[payload.state]) {
      currentState = payload.state;
    }
  } catch (_) {
    // ignore malformed payload
  }
};

window.addEventListener('message', event => onStateMessage(event.data));
document.addEventListener('message', event => onStateMessage(event.data));
renderer.domElement.addEventListener('click', emitTap);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  camera.position.set(cameraTarget.x, cameraTarget.y, cameraTarget.z + cameraDistance);
  camera.lookAt(cameraTarget);
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const animate = () => {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;

  if (currentVrm) {
    const motion = motionConfigByState[currentState] || motionConfigByState.idle;
    currentVrm.update(delta);

    currentVrm.scene.position.y = -0.22 + Math.sin(elapsed * 1.2 * motion.pace) * motion.breathe;
    currentVrm.scene.rotation.y = Math.sin(elapsed * 0.6 * motion.pace) * motion.sway;

    if (currentVrm.expressionManager) {
      const blinkWave = (Math.sin(elapsed * 2.6 * motion.pace) + 1) / 2;
      const blinkValue = blinkWave > 0.93 ? (blinkWave - 0.93) / 0.07 : 0;
      currentVrm.expressionManager.setValue(VRMExpressionPresetName.Blink, blinkValue * motion.blink);

      const mouthWave = (Math.sin(elapsed * 7.8) + 1) / 2;
      const mouthOpen = currentState === 'talking' ? mouthWave * 0.22 : 0;
      currentVrm.expressionManager.setValue(VRMExpressionPresetName.Aa, mouthOpen);
    }

    if (currentVrm.lookAt) {
      const lookTarget = new THREE.Euler(0, Math.sin(elapsed * 0.4) * 0.14, 0);
      currentVrm.lookAt.applier?.applyYawPitch(lookTarget.y, lookTarget.x);
    }
  }

  renderer.render(scene, camera);
};

loadModel().catch(error => emitError(error?.message || 'bootstrap_failed'));
animate();
