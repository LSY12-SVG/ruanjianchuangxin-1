import {NativeModules} from 'react-native';

const DEFAULT_BACKEND_PORT = 8787;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '10.0.2.2', '10.0.3.2']);

const isIpv4Host = (hostname: string): boolean => /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);

const isUsableDevHost = (hostname: string): boolean => {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (LOOPBACK_HOSTS.has(normalized)) {
    return true;
  }
  if (isIpv4Host(normalized)) {
    return true;
  }
  return normalized.includes('.');
};

const resolveScriptHostBase = (port: number): string | null => {
  const scriptURL = NativeModules?.SourceCode?.scriptURL;
  if (typeof scriptURL !== 'string' || scriptURL.length === 0) {
    return null;
  }
  try {
    const parsed = new URL(scriptURL);
    const hostname = parsed.hostname || '';
    if (!isUsableDevHost(hostname)) {
      return null;
    }
    const protocol = parsed.protocol || 'http:';
    return `${protocol}//${hostname}:${port}`;
  } catch {
    return null;
  }
};

export const resolveBackendBaseCandidates = (
  port: number = DEFAULT_BACKEND_PORT,
): string[] => {
  const resolvedPort = Number.isFinite(port) ? Math.max(1, Math.floor(port)) : DEFAULT_BACKEND_PORT;
  const set = new Set<string>();

  set.add(`http://127.0.0.1:${resolvedPort}`);
  set.add(`http://localhost:${resolvedPort}`);
  set.add(`http://10.0.2.2:${resolvedPort}`);
  set.add(`http://10.0.3.2:${resolvedPort}`);

  const fromScript = resolveScriptHostBase(resolvedPort);
  if (fromScript) {
    set.add(fromScript);
  }

  return Array.from(set);
};
