const {
  validateInterpretRequest,
  normalizeInterpretResponse,
} = require('../../backend/src/contracts');
const {withInterpretCompat} = require('../../backend/src/colorIntelligence/adapters/compat');

describe('backend contracts', () => {
  it('validates request with image and stats', () => {
    const result = validateInterpretRequest({
      mode: 'voice_refine',
      transcript: '更电影感但别太黄',
      locale: 'zh-CN',
      currentParams: {basic: {}, colorBalance: {}, pro: {}},
      image: {
        mimeType: 'image/jpeg',
        width: 1024,
        height: 768,
        base64: 'abc',
      },
      imageStats: {
        lumaMean: 0.5,
        lumaStd: 0.2,
        highlightClipPct: 0.02,
        shadowClipPct: 0.03,
        saturationMean: 0.4,
      },
    });

    expect(result.ok).toBe(true);
  });

  it('accepts empty transcript in initial_visual_suggest mode', () => {
    const result = validateInterpretRequest({
      mode: 'initial_visual_suggest',
      transcript: '',
      locale: 'zh-CN',
      currentParams: {basic: {}, colorBalance: {}, pro: {}},
      image: {
        mimeType: 'image/jpeg',
        width: 1024,
        height: 768,
        base64: 'abc',
      },
      imageStats: {
        lumaMean: 0.5,
        lumaStd: 0.2,
        highlightClipPct: 0.02,
        shadowClipPct: 0.03,
        saturationMean: 0.4,
      },
    });

    expect(result.ok).toBe(true);
  });

  it('normalizes analysis fields from provider payload', () => {
    const normalized = normalizeInterpretResponse({
      actions: [{action: 'adjust_param', target: 'contrast', delta: 8}],
      confidence: 0.8,
      reasoning_summary: 'ok',
      fallback_used: false,
      needsConfirmation: false,
      message: 'ok',
      source: 'cloud',
      analysis_summary: '高光略高，建议温和压制',
      applied_profile: 'landscape',
    });

    expect(normalized).not.toBeNull();
    expect(normalized.analysis_summary).toContain('高光');
    expect(normalized.applied_profile).toBe('landscape');
  });

  it('accepts action items without explicit action field', () => {
    const normalized = normalizeInterpretResponse({
      global_actions: [
        {target: 'exposure', delta: 0.2},
        {param: 'highlight', change: -10},
      ],
      confidence: 0.7,
      reasoning_summary: 'ok',
      fallback_used: false,
      needsConfirmation: false,
      message: 'ok',
      source: 'cloud',
    });

    expect(normalized).not.toBeNull();
    expect(normalized.intent_actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({action: 'adjust_param', target: 'exposure'}),
        expect.objectContaining({action: 'adjust_param', target: 'highlights'}),
      ]),
    );
  });

  it('accepts object-style global actions payload', () => {
    const normalized = normalizeInterpretResponse({
      globalActions: {
        exposure: 0.15,
        contrast: {delta: 8},
        temp: {value: -4},
      },
      confidence: 0.7,
      reasoning_summary: 'ok',
      fallback_used: false,
      needsConfirmation: false,
      message: 'ok',
      source: 'cloud',
    });

    expect(normalized).not.toBeNull();
    expect(normalized.intent_actions.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps interpret camelCase and snake_case fields consistent in compatibility adapter', () => {
    const compat = withInterpretCompat({
      intent_actions: [{action: 'adjust_param', target: 'contrast', delta: 6}],
      confidence: 0.81,
      reasoning_summary: 'ok',
      fallback_used: false,
      needsConfirmation: false,
      message: 'ok',
      source: 'cloud',
      scene_profile: 'portrait',
      quality_risk_flags: ['skin_tone_shift_risk'],
      recommended_intensity: 'normal',
    });

    expect(compat.actions).toEqual(compat.intent_actions);
    expect(compat.reasoningSummary).toBe(compat.reasoning_summary);
    expect(compat.fallbackUsed).toBe(compat.fallback_used);
    expect(compat.sceneProfile).toBe(compat.scene_profile);
    expect(compat.qualityRiskFlags).toEqual(compat.quality_risk_flags);
    expect(compat.recommendedIntensity).toBe(compat.recommended_intensity);
  });
});
