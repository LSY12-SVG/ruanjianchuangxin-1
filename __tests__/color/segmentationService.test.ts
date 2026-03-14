import {requestSegmentation} from '../../src/colorEngine/segmentationService';

describe('segmentation service', () => {
  const sampleImage = {
    uri: 'file:///tmp/test.jpg',
    width: 100,
    height: 100,
    type: 'image/jpeg',
    base64: 'ZmFrZQ==',
    success: true,
  } as const;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses cloud result when endpoint is available', async () => {
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
          model: 'seg-v2',
          latencyMs: 45,
          fallbackUsed: false,
          masks: [{type: 'subject', confidence: 0.8, coverage: 0.5}],
        }),
      } as Response;
    });

    const result = await requestSegmentation({
      image: sampleImage as never,
      endpoint: 'http://192.168.50.20:8787',
    });

    expect(result.model).toBe('seg-v2');
    expect(result.fallbackUsed).toBe(false);
    expect(result.cloudState).toBe('healthy');
    (globalThis as {fetch?: unknown}).fetch = originalFetch;
  });

  it('falls back with reason when cloud request fails', async () => {
    const originalFetch = (globalThis as {fetch?: unknown}).fetch;
    (globalThis as {fetch?: unknown}).fetch = jest
      .fn()
      .mockRejectedValue(new Error('Network request failed'));

    const result = await requestSegmentation({
      image: sampleImage as never,
      endpoint: 'http://192.168.50.20:8787',
    });

    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toBe('host_unreachable');
    (globalThis as {fetch?: unknown}).fetch = originalFetch;
  });
});
