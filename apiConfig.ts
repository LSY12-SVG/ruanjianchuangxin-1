import {NativeModules} from 'react-native';

const DEFAULT_API_HOST = '127.0.0.1';
const DEFAULT_API_PORT = 3001;

let apiBaseUrlOverride: string | null = null;

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export function setApiBaseUrlOverride(url: string | null) {
  apiBaseUrlOverride = url ? normalizeBaseUrl(url) : null;
}

export function resetApiBaseUrlOverride() {
  apiBaseUrlOverride = null;
}

export function getMetroHostFromScriptUrl(scriptURL?: string | null): string | null {
  if (!scriptURL) {
    return null;
  }

  try {
    const parsed = new URL(scriptURL);
    if (!/^https?:$/.test(parsed.protocol)) {
      return null;
    }

    return parsed.hostname || null;
  } catch (_error) {
    return null;
  }
}

function getDevServerHost(): string | null {
  return getMetroHostFromScriptUrl(NativeModules?.SourceCode?.scriptURL);
}

export function getApiBaseUrl(options?: {scriptURL?: string | null}): string {
  if (apiBaseUrlOverride) {
    return apiBaseUrlOverride;
  }

  const devServerHost =
    options?.scriptURL !== undefined
      ? getMetroHostFromScriptUrl(options.scriptURL)
      : getDevServerHost();
  if (devServerHost) {
    return `http://${devServerHost}:${DEFAULT_API_PORT}`;
  }

  return `http://${DEFAULT_API_HOST}:${DEFAULT_API_PORT}`;
}

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}
