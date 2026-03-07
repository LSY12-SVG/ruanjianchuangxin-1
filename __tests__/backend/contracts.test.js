const {
  validateInterpretRequest,
  normalizeInterpretResponse,
} = require('../../backend/src/contracts');

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
});
