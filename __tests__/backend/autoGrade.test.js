describe('backend auto grade phases', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('runs fast phase within fast-pass contract', async () => {
    const interpretWithProvider = jest.fn(async () => ({
      intent_actions: [{action: 'adjust_param', target: 'exposure', delta: 6}],
      confidence: 0.8,
      fallback_used: false,
      scene_profile: 'general',
      quality_risk_flags: [],
      analysis_summary: 'fast ok',
    }));
    jest.doMock('../../backend/src/providers', () => ({
      interpretWithProvider,
    }));
    jest.doMock('../../backend/src/segmentation/service', () => ({
      createSegmentationResult: () => ({
        model: 'seg',
        masks: [{type: 'subject', confidence: 0.8, coverage: 0.4}],
      }),
    }));

    const {runAutoGrade} = require('../../backend/src/autoGrade');
    const result = await runAutoGrade({
      mode: 'upload_autograde',
      phase: 'fast',
      locale: 'zh-CN',
      currentParams: {},
      image: {width: 100, height: 100, base64: 'ZmFrZQ==', mimeType: 'image/jpeg'},
      imageStats: {
        lumaMean: 0.4,
        lumaStd: 0.2,
        highlightClipPct: 0.02,
        shadowClipPct: 0.02,
        saturationMean: 0.35,
      },
    });

    expect(result.phase).toBe('fast');
    expect(interpretWithProvider).toHaveBeenCalledTimes(1);
    expect(result.phaseTimeoutMs).toBe(5000);
    expect(result.phaseBudgetMs).toBe(5500);
  });

  it('returns refine phase payload independently', async () => {
    const interpretWithProvider = jest.fn(async () => ({
      intent_actions: [{action: 'adjust_param', target: 'contrast', delta: 4}],
      confidence: 0.76,
      fallback_used: false,
      scene_profile: 'portrait',
      quality_risk_flags: ['skin_tone_shift_risk'],
      analysis_summary: 'refine ok',
    }));
    jest.doMock('../../backend/src/providers', () => ({
      interpretWithProvider,
    }));
    jest.doMock('../../backend/src/segmentation/service', () => ({
      createSegmentationResult: () => ({
        model: 'seg',
        masks: [{type: 'skin', confidence: 0.8, coverage: 0.2}],
      }),
    }));

    const {runAutoGrade} = require('../../backend/src/autoGrade');
    const result = await runAutoGrade({
      mode: 'upload_autograde',
      phase: 'refine',
      locale: 'zh-CN',
      currentParams: {},
      image: {width: 100, height: 100, base64: 'ZmFrZQ==', mimeType: 'image/jpeg'},
      imageStats: {
        lumaMean: 0.4,
        lumaStd: 0.2,
        highlightClipPct: 0.02,
        shadowClipPct: 0.02,
        saturationMean: 0.35,
      },
    });

    expect(result.phase).toBe('refine');
    expect(result.globalActions.length).toBeGreaterThan(0);
    expect(interpretWithProvider).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        timeoutMs: 50000,
        totalBudgetMs: 50000,
      }),
    );
    expect(result.phaseTimeoutMs).toBe(50000);
    expect(result.phaseBudgetMs).toBe(50000);
  });

  it('keeps auto-grade camelCase and snake_case fields consistent in compatibility adapter', () => {
    const {withAutoGradeCompat} = require('../../backend/src/colorIntelligence/adapters/compat');
    const compat = withAutoGradeCompat({
      phase: 'fast',
      sceneProfile: 'general',
      confidence: 0.84,
      globalActions: [{action: 'adjust_param', target: 'exposure', delta: 4}],
      localMaskPlan: [{maskType: 'subject', actions: [{target: 'contrast', delta: 2}]}],
      qualityRiskFlags: ['highlight_clip_risk'],
      explanation: 'ok',
      fallbackUsed: false,
      fallbackReason: '',
      cloudState: 'healthy',
      latencyMs: 108,
      endpoint: '/v1/color/auto-grade',
      phaseTimeoutMs: 5000,
      phaseBudgetMs: 5500,
      payloadBytes: 2048,
      encodeQuality: 82,
      mimeType: 'image/jpeg',
      modelUsed: 'fast-model',
      modelRoute: 'fast-model',
    });

    expect(compat.sceneProfile).toBe(compat.scene_profile);
    expect(compat.globalActions).toEqual(compat.global_actions);
    expect(compat.localMaskPlan).toEqual(compat.local_mask_plan);
    expect(compat.qualityRiskFlags).toEqual(compat.quality_risk_flags);
    expect(compat.fallbackUsed).toBe(compat.fallback_used);
    expect(compat.fallbackReason).toBe(compat.fallback_reason);
    expect(compat.cloudState).toBe(compat.cloud_state);
    expect(compat.latencyMs).toBe(compat.latency_ms);
    expect(compat.phaseTimeoutMs).toBe(compat.phase_timeout_ms);
    expect(compat.phaseBudgetMs).toBe(compat.phase_budget_ms);
    expect(compat.payloadBytes).toBe(compat.payload_bytes);
    expect(compat.encodeQuality).toBe(compat.encode_quality);
    expect(compat.mimeType).toBe(compat.mime_type);
    expect(compat.modelUsed).toBe(compat.model_used);
    expect(compat.modelRoute).toBe(compat.model_route);
  });
});
