const makeResponse = () => {
  const response = {
    statusCode: 200,
    payload: null,
  };
  response.status = code => {
    response.statusCode = code;
    return response;
  };
  response.json = payload => {
    response.payload = payload;
    return response;
  };
  return response;
};

const setupVirtualExpress = () => {
  jest.doMock(
    'express',
    () => {
      const expressMock = () => ({});
      expressMock.Router = () => {
        const routes = [];
        return {
          routes,
          post(path, handler) {
            routes.push({method: 'post', path, handler});
            return this;
          },
        };
      };
      return expressMock;
    },
    {virtual: true},
  );
};

const getRouteHandler = (router, path) => {
  const route = router.routes.find(item => item.path === path && item.method === 'post');
  if (!route) {
    throw new Error(`route ${path} not found`);
  }
  return route.handler;
};

describe('color intelligence router', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('accepts snake_case interpret request and returns dual response fields', async () => {
    setupVirtualExpress();
    const interpretWithProvider = jest.fn(async () => ({
      actions: [{action: 'adjust_param', target: 'contrast', delta: 8}],
      confidence: 0.86,
      reasoning_summary: 'ok',
      fallback_used: false,
      needsConfirmation: false,
      message: 'done',
      source: 'cloud',
      scene_profile: 'portrait',
      recommended_intensity: 'normal',
      quality_risk_flags: [],
    }));

    jest.doMock('../../backend/src/providers', () => ({
      interpretWithProvider,
      fetchProviderModelIds: jest.fn(async () => ({ok: true, modelIds: ['refine-model'], error: ''})),
    }));

    const {createColorIntelligenceRouter} = require('../../backend/src/colorIntelligence');
    const router = createColorIntelligenceRouter();
    const handler = getRouteHandler(router, '/interpret');
    const res = makeResponse();

    await handler(
      {
        body: {
          mode: 'voice_refine',
          transcript: '对比加一点',
          locale: 'zh-CN',
          current_params: {basic: {}},
          image: {
            mime_type: 'image/jpeg',
            width: 1024,
            height: 768,
            base_64: 'ZmFrZQ==',
          },
          image_stats: {
            luma_mean: 0.4,
            luma_std: 0.2,
            highlight_clip_pct: 0.02,
            shadow_clip_pct: 0.03,
            saturation_mean: 0.35,
          },
        },
      },
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(interpretWithProvider).toHaveBeenCalledTimes(1);
    expect(res.payload.actions).toHaveLength(1);
    expect(res.payload.intent_actions).toHaveLength(1);
    expect(res.payload.reasoningSummary).toBe('ok');
    expect(res.payload.reasoning_summary).toBe('ok');
  });

  test('accepts snake_case auto-grade request and forwards normalized payload', async () => {
    setupVirtualExpress();
    const runAutoGrade = jest.fn(async () => ({
      phase: 'fast',
      sceneProfile: 'general',
      confidence: 0.8,
      globalActions: [],
      localMaskPlan: [],
      qualityRiskFlags: [],
      explanation: 'ok',
      fallbackUsed: false,
      cloudState: 'healthy',
      latencyMs: 120,
      nextRecoveryAction: 'cloud_available',
    }));

    jest.doMock('../../backend/src/autoGrade', () => ({
      validateAutoGradeRequest: jest.fn(() => ({ok: true})),
      runAutoGrade,
      conservativeFallbackResult: jest.fn(() => ({
        phase: 'fast',
        sceneProfile: 'general',
        confidence: 0.5,
        globalActions: [],
        localMaskPlan: [],
        qualityRiskFlags: [],
        explanation: 'fallback',
        fallbackUsed: true,
        fallbackReason: 'unknown',
        cloudState: 'degraded',
        latencyMs: 0,
        nextRecoveryAction: 'retry_with_backoff',
      })),
      getAutoGradePhaseRuntimeConfig: jest.fn(() => ({
        fast: {timeoutMs: 5000, totalBudgetMs: 5500},
        refine: {timeoutMs: 50000, totalBudgetMs: 50000},
      })),
      getAutoGradeModelConfig: jest.fn(() => ({
        fastModelChain: ['fast-model'],
        refineModelChain: ['refine-model'],
      })),
    }));

    jest.doMock('../../backend/src/providers', () => ({
      interpretWithProvider: jest.fn(),
      fetchProviderModelIds: jest.fn(async () => ({ok: true, modelIds: ['refine-model'], error: ''})),
    }));

    const {createColorIntelligenceRouter} = require('../../backend/src/colorIntelligence');
    const router = createColorIntelligenceRouter();
    const handler = getRouteHandler(router, '/auto-grade');
    const res = makeResponse();

    await handler(
      {
        body: {
          mode: 'upload_autograde',
          phase: 'fast',
          locale: 'zh-CN',
          current_params: {basic: {}},
          image: {
            mime_type: 'image/jpeg',
            width: 800,
            height: 600,
            base_64: 'ZmFrZQ==',
            payload_bytes: 128,
            encode_quality: 82,
          },
          image_stats: {
            luma_mean: 0.4,
            luma_std: 0.2,
            highlight_clip_pct: 0.02,
            shadow_clip_pct: 0.03,
            saturation_mean: 0.35,
          },
        },
      },
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(runAutoGrade).toHaveBeenCalledTimes(1);
    expect(runAutoGrade.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        currentParams: {basic: {}},
        image: expect.objectContaining({
          mimeType: 'image/jpeg',
          payloadBytes: 128,
          encodeQuality: 82,
        }),
      }),
    );
    expect(res.payload.sceneProfile).toBe('general');
    expect(res.payload.scene_profile).toBe('general');
    expect(res.payload.fallbackUsed).toBe(false);
    expect(res.payload.fallback_used).toBe(false);
  });

  test('accepts snake_case segmentation request and returns dual response fields', async () => {
    setupVirtualExpress();
    jest.doMock('../../backend/src/providers', () => ({
      interpretWithProvider: jest.fn(),
      fetchProviderModelIds: jest.fn(async () => ({ok: true, modelIds: ['refine-model'], error: ''})),
    }));

    const {createColorIntelligenceRouter} = require('../../backend/src/colorIntelligence');
    const router = createColorIntelligenceRouter();
    const handler = getRouteHandler(router, '/segment');
    const res = makeResponse();

    await handler(
      {
        body: {
          image: {
            mime_type: 'image/jpeg',
            base_64: 'ZmFrZQ==',
            width: 640,
            height: 480,
          },
        },
      },
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.payload.masks)).toBe(true);
    expect(res.payload.latencyMs).toBeGreaterThanOrEqual(0);
    expect(res.payload.latency_ms).toBeGreaterThanOrEqual(0);
  });
});
