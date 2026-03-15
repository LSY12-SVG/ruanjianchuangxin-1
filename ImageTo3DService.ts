import {requestJson} from './apiClient';

export type ImageTo3DJobStatus =
  | 'queued'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'expired';

export type ViewerFormat = 'glb' | 'gltf' | 'obj' | 'fbx';

export type ViewerFile = {
  type: string;
  url: string;
  previewImageUrl?: string | null;
};

export type UploadableImageAsset = {
  uri: string;
  type?: string;
  fileName?: string;
  fileSize?: number;
  width?: number;
  height?: number;
};

export type SelectedImageAsset = UploadableImageAsset;
export type ImageTo3DTaskStatus = ImageTo3DJobStatus | 'idle';

export type CreateImageTo3DJobResponse = {
  taskId: string;
  status: ImageTo3DJobStatus;
  pollAfterMs: number;
  message?: string | null;
};

export type ImageTo3DJob = {
  taskId: string;
  status: ImageTo3DJobStatus;
  message: string | null;
  previewUrl: string | null;
  previewImageUrl: string | null;
  downloadUrl: string | null;
  fileType: string | null;
  viewerFormat: ViewerFormat | null;
  viewerFiles: ViewerFile[];
  expiresAt: string | null;
};

export type CaptureSessionStatus =
  | 'collecting'
  | 'ready'
  | 'generating'
  | 'post_processing'
  | 'ready_to_view'
  | 'failed';

export type CaptureFrame = {
  id: string;
  sessionId: string;
  imageUrl: string;
  angleTag: string;
  qualityScore: number;
  qualityIssues: string[];
  accepted: boolean;
  width: number | null;
  height: number | null;
  capturedAt: string;
};

export type CaptureSession = {
  id: string;
  status: CaptureSessionStatus;
  targetFrameCount: number;
  minimumFrameCount: number;
  acceptedFrameCount: number;
  coverFrameId: string | null;
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  frames: CaptureFrame[];
  missingAngleTags: string[];
  suggestedAngleTag: string | null;
  remainingCount: number;
  statusHint: string;
};

export type CaptureFrameUploadResponse = {
  session: CaptureSession;
  frame: CaptureFrame;
};

export type ReconstructionTask = ImageTo3DJob & {
  sessionId: string | null;
  modelId: string | null;
};

export type ModelAsset = {
  id: string;
  sessionId: string;
  glbUrl: string | null;
  thumbnailUrl: string | null;
  boundingBox: {x: number; y: number; z: number};
  defaultCamera: {
    position: {x: number; y: number; z: number};
    target: {x: number; y: number; z: number};
    fov: number;
  };
  autoRotateSpeed: number;
  viewerFormat: ViewerFormat | null;
  viewerFiles: ViewerFile[];
  createdAt: string;
};

export type GenerateCaptureSessionResponse = {
  taskId: string;
  modelId: string;
  sessionId: string;
  status: ImageTo3DJobStatus;
  pollAfterMs: number;
};

function normalizeJob(payload: any): ImageTo3DJob {
  return {
    taskId: payload.taskId,
    status: payload.status,
    message: payload.message ?? null,
    previewUrl: payload.previewUrl ?? null,
    previewImageUrl: payload.previewImageUrl ?? null,
    downloadUrl: payload.downloadUrl ?? null,
    fileType: payload.fileType ?? null,
    viewerFormat: payload.viewerFormat ?? null,
    viewerFiles: Array.isArray(payload.viewerFiles) ? payload.viewerFiles : [],
    expiresAt: payload.expiresAt ?? null,
  };
}

function normalizeCaptureFrame(payload: any): CaptureFrame {
  return {
    id: payload.id,
    sessionId: payload.sessionId,
    imageUrl: payload.imageUrl,
    angleTag: payload.angleTag,
    qualityScore: payload.qualityScore ?? 0,
    qualityIssues: Array.isArray(payload.qualityIssues) ? payload.qualityIssues : [],
    accepted: Boolean(payload.accepted),
    width: payload.width ?? null,
    height: payload.height ?? null,
    capturedAt: payload.capturedAt,
  };
}

function normalizeCaptureSession(payload: any): CaptureSession {
  return {
    id: payload.id,
    status: payload.status,
    targetFrameCount: payload.targetFrameCount,
    minimumFrameCount: payload.minimumFrameCount,
    acceptedFrameCount: payload.acceptedFrameCount,
    coverFrameId: payload.coverFrameId ?? null,
    taskId: payload.taskId ?? null,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    lastErrorCode: payload.lastErrorCode ?? null,
    lastErrorMessage: payload.lastErrorMessage ?? null,
    frames: Array.isArray(payload.frames)
      ? payload.frames.map(normalizeCaptureFrame)
      : [],
    missingAngleTags: Array.isArray(payload.missingAngleTags) ? payload.missingAngleTags : [],
    suggestedAngleTag: payload.suggestedAngleTag ?? null,
    remainingCount: payload.remainingCount ?? 0,
    statusHint: payload.statusHint ?? '',
  };
}

export function isTerminalJobStatus(status: ImageTo3DJobStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'expired';
}

export async function createImageTo3DJob(
  image: UploadableImageAsset,
): Promise<CreateImageTo3DJobResponse> {
  const formData = new FormData();
  formData.append('image', {
    uri: image.uri,
    type: image.type ?? 'image/jpeg',
    name: image.fileName ?? `image-${Date.now()}.jpg`,
  } as any);

  const payload = await requestJson('/api/v1/image-to-3d/jobs', {
    method: 'POST',
    body: formData,
  });

  return {
    taskId: payload.taskId,
    status: payload.status,
    pollAfterMs: payload.pollAfterMs ?? 5000,
    message: payload.message ?? null,
  };
}

export async function getImageTo3DJob(taskId: string): Promise<ImageTo3DJob> {
  const payload = await requestJson(`/api/v1/image-to-3d/jobs/${taskId}`);
  return normalizeJob(payload);
}

export async function createCaptureSession(): Promise<CaptureSession> {
  const payload = await requestJson('/api/capture-sessions', {
    method: 'POST',
  });
  return normalizeCaptureSession(payload);
}

export async function getCaptureSession(sessionId: string): Promise<CaptureSession> {
  const payload = await requestJson(`/api/capture-sessions/${sessionId}`);
  return normalizeCaptureSession(payload);
}

export async function uploadCaptureFrame(
  sessionId: string,
  image: UploadableImageAsset,
  metadata: {
    angleTag: string;
    width?: number;
    height?: number;
    fileSize?: number;
  },
): Promise<CaptureFrameUploadResponse> {
  const formData = new FormData();
  formData.append('image', {
    uri: image.uri,
    type: image.type ?? 'image/jpeg',
    name: image.fileName ?? `capture-${Date.now()}.jpg`,
  } as any);
  formData.append('angleTag', metadata.angleTag);
  if (metadata.width != null) {
    formData.append('width', String(metadata.width));
  }
  if (metadata.height != null) {
    formData.append('height', String(metadata.height));
  }
  if (metadata.fileSize != null) {
    formData.append('fileSize', String(metadata.fileSize));
  }

  const payload = await requestJson(`/api/capture-sessions/${sessionId}/frames`, {
    method: 'POST',
    body: formData,
  });

  return {
    session: normalizeCaptureSession(payload.session),
    frame: normalizeCaptureFrame(payload.frame),
  };
}

export async function generateCaptureSession(
  sessionId: string,
): Promise<GenerateCaptureSessionResponse> {
  const payload = await requestJson(`/api/capture-sessions/${sessionId}/generate`, {
    method: 'POST',
  });

  return {
    taskId: payload.taskId,
    modelId: payload.modelId,
    sessionId: payload.sessionId,
    status: payload.status,
    pollAfterMs: payload.pollAfterMs ?? 5000,
  };
}

export async function getReconstructionTask(taskId: string): Promise<ReconstructionTask> {
  const payload = await requestJson(`/api/reconstruction-tasks/${taskId}`);

  return {
    ...normalizeJob(payload),
    sessionId: payload.sessionId ?? null,
    modelId: payload.modelId ?? null,
  };
}

export async function getModelAsset(modelId: string): Promise<ModelAsset> {
  const payload = await requestJson(`/api/models/${modelId}`);

  return {
    id: payload.id,
    sessionId: payload.sessionId,
    glbUrl: payload.glbUrl ?? null,
    thumbnailUrl: payload.thumbnailUrl ?? null,
    boundingBox: payload.boundingBox ?? {x: 1, y: 1, z: 1},
    defaultCamera: payload.defaultCamera,
    autoRotateSpeed: payload.autoRotateSpeed ?? 0.85,
    viewerFormat: payload.viewerFormat ?? null,
    viewerFiles: Array.isArray(payload.viewerFiles) ? payload.viewerFiles : [],
    createdAt: payload.createdAt,
  };
}
