import {NativeModules} from 'react-native';
import type {CloudFallbackReason, CloudServiceState} from '../types/colorEngine';

const DEFAULT_PORT = 8787;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);
const EMULATOR_HOSTS = new Set(['10.0.2.2', '10.0.3.2']);
const WILDCARD_HOSTS = new Set(['0.0.0.0', '::', '[::]']);
const LOOPBACK_BASE = `http://127.0.0.1:${DEFAULT_PORT}`;
const HEALTH_CACHE_WINDOW_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;
const MIN_TIMEOUT_MS = 1000;
const MIN_HEALTH_TIMEOUT_MS = 600;
const MIN_TOTAL_BUDGET_MS = 1200;
const MIN_ATTEMPT_TIMEOUT_MS = 300;

export type CloudRequestPhase = 'fast' | 'refine';

type HealthSnapshot = {
  state: CloudServiceState;
  failCount: number;
  nextProbeAt: number;
  lastCheckedAt: number;
  lastReason?: CloudFallbackReason;
};

export interface CloudRuntimeState {
  cloudState: CloudServiceState;
  fallbackReason?: CloudFallbackReason;
  endpoint?: string;
  lockedEndpoint?: string;
  phase?: CloudRequestPhase;
  latencyMs: number;
  retrying: boolean;
  nextRecoveryAction: string;
  updatedAt: number;
}

export interface CloudRequestResult<T> {
  ok: boolean;
  data?: T;
  endpoint?: string;
  cloudState: CloudServiceState;
  fallbackReason?: CloudFallbackReason;
  status?: number;
  latencyMs: number;
  attempts: number;
  retrying: boolean;
  nextRecoveryAction: string;
  lockedEndpoint?: string;
  phase?: CloudRequestPhase;
}

const healthByOrigin = new Map<string, HealthSnapshot>();
let cloudEndpointOverride: string | null = null;
let lockedCloudEndpointBase: string | null = null;
const cloudListeners = new Set<(state: CloudRuntimeState) => void>();
let latestRuntimeState: CloudRuntimeState = {
  cloudState: 'healthy',
  latencyMs: 0,
  retrying: false,
  nextRecoveryAction: 'cloud_available',
  updatedAt: Date.now(),
};

const wait = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

const isIpv4Host = (hostname: string): boolean => /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);

const isLanHost = (hostname: string): boolean => {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (LOOPBACK_HOSTS.has(normalized) || EMULATOR_HOSTS.has(normalized)) {
    return false;
  }
  return isIpv4Host(normalized);
};

const isUsableDevHost = (hostname: string): boolean => {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (WILDCARD_HOSTS.has(normalized)) {
    return false;
  }
  if (LOOPBACK_HOSTS.has(normalized) || EMULATOR_HOSTS.has(normalized) || isIpv4Host(normalized)) {
    return true;
  }
  return normalized.includes('.');
};

const timeoutFetch = async (
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

const normalizeEndpoint = (raw: string, servicePath: string): string | null => {
  const candidate = raw.trim();
  if (!candidate) {
    return null;
  }
  try {
    const parsed = new URL(candidate);
    const target = `${parsed.protocol}//${parsed.hostname}:${parsed.port || DEFAULT_PORT}${servicePath}`;
    return target;
  } catch {
    if (!candidate.startsWith('http://') && !candidate.startsWith('https://')) {
      try {
        const parsed = new URL(`http://${candidate}`);
        return `${parsed.protocol}//${parsed.hostname}:${parsed.port || DEFAULT_PORT}${servicePath}`;
      } catch {
        return null;
      }
    }
    return null;
  }
};

const normalizeBaseEndpoint = (raw: string): string | null => {
  const candidate = raw.trim();
  if (!candidate) {
    return null;
  }
  try {
    const parsed = new URL(candidate);
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || DEFAULT_PORT}`;
  } catch {
    if (!candidate.startsWith('http://') && !candidate.startsWith('https://')) {
      try {
        const parsed = new URL(`http://${candidate}`);
        return `${parsed.protocol}//${parsed.hostname}:${parsed.port || DEFAULT_PORT}`;
      } catch {
        return null;
      }
    }
    return null;
  }
};

const resolveHostFromScriptURL = (): {protocol: string; host: string} | null => {
  const scriptURL = NativeModules?.SourceCode?.scriptURL;
  if (typeof scriptURL !== 'string' || scriptURL.length === 0) {
    return null;
  }
  try {
    const parsed = new URL(scriptURL);
    const host = parsed.hostname || '';
    if (!isUsableDevHost(host)) {
      return null;
    }
    return {protocol: parsed.protocol || 'http:', host};
  } catch {
    return null;
  }
};

const withServicePath = (protocol: string, host: string, servicePath: string): string =>
  `${protocol}//${host}:${DEFAULT_PORT}${servicePath}`;

const inferFallbackReason = (
  error: unknown,
  status?: number,
): CloudFallbackReason => {
  if (status === 401 || status === 403) {
    return 'auth_error';
  }
  if (status === 408 || status === 504 || status === 429) {
    return 'timeout';
  }
  if (status === 413 || status === 422) {
    return 'bad_payload';
  }
  if (typeof status === 'number' && status >= 500) {
    return 'http_5xx';
  }
  const message = String((error as {message?: string})?.message ?? error ?? '');
  const normalized = message.toLowerCase();
  if (
    normalized.includes('enotfound') ||
    normalized.includes('getaddrinfo') ||
    normalized.includes('name or service not known') ||
    normalized.includes('dns')
  ) {
    return 'dns_error';
  }
  if (normalized.includes('abort')) {
    return 'timeout';
  }
  if (normalized.includes('network request failed') || normalized.includes('failed to fetch')) {
    return 'host_unreachable';
  }
  return 'unknown';
};

const describeRecoveryAction = (
  state: CloudServiceState,
  reason?: CloudFallbackReason,
): string => {
  if (state === 'healthy') {
    return 'cloud_available';
  }
  switch (reason) {
    case 'timeout':
      return 'retry_with_backoff';
    case 'host_unreachable':
      return 'verify_adb_reverse_or_lan_host';
    case 'dns_error':
      return 'check_dns_or_hostname';
    case 'auth_error':
      return 'check_model_api_credentials';
    case 'http_5xx':
      return 'wait_or_switch_backup_model';
    case 'model_unavailable':
      return 'check_model_catalog_or_id';
    case 'bad_payload':
      return 'check_backend_payload_schema';
    default:
      return 'retry_in_background';
  }
};

const emitRuntimeState = (patch: Partial<CloudRuntimeState>): void => {
  latestRuntimeState = {
    ...latestRuntimeState,
    ...patch,
    updatedAt: Date.now(),
  };
  cloudListeners.forEach(listener => {
    try {
      listener(latestRuntimeState);
    } catch {
      // ignore listener failures
    }
  });
};

const nextBackoff = (failCount: number): number =>
  Math.min(MAX_BACKOFF_MS, Math.max(1000, Math.pow(2, failCount) * 1000));

const updateHealth = (
  origin: string,
  state: CloudServiceState,
  reason?: CloudFallbackReason,
): void => {
  const now = Date.now();
  const prev = healthByOrigin.get(origin);
  const nextFailCount = state === 'healthy' ? 0 : (prev?.failCount || 0) + 1;
  healthByOrigin.set(origin, {
    state,
    failCount: nextFailCount,
    lastCheckedAt: now,
    nextProbeAt: state === 'healthy' ? now + HEALTH_CACHE_WINDOW_MS : now + nextBackoff(nextFailCount),
    lastReason: reason,
  });
};

const getBaseOrigin = (endpoint: string): string => {
  const parsed = new URL(endpoint);
  return `${parsed.protocol}//${parsed.hostname}:${parsed.port || DEFAULT_PORT}`;
};

const withServicePathFromBase = (base: string, servicePath: string): string =>
  `${base}${servicePath}`;

const resolvePreferredBaseOrder = (
  explicitEndpoint?: string,
): string[] => {
  const result = new Set<string>();
  const normalizedExplicit = explicitEndpoint ? normalizeBaseEndpoint(explicitEndpoint) : null;
  if (normalizedExplicit) {
    result.add(normalizedExplicit);
  }

  const normalizedOverride = cloudEndpointOverride
    ? normalizeBaseEndpoint(cloudEndpointOverride)
    : null;
  if (normalizedOverride) {
    result.add(normalizedOverride);
  }

  const scriptHost = resolveHostFromScriptURL();
  if (scriptHost && isLanHost(scriptHost.host)) {
    result.add(`${scriptHost.protocol}//${scriptHost.host}:${DEFAULT_PORT}`);
  }

  result.add(LOOPBACK_BASE);
  return Array.from(result);
};

const lockCloudBaseEndpoint = (explicitEndpoint?: string): string => {
  const preferred = resolvePreferredBaseOrder(explicitEndpoint);
  if (preferred.length === 0) {
    lockedCloudEndpointBase = LOOPBACK_BASE;
    return LOOPBACK_BASE;
  }
  const explicitBase = explicitEndpoint ? normalizeBaseEndpoint(explicitEndpoint) : null;
  if (explicitBase) {
    lockedCloudEndpointBase = explicitBase;
    return explicitBase;
  }
  if (lockedCloudEndpointBase) {
    return lockedCloudEndpointBase;
  }
  const selected = preferred[0] || LOOPBACK_BASE;
  lockedCloudEndpointBase = selected;
  return selected;
};

const probeHealth = async (
  endpoint: string,
  timeoutMs: number,
): Promise<CloudServiceState> => {
  const origin = getBaseOrigin(endpoint);
  const now = Date.now();
  const cached = healthByOrigin.get(origin);
  if (cached && cached.nextProbeAt > now) {
    return cached.state;
  }
  try {
    const response = await timeoutFetch(`${origin}/health`, {method: 'GET'}, timeoutMs);
    if (response.ok) {
      updateHealth(origin, 'healthy');
      return 'healthy';
    }
    updateHealth(origin, 'degraded', inferFallbackReason(null, response.status));
    return 'degraded';
  } catch (error) {
    updateHealth(origin, 'offline', inferFallbackReason(error));
    return 'offline';
  }
};

export const setCloudEndpointOverride = (endpoint: string | null): void => {
  const normalized = endpoint?.trim() || null;
  cloudEndpointOverride = normalized;
  if (normalized) {
    const overrideBase = normalizeBaseEndpoint(normalized);
    if (overrideBase) {
      lockedCloudEndpointBase = overrideBase;
    }
  }
};

export const getCloudRuntimeState = (): CloudRuntimeState => latestRuntimeState;

export const subscribeCloudRuntimeState = (
  listener: (state: CloudRuntimeState) => void,
): (() => void) => {
  cloudListeners.add(listener);
  listener(latestRuntimeState);
  return () => {
    cloudListeners.delete(listener);
  };
};

export const resolveCloudEndpointsForService = (
  servicePath: string,
  explicitEndpoint?: string,
): string[] => {
  const bases = resolvePreferredBaseOrder(explicitEndpoint);
  return bases
    .map(base => normalizeEndpoint(base, servicePath))
    .filter((item): item is string => Boolean(item));
};

export const requestCloudJson = async <T>(options: {
  servicePath: string;
  explicitEndpoint?: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  healthTimeoutMs?: number;
  totalBudgetMs?: number;
  phase?: CloudRequestPhase;
}): Promise<CloudRequestResult<T>> => {
  const method = options.method || 'POST';
  const retries = Math.max(0, options.retries ?? 1);
  const timeoutMs = Math.max(MIN_TIMEOUT_MS, options.timeoutMs ?? 6000);
  const healthTimeoutMs = Math.max(MIN_HEALTH_TIMEOUT_MS, options.healthTimeoutMs ?? 700);
  const totalBudgetMs = Math.max(
    MIN_TOTAL_BUDGET_MS,
    options.totalBudgetMs ?? timeoutMs * (retries + 1) + 600,
  );
  const phase = options.phase;
  const lockedBase = lockCloudBaseEndpoint(options.explicitEndpoint);
  const endpoint = withServicePathFromBase(lockedBase, options.servicePath);
  let lastReason: CloudFallbackReason = 'unknown';
  let lastState: CloudServiceState = 'offline';
  const startedAt = Date.now();
  let attempts = 0;
  const origin = getBaseOrigin(endpoint);
  const preflightState = await probeHealth(endpoint, healthTimeoutMs);
  lastState = preflightState;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= totalBudgetMs) {
      lastReason = 'timeout';
      lastState = 'degraded';
      break;
    }

    attempts += 1;
    const retrying = attempt < retries;
    emitRuntimeState({
      cloudState: preflightState,
      endpoint,
      lockedEndpoint: lockedBase,
      phase,
      retrying,
      fallbackReason: preflightState === 'healthy' ? undefined : lastReason,
      nextRecoveryAction: describeRecoveryAction(preflightState, lastReason),
      latencyMs: elapsedMs,
    });

    const remainingBudgetMs = totalBudgetMs - elapsedMs;
    const attemptTimeoutMs = Math.max(
      MIN_ATTEMPT_TIMEOUT_MS,
      Math.min(timeoutMs, remainingBudgetMs),
    );

    try {
      const response = await timeoutFetch(
        endpoint,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: method === 'POST' ? JSON.stringify(options.body ?? {}) : undefined,
        },
        attemptTimeoutMs,
      );

      if (!response.ok) {
        lastReason = inferFallbackReason(null, response.status);
        updateHealth(origin, response.status >= 500 ? 'degraded' : 'offline', lastReason);
        emitRuntimeState({
          cloudState: response.status >= 500 ? 'degraded' : 'offline',
          fallbackReason: lastReason,
          endpoint,
          lockedEndpoint: lockedBase,
          phase,
          retrying: retrying && attempt < retries,
          latencyMs: Date.now() - startedAt,
          nextRecoveryAction: describeRecoveryAction(
            response.status >= 500 ? 'degraded' : 'offline',
            lastReason,
          ),
        });
        if (attempt < retries) {
          await wait(220 * Math.pow(2, attempt));
          continue;
        }
        break;
      }

      try {
        const data = (await response.json()) as T;
        updateHealth(origin, 'healthy');
        const latencyMs = Date.now() - startedAt;
        emitRuntimeState({
          cloudState: 'healthy',
          fallbackReason: undefined,
          endpoint,
          lockedEndpoint: lockedBase,
          phase,
          retrying: false,
          latencyMs,
          nextRecoveryAction: describeRecoveryAction('healthy'),
        });
        return {
          ok: true,
          data,
          endpoint,
          lockedEndpoint: lockedBase,
          phase,
          cloudState: 'healthy',
          latencyMs,
          attempts,
          retrying: false,
          nextRecoveryAction: describeRecoveryAction('healthy'),
        };
      } catch {
        lastReason = 'bad_payload';
        updateHealth(origin, 'degraded', lastReason);
        emitRuntimeState({
          cloudState: 'degraded',
          fallbackReason: lastReason,
          endpoint,
          lockedEndpoint: lockedBase,
          phase,
          retrying: retrying && attempt < retries,
          latencyMs: Date.now() - startedAt,
          nextRecoveryAction: describeRecoveryAction('degraded', lastReason),
        });
        if (attempt < retries) {
          await wait(220 * Math.pow(2, attempt));
          continue;
        }
        break;
      }
    } catch (error) {
      lastReason = inferFallbackReason(error);
      updateHealth(origin, lastReason === 'timeout' ? 'degraded' : 'offline', lastReason);
      emitRuntimeState({
        cloudState: lastReason === 'timeout' ? 'degraded' : 'offline',
        fallbackReason: lastReason,
        endpoint,
        lockedEndpoint: lockedBase,
        phase,
        retrying: retrying && attempt < retries,
        latencyMs: Date.now() - startedAt,
        nextRecoveryAction: describeRecoveryAction(
          lastReason === 'timeout' ? 'degraded' : 'offline',
          lastReason,
        ),
      });
      if (attempt < retries) {
        await wait(220 * Math.pow(2, attempt));
        continue;
      }
    }
  }
  const snapshot = healthByOrigin.get(origin);
  lastState = snapshot?.state || (lastReason === 'timeout' ? 'degraded' : lastState);

  const finalLatency = Date.now() - startedAt;
  emitRuntimeState({
    cloudState: lastState,
    fallbackReason: lastReason,
    endpoint,
    lockedEndpoint: lockedBase,
    phase,
    retrying: false,
    latencyMs: finalLatency,
    nextRecoveryAction: describeRecoveryAction(lastState, lastReason),
  });
  return {
    ok: false,
    cloudState: lastState,
    fallbackReason: lastReason,
    endpoint,
    lockedEndpoint: lockedBase,
    phase,
    latencyMs: finalLatency,
    attempts,
    retrying: false,
    nextRecoveryAction: describeRecoveryAction(lastState, lastReason),
  };
};

export const __unsafeResetCloudSession = (): void => {
  lockedCloudEndpointBase = null;
  healthByOrigin.clear();
  latestRuntimeState = {
    cloudState: 'healthy',
    latencyMs: 0,
    retrying: false,
    nextRecoveryAction: 'cloud_available',
    updatedAt: Date.now(),
  };
};
