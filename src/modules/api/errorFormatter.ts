import {ApiRequestError} from './http';

const defaultFallback = '请求失败';

export const formatApiErrorMessage = (
  error: unknown,
  fallbackMessage = defaultFallback,
): string => {
  const fallback = fallbackMessage.trim() || defaultFallback;

  if (error instanceof ApiRequestError) {
    const code = error.code || 'UNKNOWN_ERROR';
    const message = error.message || fallback;
    return `${code}: ${message}`;
  }

  if (error instanceof Error) {
    const message = error.message || fallback;
    return `UNKNOWN_ERROR: ${message}`;
  }

  if (typeof error === 'string' && error.trim()) {
    return `UNKNOWN_ERROR: ${error.trim()}`;
  }

  return `UNKNOWN_ERROR: ${fallback}`;
};
