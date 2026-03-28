import 'server-only';

import {readWebAuthToken} from './auth';

export const VISIONGENIE_API_BASE_URL =
  process.env.VISIONGENIE_API_BASE_URL ?? 'http://127.0.0.1:8787';

type BackendBody = BodyInit | FormData | Blob | Record<string, unknown> | undefined;

interface BackendRequestOptions extends Omit<RequestInit, 'body'> {
  auth?: boolean;
  body?: BackendBody;
  token?: string;
}

export class WebBackendError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'WebBackendError';
    this.code = code;
    this.status = status;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const shouldSetJsonContentType = (body: BackendBody) =>
  body !== undefined &&
  !(body instanceof FormData) &&
  !(body instanceof Blob) &&
  typeof body !== 'string';

const toBody = (body: BackendBody): BodyInit | undefined => {
  if (body === undefined) {
    return undefined;
  }
  if (body instanceof FormData || body instanceof Blob || typeof body === 'string') {
    return body;
  }
  return JSON.stringify(body);
};

async function parseJsonSafe(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {message: raw};
  }
}

export function normalizeBackendAssetUrl(url: string): string {
  if (!url) {
    return '';
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `${VISIONGENIE_API_BASE_URL}${url}`;
}

export function formatWebBackendError(
  error: unknown,
  fallback: string,
): {message: string; status: number} {
  if (error instanceof WebBackendError) {
    return {
      message: error.message || fallback,
      status: error.status || 500,
    };
  }
  if (error instanceof Error && error.message) {
    return {
      message: error.message,
      status: 500,
    };
  }
  return {
    message: fallback,
    status: 500,
  };
}

export async function backendFetch<T>(
  path: string,
  {auth = false, body, headers, token, ...rest}: BackendRequestOptions = {},
): Promise<T> {
  const resolvedToken = token ?? (auth ? await readWebAuthToken() : '');
  if (auth && !resolvedToken) {
    throw new WebBackendError('UNAUTHORIZED', 401, '请先登录后再继续操作。');
  }

  const nextHeaders = new Headers(headers || {});
  if (shouldSetJsonContentType(body) && !nextHeaders.has('Content-Type')) {
    nextHeaders.set('Content-Type', 'application/json');
  }
  if (auth && resolvedToken) {
    nextHeaders.set('Authorization', `Bearer ${resolvedToken}`);
  }

  const response = await fetch(`${VISIONGENIE_API_BASE_URL}${path}`, {
    ...rest,
    cache: 'no-store',
    headers: nextHeaders,
    body: toBody(body),
  });

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    const code =
      (isObject(payload) &&
        ((typeof payload.error === 'string' && payload.error) ||
          (isObject(payload.error) &&
            typeof payload.error.code === 'string' &&
            payload.error.code))) ||
      `HTTP_${response.status}`;
    const message =
      (isObject(payload) &&
        ((typeof payload.message === 'string' && payload.message) ||
          (isObject(payload.error) &&
            typeof payload.error.message === 'string' &&
            payload.error.message))) ||
      response.statusText ||
      'request_failed';
    throw new WebBackendError(String(code), response.status, String(message));
  }

  return payload as T;
}
