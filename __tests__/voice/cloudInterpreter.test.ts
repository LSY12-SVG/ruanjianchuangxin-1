import {interpretWithCloud} from '../../src/voice/cloudInterpreter';
import {defaultColorGradingParams} from '../../src/types/colorGrading';

describe('cloud interpreter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns normalized response when cloud is available', async () => {
    const originalFetch = (globalThis as {fetch?: unknown}).fetch;
    (globalThis as {fetch?: unknown}).fetch = jest.fn(async (input: RequestInfo | URL) => {
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
        json: async () => ({
          intent_actions: [{action: 'adjust_param', target: 'exposure', delta: 10}],
          confidence: 0.9,
          needsConfirmation: false,
          fallback_used: false,
          reasoning_summary: 'ok',
          message: 'ok',
          source: 'cloud',
        }),
      } as Response;
    });

    const result = await interpretWithCloud(
      {
        mode: 'voice_refine',
        transcript: '亮一点',
        currentParams: defaultColorGradingParams,
        locale: 'zh-CN',
      },
      'http://192.168.50.20:8787',
    );

    expect(result.response).not.toBeNull();
    expect(result.cloudState).toBe('healthy');
    (globalThis as {fetch?: unknown}).fetch = originalFetch;
  });

  it('returns fallback metadata when cloud is unreachable', async () => {
    const originalFetch = (globalThis as {fetch?: unknown}).fetch;
    (globalThis as {fetch?: unknown}).fetch = jest
      .fn()
      .mockRejectedValue(new Error('Network request failed'));

    const result = await interpretWithCloud(
      {
        mode: 'voice_refine',
        transcript: '亮一点',
        currentParams: defaultColorGradingParams,
        locale: 'zh-CN',
      },
      'http://192.168.50.20:8787',
    );

    expect(result.response).toBeNull();
    expect(result.fallbackReason).toBe('host_unreachable');
    (globalThis as {fetch?: unknown}).fetch = originalFetch;
  });

  it('marks response degraded when provider fallback is returned with reason', async () => {
    const originalFetch = (globalThis as {fetch?: unknown}).fetch;
    (globalThis as {fetch?: unknown}).fetch = jest.fn(async (input: RequestInfo | URL) => {
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
        json: async () => ({
          intent_actions: [{action: 'adjust_param', target: 'exposure', delta: 4}],
          confidence: 0.6,
          needsConfirmation: false,
          fallback_used: true,
          fallback_reason: 'timeout',
          reasoning_summary: 'fallback parser',
          message: 'fallback',
          source: 'fallback',
        }),
      } as Response;
    });

    const result = await interpretWithCloud(
      {
        mode: 'voice_refine',
        transcript: '亮一点',
        currentParams: defaultColorGradingParams,
        locale: 'zh-CN',
      },
      'http://192.168.50.20:8787',
    );

    expect(result.response).not.toBeNull();
    expect(result.cloudState).toBe('degraded');
    expect(result.fallbackReason).toBe('timeout');
    (globalThis as {fetch?: unknown}).fetch = originalFetch;
  });
});
