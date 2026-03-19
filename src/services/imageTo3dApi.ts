import {resolveBackendBaseCandidates} from '../cloud/backendBase';

const IMAGE_TO_3D_PORT = 8787;

export type ImageTo3DJobStatus =
  | 'queued'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'expired';

export type UploadableImageAsset = {
  uri: string;
  type?: string;
  fileName?: string;
};

export type CreateImageTo3DJobResponse = {
  taskId: string;
  status: ImageTo3DJobStatus;
  pollAfterMs: number;
};

export type ReconstructionTask = {
  taskId: string;
  status: ImageTo3DJobStatus;
  message: string | null;
  modelId: string | null;
  sessionId: string | null;
  viewerFormat: 'glb' | 'gltf' | 'obj' | 'fbx' | null;
  downloadUrl: string | null;
};

export type ModelAsset = {
  id: string;
  sessionId: string;
  glbUrl: string | null;
  viewerFormat: 'glb' | 'gltf' | 'obj' | 'fbx' | null;
};

export class ImageTo3DApiError extends Error {
  code: string;

  constructor(message: string, code = 'UNKNOWN_ERROR') {
    super(message);
    this.name = 'ImageTo3DApiError';
    this.code = code;
  }
}

const parseJsonSafe = async (response: Response): Promise<any> => {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return {message: text};
  }
};

const parseError = (payload: any, fallbackCode: string): ImageTo3DApiError => {
  const error = payload?.error;
  const message =
    (typeof error?.message === 'string' && error.message) ||
    (typeof payload?.message === 'string' && payload.message) ||
    '请求失败，请稍后重试。';
  const code =
    (typeof error?.code === 'string' && error.code) ||
    (typeof payload?.code === 'string' && payload.code) ||
    fallbackCode;
  return new ImageTo3DApiError(message, code);
};

const requestImageTo3D = async (path: string, init?: RequestInit): Promise<any> => {
  const candidates = resolveBackendBaseCandidates(IMAGE_TO_3D_PORT);
  let lastError: ImageTo3DApiError | null = null;

  for (const base of candidates) {
    try {
      const response = await fetch(`${base}${path}`, init);
      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw parseError(payload, `HTTP_${response.status}`);
      }
      return payload;
    } catch (error) {
      if (error instanceof ImageTo3DApiError) {
        lastError = error;
      } else if (error instanceof Error) {
        lastError = new ImageTo3DApiError(error.message, 'NETWORK_ERROR');
      } else {
        lastError = new ImageTo3DApiError('请求失败，请稍后重试。', 'NETWORK_ERROR');
      }
    }
  }

  throw lastError || new ImageTo3DApiError('无法连接 2D 转 3D 服务。', 'UNREACHABLE');
};

export const createImageTo3DJob = async (
  image: UploadableImageAsset,
): Promise<CreateImageTo3DJobResponse> => {
  const formData = new FormData();
  formData.append('image', {
    uri: image.uri,
    type: image.type || 'image/jpeg',
    name: image.fileName || `image-${Date.now()}.jpg`,
  } as never);

  const payload = await requestImageTo3D('/api/v1/image-to-3d/jobs', {
    method: 'POST',
    body: formData,
  });

  return {
    taskId: String(payload.taskId || ''),
    status: payload.status as ImageTo3DJobStatus,
    pollAfterMs: Number(payload.pollAfterMs || 5000),
  };
};

export const getReconstructionTask = async (taskId: string): Promise<ReconstructionTask> => {
  const payload = await requestImageTo3D(`/api/reconstruction-tasks/${encodeURIComponent(taskId)}`);
  return {
    taskId: String(payload.taskId || ''),
    status: payload.status as ImageTo3DJobStatus,
    message: typeof payload.message === 'string' ? payload.message : null,
    modelId: typeof payload.modelId === 'string' ? payload.modelId : null,
    sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : null,
    viewerFormat: payload.viewerFormat || null,
    downloadUrl: typeof payload.downloadUrl === 'string' ? payload.downloadUrl : null,
  };
};

export const getModelAsset = async (modelId: string): Promise<ModelAsset> => {
  const payload = await requestImageTo3D(`/api/models/${encodeURIComponent(modelId)}`);
  return {
    id: String(payload.id || ''),
    sessionId: String(payload.sessionId || ''),
    glbUrl: typeof payload.glbUrl === 'string' ? payload.glbUrl : null,
    viewerFormat: payload.viewerFormat || null,
  };
};

