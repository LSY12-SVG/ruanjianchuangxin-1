import {requestApi} from './http';
import type {
  CaptureSessionResponse,
  ModelingJobResponse,
  ModelingModelAssetResponse,
} from './types';

const MODELING_SUBMIT_TIMEOUT_MS = 180_000;
const MODELING_QUERY_TIMEOUT_MS = 30_000;

export const modelingApi = {
  async createJob(image: {uri: string; type?: string; fileName?: string}): Promise<ModelingJobResponse> {
    const form = new FormData();
    form.append(
      'image',
      {
        uri: image.uri,
        type: image.type || 'image/jpeg',
        name: image.fileName || `model-job-${Date.now()}.jpg`,
      } as never,
    );
    return requestApi<ModelingJobResponse>('/v1/modules/modeling/jobs', {
      method: 'POST',
      body: form,
      timeoutMs: MODELING_SUBMIT_TIMEOUT_MS,
    });
  },

  async getJob(taskId: string): Promise<ModelingJobResponse> {
    return requestApi<ModelingJobResponse>(`/v1/modules/modeling/jobs/${encodeURIComponent(taskId)}`, {
      timeoutMs: MODELING_QUERY_TIMEOUT_MS,
    });
  },

  async getAsset(taskId: string, assetIndex: number): Promise<Blob> {
    const response = await fetch(
      `${(await import('../../cloud/backendBase')).resolveBackendBaseCandidates(8787)[0]}/v1/modules/modeling/jobs/${encodeURIComponent(
        taskId,
      )}/assets/${assetIndex}`,
    );
    if (!response.ok) {
      throw new Error(`asset_http_${response.status}`);
    }
    return response.blob();
  },

  async createCaptureSession(): Promise<CaptureSessionResponse> {
    return requestApi<CaptureSessionResponse>('/v1/modules/modeling/capture-sessions', {
      method: 'POST',
      timeoutMs: MODELING_QUERY_TIMEOUT_MS,
    });
  },

  async getCaptureSession(sessionId: string): Promise<CaptureSessionResponse> {
    return requestApi<CaptureSessionResponse>(
      `/v1/modules/modeling/capture-sessions/${encodeURIComponent(sessionId)}`,
      {
        timeoutMs: MODELING_QUERY_TIMEOUT_MS,
      },
    );
  },

  async uploadCaptureFrame(
    sessionId: string,
    frame: {
      uri: string;
      type?: string;
      fileName?: string;
      angleTag: string;
      width?: number;
      height?: number;
      fileSize?: number;
    },
  ): Promise<{
    session: CaptureSessionResponse;
    frame: Record<string, unknown>;
  }> {
    const form = new FormData();
    form.append(
      'image',
      {
        uri: frame.uri,
        type: frame.type || 'image/jpeg',
        name: frame.fileName || `capture-${Date.now()}.jpg`,
      } as never,
    );
    form.append('angleTag', frame.angleTag);
    if (typeof frame.width === 'number') {
      form.append('width', String(frame.width));
    }
    if (typeof frame.height === 'number') {
      form.append('height', String(frame.height));
    }
    if (typeof frame.fileSize === 'number') {
      form.append('fileSize', String(frame.fileSize));
    }
    return requestApi(`/v1/modules/modeling/capture-sessions/${encodeURIComponent(sessionId)}/frames`, {
      method: 'POST',
      body: form,
      timeoutMs: MODELING_SUBMIT_TIMEOUT_MS,
    });
  },

  async generateCapture(sessionId: string): Promise<{
    taskId: string;
    modelId: string;
    sessionId: string;
    status: string;
    pollAfterMs: number;
  }> {
    return requestApi(
      `/v1/modules/modeling/capture-sessions/${encodeURIComponent(sessionId)}/generate`,
      {
        method: 'POST',
        timeoutMs: MODELING_SUBMIT_TIMEOUT_MS,
      },
    );
  },

  async getModelAsset(modelId: string): Promise<ModelingModelAssetResponse> {
    return requestApi<ModelingModelAssetResponse>(
      `/v1/modules/modeling/models/${encodeURIComponent(modelId)}`,
      {
        timeoutMs: MODELING_QUERY_TIMEOUT_MS,
      },
    );
  },
};
