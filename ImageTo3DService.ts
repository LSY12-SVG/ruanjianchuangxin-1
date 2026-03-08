import {Platform} from 'react-native';

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

const API_BASE_URL =
  Platform.OS === 'android' ? 'http://127.0.0.1:3001' : 'http://127.0.0.1:3001';

function normalizeServiceError(payload: any, status: number): string {
  const candidates = [payload?.message, payload?.error, payload?.detail];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }

    if (candidate && typeof candidate === 'object') {
      if (typeof candidate.message === 'string' && candidate.message.trim()) {
        return candidate.message;
      }

      try {
        const serialized = JSON.stringify(candidate);
        if (serialized && serialized !== '{}') {
          return serialized;
        }
      } catch (serializationError) {
      }
    }
  }

  return `Request failed with status ${status}`;
}

function assertOk(response: Response, payload: any) {
  if (!response.ok) {
    throw new Error(normalizeServiceError(payload, response.status));
  }
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

  const response = await fetch(`${API_BASE_URL}/api/v1/image-to-3d/jobs`, {
    method: 'POST',
    body: formData,
  });
  const payload = await response.json();
  assertOk(response, payload);

  return {
    taskId: payload.taskId,
    status: payload.status,
    pollAfterMs: payload.pollAfterMs ?? 5000,
    message: payload.message ?? null,
  };
}

export async function getImageTo3DJob(taskId: string): Promise<ImageTo3DJob> {
  const response = await fetch(`${API_BASE_URL}/api/v1/image-to-3d/jobs/${taskId}`);
  const payload = await response.json();
  assertOk(response, payload);

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