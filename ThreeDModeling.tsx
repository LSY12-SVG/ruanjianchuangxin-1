import React, {useEffect, useRef, useState} from 'react';
import {PermissionsAndroid, Platform} from 'react-native';
import {launchCamera} from 'react-native-image-picker';

import {
  createCaptureSession,
  generateCaptureSession,
  getCaptureSession,
  getModelAsset,
  getReconstructionTask,
  isTerminalJobStatus,
  uploadCaptureFrame,
  type CaptureSession,
  type ModelAsset,
  type ReconstructionTask,
} from './ImageTo3DService';
import {
  getThreeDModelingSession,
  resetThreeDModelingSession,
  setThreeDModelingSession,
} from './ThreeDModelingSession';
import ThreeDModelingView from './ThreeDModelingView';
import {
  CAMERA_PERMISSION,
  DEFAULT_POLL_AFTER_MS,
  MAX_POLLING_MS,
  cameraOptions,
  evaluateCaptureQuality,
  getAngleLabel,
  getErrorMessage,
  renderThreePreviewHtml,
  resolveFlowStage,
  toUploadableAsset,
  type PermissionState,
  type ViewerEvent,
} from './ThreeDModeling.shared';

type Props = {
  navigation?: {
    goBack?: () => void;
  };
  onBack?: () => void;
};

export default function ThreeDModeling({navigation, onBack}: Props) {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [permissionState, setPermissionState] = useState<PermissionState>('unknown');
  const [captureSession, setCaptureSession] = useState<CaptureSession | null>(null);
  const [task, setTask] = useState<ReconstructionTask | null>(null);
  const [modelAsset, setModelAsset] = useState<ModelAsset | null>(null);
  const [selectedAngleTag, setSelectedAngleTag] = useState<string | null>(null);
  const [localFrameUris, setLocalFrameUris] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [viewerErrorMessage, setViewerErrorMessage] = useState<string | null>(null);

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollDeadlineRef = useRef<number>(0);

  const currentAngleTag =
    selectedAngleTag ||
    captureSession?.suggestedAngleTag ||
    captureSession?.missingAngleTags?.[0] ||
    'front';
  const canGenerate =
    Boolean(captureSession) &&
    (captureSession?.acceptedFrameCount ?? 0) >= (captureSession?.minimumFrameCount ?? Infinity) &&
    !generateBusy &&
    !(task && !isTerminalJobStatus(task.status));
  const previewHtml = modelAsset ? renderThreePreviewHtml(modelAsset) : null;
  const currentStage = resolveFlowStage(bootstrapping, task, modelAsset);

  useEffect(() => {
    void initializeSession();

    return () => {
      clearPolling();
    };
  }, []);

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
    setThreeDModelingSession({modelId});
  }

  async function applyTask(nextTask: ReconstructionTask) {
    setTask(nextTask);
    setStatusMessage(nextTask.message || '');
    setErrorMessage(
      nextTask.status === 'failed' || nextTask.status === 'expired'
        ? nextTask.message || null
        : null,
    );
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

  async function createFreshSession() {
    const nextSession = await createCaptureSession();
    const nextAngleTag =
      nextSession.suggestedAngleTag || nextSession.missingAngleTags?.[0] || 'front';

    setCaptureSession(nextSession);
    setTask(null);
    setModelAsset(null);
    setSelectedAngleTag(nextAngleTag);
    setLocalFrameUris({});
    setStatusMessage(nextSession.statusHint || '点击任意角度开始拍摄。');
    setThreeDModelingSession({
      captureSessionId: nextSession.id,
      reconstructionTaskId: null,
      modelId: null,
      selectedAngleTag: nextAngleTag,
      localFrameUris: {},
    });
  }

  async function initializeSession() {
    setBootstrapping(true);
    setErrorMessage(null);

    const persisted = getThreeDModelingSession();
    try {
      if (persisted.captureSessionId) {
        const restoredSession = await getCaptureSession(persisted.captureSessionId);
        const restoredAngleTag =
          persisted.selectedAngleTag ||
          restoredSession.suggestedAngleTag ||
          restoredSession.missingAngleTags?.[0] ||
          'front';

        setCaptureSession(restoredSession);
        setSelectedAngleTag(restoredAngleTag);
        setLocalFrameUris(persisted.localFrameUris || {});
        setStatusMessage(restoredSession.statusHint || '继续你的多视角采集。');

        const restoredTaskId = persisted.reconstructionTaskId || restoredSession.taskId || null;
        if (restoredTaskId) {
          const restoredTask = await getReconstructionTask(restoredTaskId);
          await applyTask(restoredTask);

          if (!isTerminalJobStatus(restoredTask.status)) {
            pollDeadlineRef.current = Date.now() + MAX_POLLING_MS;
            pollTaskStatus(restoredTask.taskId, DEFAULT_POLL_AFTER_MS);
          }
        }
      } else {
        await createFreshSession();
      }
    } catch (error) {
      resetThreeDModelingSession();
      try {
        await createFreshSession();
      } catch (sessionError) {
        setErrorMessage(getErrorMessage(sessionError || error));
      }
    } finally {
      setBootstrapping(false);
    }
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
    if (quality.hint) {
      setReviewMessage(quality.hint);
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
      const nextAngleTag = response.session.missingAngleTags.includes(currentAngleTag)
        ? currentAngleTag
        : response.session.suggestedAngleTag ||
          response.session.missingAngleTags?.[0] ||
          currentAngleTag;

      setCaptureSession(response.session);
      setSelectedAngleTag(nextAngleTag);
      setLocalFrameUris(nextLocalFrameUris);
      setStatusMessage(response.session.statusHint || '继续自由选择角度拍摄。');
      setReviewMessage(
        response.frame.accepted
          ? `已接收 ${getAngleLabel(response.frame.angleTag)} 视角，质量分 ${Math.round(
              response.frame.qualityScore * 100,
            )}。`
          : `已记录 ${getAngleLabel(response.frame.angleTag)}，当前角度未计入通过，可直接补拍或切换其它角度。`,
      );
      setThreeDModelingSession({
        captureSessionId: response.session.id,
        selectedAngleTag: nextAngleTag,
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
    setStatusMessage('正在提交多视角素材，请稍候...');

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

  function handleSelectAngle(angleTag: string) {
    setSelectedAngleTag(angleTag);
    setThreeDModelingSession({selectedAngleTag: angleTag});
  }

  return (
    <ThreeDModelingView
      bootstrapping={bootstrapping}
      currentAngleTag={currentAngleTag}
      currentStage={currentStage}
      captureSession={captureSession}
      task={task}
      modelAsset={modelAsset}
      localFrameUris={localFrameUris}
      permissionState={permissionState}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      reviewMessage={reviewMessage}
      viewerErrorMessage={viewerErrorMessage}
      captureBusy={captureBusy}
      canGenerate={canGenerate}
      generateBusy={generateBusy}
      previewHtml={previewHtml}
      onBack={() => onBack?.() ?? navigation?.goBack?.()}
      onAngleSelect={handleSelectAngle}
      onCapture={() => {
        void handleCaptureFrame();
      }}
      onGenerate={() => {
        void handleGenerate();
      }}
      onPreviewError={payload => {
        setViewerErrorMessage(getErrorMessage(payload));
      }}
      onPreviewMessage={handlePreviewMessage}
      onStartOver={() => {
        void handleStartOver();
      }}
    />
  );
}
