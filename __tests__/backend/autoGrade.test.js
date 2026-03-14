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
});
