import {NativeModules} from 'react-native';
import {
  __unsafeResetCloudSession,
  requestCloudJson,
  resolveCloudEndpointsForService,
  setCloudEndpointOverride,
} from '../../src/cloud/endpointResolver';

const toAbortError = (): Error => {
  const error = new Error('aborted');
  (error as Error & {name: string}).name = 'AbortError';
  return error;
};

describe('cloud endpoint resolver', () => {
  beforeEach(() => {
    setCloudEndpointOverride(null);
    __unsafeResetCloudSession();
    NativeModules.SourceCode.scriptURL =
      'http://127.0.0.1:8081/index.bundle?platform=android&dev=true';
    jest.restoreAllMocks();
  });

  it('resolves endpoint priority as explicit > LAN > loopback', () => {
    NativeModules.SourceCode.scriptURL =
      'http://192.168.50.10:8081/index.bundle?platform=android&dev=true';

    const endpoints = resolveCloudEndpointsForService(
      '/v1/color/segment',
      'http://192.168.50.20:8787',
    );

    expect(endpoints).toEqual([
      'http://192.168.50.20:8787/v1/color/segment',
      'http://192.168.50.10:8787/v1/color/segment',
      'http://127.0.0.1:8787/v1/color/segment',
    ]);
  });

  it('keeps one locked endpoint for the whole session (no jitter)', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ok: true}),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ok: true}),
      } as Response;
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const first = await requestCloudJson({
      servicePath: '/v1/color/interpret',
      explicitEndpoint: 'http://192.168.50.20:8787',
      method: 'POST',
      body: {},
      timeoutMs: 1200,
      retries: 0,
    });
    const second = await requestCloudJson({
      servicePath: '/v1/color/segment',
      method: 'POST',
      body: {},
      timeoutMs: 1200,
      retries: 0,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.lockedEndpoint).toBe('http://192.168.50.20:8787');
    expect(second.lockedEndpoint).toBe('http://192.168.50.20:8787');
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('127.0.0.1'))).toBe(false);
    globalThis.fetch = originalFetch;
  });

  it('enforces hard deadline and reports timeout', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ok: true}),
        } as Response);
      }
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(toAbortError()));
      });
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const result = await requestCloudJson({
      servicePath: '/v1/color/auto-grade',
      method: 'POST',
      body: {},
      timeoutMs: 900,
      retries: 1,
      totalBudgetMs: 1500,
      phase: 'fast',
    });

    expect(result.ok).toBe(false);
    expect(result.fallbackReason).toBe('timeout');
    expect(result.phase).toBe('fast');
    globalThis.fetch = originalFetch;
  });
});
