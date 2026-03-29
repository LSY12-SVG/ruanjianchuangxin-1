import {resolveBackendBaseCandidates} from '../../cloud/backendBase';
import {getAuthToken} from '../../profile/api';

export interface ApiRequestErrorPayload {
  code: string;
  message: string;
  requestId: string;
  status: number;
  details?: Record<string, unknown>;
}

export class ApiRequestError extends Error {
  code: string;
  requestId: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(payload: ApiRequestErrorPayload) {
    super(payload.message);
    this.name = 'ApiRequestError';
    this.code = payload.code;
    this.requestId = payload.requestId;
    this.status = payload.status;
    this.details = payload.details;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  port?: number;
  body?: RequestInit['body'] | Record<string, unknown>;
  timeoutMs?: number;
  auth?: boolean;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseJsonSafe = async (response: Response): Promise<unknown> => {
  const raw = await response.text();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {message: raw};
  }
};

const parseErrorPayload = (
  payload: unknown,
  response: Response,
): ApiRequestErrorPayload => {
  const status = Number(response.status || 0);
  if (isObject(payload)) {
    const nested = isObject(payload.error) ? payload.error : {};
    const code =
      (typeof nested.code === 'string' && nested.code) ||
      (typeof payload.code === 'string' && payload.code) ||
      `HTTP_${status || 0}`;
    const message =
      (typeof nested.message === 'string' && nested.message) ||
      (typeof payload.message === 'string' && payload.message) ||
      response.statusText ||
      'request_failed';
    const requestId =
      (typeof nested.requestId === 'string' && nested.requestId) ||
      (typeof payload.requestId === 'string' && payload.requestId) ||
      'unknown';
    const details =
      (isObject(nested.details) && nested.details) ||
      (isObject(payload.details) && payload.details) ||
      undefined;
    return {code, message, requestId, status, details};
  }
  return {
    code: `HTTP_${status || 0}`,
    message: response.statusText || 'request_failed',
    requestId: 'unknown',
    status,
  };
};

const shouldSetJsonContentType = (body: RequestOptions['body']): boolean =>
  body !== undefined && !(body instanceof FormData);

const toBody = (body: RequestOptions['body']): RequestInit['body'] | undefined => {
  if (body === undefined) {
    return undefined;
  }
  if (typeof body === 'string' || body instanceof FormData || body instanceof Blob) {
    return body;
  }
  return JSON.stringify(body);
};

const requestWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const normalizeNetworkErrorMessage = (error: Error | null): string => {
  const raw = error?.message || '无法连接后端服务';
  if (/Network request failed/i.test(raw)) {
    return 'Network request failed (请确认后端已启动；真机调试请执行 adb reverse tcp:8787 tcp:8787，或确保手机与电脑同网段并可访问宿主机:8787)';
  }
  if (/aborted|abort/i.test(raw)) {
    return 'Request aborted (后端响应超时，请稍后重试)';
  }
  return raw;
};

export async function requestApi<T>(
  path: string,
  {
    method = 'GET',
    body,
    headers,
    port = 8787,
    timeoutMs = 15000,
    auth = false,
    ...rest
  }: RequestOptions = {},
): Promise<T> {
  const bases = resolveBackendBaseCandidates(port);
  let lastError: Error | null = null;

  for (const base of bases) {
    const token = getAuthToken();
    const nextHeaders: Record<string, string> = {
      ...(headers as Record<string, string>),
    };
    if (shouldSetJsonContentType(body) && !nextHeaders['Content-Type']) {
      nextHeaders['Content-Type'] = 'application/json';
    }
    if (auth && token) {
      nextHeaders.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await requestWithTimeout(
        `${base}${path}`,
        {
          ...rest,
          method,
          headers: nextHeaders,
          body: toBody(body),
        },
        timeoutMs,
      );
      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw new ApiRequestError(parseErrorPayload(payload, response));
      }
      return payload as T;
    } catch (error) {
      if (error instanceof ApiRequestError) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error('network_error');
    }
  }

  throw new ApiRequestError({
    code: 'NETWORK_ERROR',
    message: normalizeNetworkErrorMessage(lastError),
    requestId: 'unknown',
    status: 0,
  });
}
