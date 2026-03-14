import {requestAutoGrade} from '../../src/colorEngine/autoGradeService';
import {defaultColorGradingParams} from '../../src/types/colorGrading';

jest.mock('../../src/cloud/endpointResolver', () => ({
  requestCloudJson: jest.fn(),
}));

const {requestCloudJson} = jest.requireMock('../../src/cloud/endpointResolver') as {
  requestCloudJson: jest.Mock;
};

const baseRequest = {
  mode: 'upload_autograde' as const,
  locale: 'zh-CN',
  currentParams: defaultColorGradingParams,
  image: {
    mimeType: 'image/jpeg',
    width: 100,
    height: 100,
    base64: 'ZmFrZQ==',
  },
  imageStats: {
    lumaMean: 0.45,
    lumaStd: 0.2,
    highlightClipPct: 0.02,
    shadowClipPct: 0.03,
    saturationMean: 0.35,
  },
};

describe('auto grade service', () => {
  beforeEach(() => {
    requestCloudJson.mockReset();
  });

  it('returns conservative fallback actions for fast phase failures', async () => {
    requestCloudJson.mockResolvedValue({
      ok: false,
      cloudState: 'degraded',
      fallbackReason: 'timeout',
      latencyMs: 3200,
      endpoint: 'http://127.0.0.1:8787/v1/color/auto-grade',
      lockedEndpoint: 'http://127.0.0.1:8787',
      nextRecoveryAction: 'retry_with_backoff',
    });

    const result = await requestAutoGrade({
      ...baseRequest,
      phase: 'fast',
    });

    expect(result.phase).toBe('fast');
    expect(result.fallbackUsed).toBe(true);
    expect(result.globalActions.length).toBeGreaterThan(0);
    expect(result.lockedEndpoint).toBe('http://127.0.0.1:8787');
    expect(requestCloudJson).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'fast',
        timeoutMs: 5000,
        retries: 0,
        healthTimeoutMs: 700,
        totalBudgetMs: 5500,
      }),
    );
  });

  it('skips conservative fallback actions for refine phase failures', async () => {
    requestCloudJson.mockResolvedValue({
      ok: false,
      cloudState: 'degraded',
      fallbackReason: 'timeout',
      latencyMs: 4200,
      endpoint: 'http://127.0.0.1:8787/v1/color/auto-grade',
      lockedEndpoint: 'http://127.0.0.1:8787',
      nextRecoveryAction: 'retry_with_backoff',
    });

    const result = await requestAutoGrade({
      ...baseRequest,
      phase: 'refine',
    });

    expect(result.phase).toBe('refine');
    expect(result.fallbackUsed).toBe(true);
    expect(result.globalActions).toEqual([]);
    expect(result.localMaskPlan).toEqual([]);
    expect(requestCloudJson).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'refine',
        timeoutMs: 50000,
        retries: 0,
        healthTimeoutMs: 700,
        totalBudgetMs: 50000,
      }),
    );
  });

  it('maps backend fallback metadata to degraded cloud state when http is healthy', async () => {
    requestCloudJson.mockResolvedValue({
      ok: true,
      cloudState: 'healthy',
      latencyMs: 680,
      endpoint: 'http://127.0.0.1:8787/v1/color/auto-grade',
      lockedEndpoint: 'http://127.0.0.1:8787',
      nextRecoveryAction: 'cloud_available',
      data: {
        phase: 'refine',
        sceneProfile: 'portrait',
        confidence: 0.7,
        globalActions: [{action: 'adjust_param', target: 'exposure', delta: 4}],
        localMaskPlan: [],
        qualityRiskFlags: [],
        explanation: 'fallback parser used',
        fallback_used: true,
        fallback_reason: 'timeout',
      },
    });

    const result = await requestAutoGrade({
      ...baseRequest,
      phase: 'refine',
    });

    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toBe('timeout');
    expect(result.cloudState).toBe('degraded');
    expect(result.nextRecoveryAction).toBe('retry_with_backoff');
  });
});
