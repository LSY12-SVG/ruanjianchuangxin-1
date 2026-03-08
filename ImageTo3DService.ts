import { NativeModules, Platform } from 'react-native';

export type ImageTo3DTaskStatus =
  | 'idle'
  | 'submitting'
  | 'queued'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'expired';

export interface SelectedImageAsset {
  uri: string;
  type?: string;
  fileName?: string;
}

export interface CreateImageTo3DJobResponse {
  taskId: string;
  status: 'queued';
  pollAfterMs: number;
}

export interface ImageTo3DJobResponse {
  taskId: string;
  status: Exclude<ImageTo3DTaskStatus, 'idle' | 'submitting'>;
  message: string;
  previewUrl: string | null;
  downloadUrl: string | null;
  fileType: string | null;
  expiresAt: string | null;
}

function inferHostFromMetro() {
  const scriptURL = NativeModules.SourceCode?.scriptURL;

  if (!scriptURL) {
    return null;
  }

  try {
    const parsedUrl = new URL(scriptURL);
    return parsedUrl.hostname;
  } catch (_error) {
    return null;
  }
}

export function getDefaultImageTo3DBaseUrl() {
  const metroHost = inferHostFromMetro();

  if (metroHost) {
    return `http://${metroHost}:3001`;
  }

  return Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001';
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || data?.message || 'Request failed.';
    throw new Error(message);
  }

  return data as T;
}

export class ImageTo3DService {
  constructor(private readonly baseUrl: string = getDefaultImageTo3DBaseUrl()) {}

  async createJob(image: SelectedImageAsset): Promise<CreateImageTo3DJobResponse> {
    const formData = new FormData();
    formData.append('image', {
      uri: image.uri,
      name: image.fileName || 'upload.jpg',
      type: image.type || 'image/jpeg',
    } as never);

    const response = await fetch(`${this.baseUrl}/api/v1/image-to-3d/jobs`, {
      method: 'POST',
      body: formData,
    });

    return parseJsonResponse<CreateImageTo3DJobResponse>(response);
  }

  async getJob(taskId: string): Promise<ImageTo3DJobResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/image-to-3d/jobs/${taskId}`);
    return parseJsonResponse<ImageTo3DJobResponse>(response);
  }
}
