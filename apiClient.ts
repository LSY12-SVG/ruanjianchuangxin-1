import {buildApiUrl} from './apiConfig';

export class ApiClientError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function parseResponsePayload(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return {
      message: text,
    };
  }
}

function normalizeApiError(payload: any, status: number): ApiClientError {
  const apiError = payload?.error;
  const message =
    apiError?.message ||
    payload?.message ||
    payload?.detail ||
    `Request failed with status ${status}`;
  const code =
    apiError?.code ||
    (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');

  return new ApiClientError(status, code, message, apiError?.details);
}

export async function requestJson(path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(buildApiUrl(path), init);
  const payload = await parseResponsePayload(response);

  if (!response.ok) {
    throw normalizeApiError(payload, response.status);
  }

  return payload;
}
