const {normalizeInterpretRequest} = require('../../backend/src/colorIntelligence/contracts/interpret');
const {normalizeAutoGradeRequest} = require('../../backend/src/colorIntelligence/contracts/autoGrade');
const {normalizeSegmentationRequest} = require('../../backend/src/colorIntelligence/contracts/segmentation');
const {
  withInterpretCompat,
  withAutoGradeCompat,
  withSegmentationCompat,
} = require('../../backend/src/colorIntelligence/adapters/compat');

describe('color intelligence contracts and adapters', () => {
  test('normalizes snake_case interpret request payload', () => {
    const normalized = normalizeInterpretRequest({
      mode: 'voice_refine',
      transcript: '亮一点',
      locale: 'zh-CN',
      current_params: {basic: {}},
      scene_hints: ['portrait'],
      image: {
        mime_type: 'image/jpeg',
        width: 1280,
        height: 720,
        base_64: 'ZmFrZQ==',
      },
      image_stats: {
        luma_mean: 0.4,
        luma_std: 0.2,
        highlight_clip_pct: 0.02,
        shadow_clip_pct: 0.03,
        saturation_mean: 0.35,
      },
    });

    expect(normalized.currentParams).toEqual({basic: {}});
    expect(normalized.sceneHints).toEqual(['portrait']);
    expect(normalized.image.mimeType).toBe('image/jpeg');
    expect(normalized.image.base64).toBe('ZmFrZQ==');
    expect(normalized.imageStats.saturationMean).toBe(0.35);
  });

  test('normalizes snake_case auto-grade request payload', () => {
    const normalized = normalizeAutoGradeRequest({
      mode: 'upload_autograde',
      phase: 'fast',
      locale: 'zh-CN',
      current_params: {basic: {}},
      image: {
        mime_type: 'image/jpeg',
        width: 1200,
        height: 800,
        base_64: 'ZmFrZQ==',
        payload_bytes: 1024,
        encode_quality: 82,
      },
      image_stats: {
        luma_mean: 0.4,
        luma_std: 0.2,
        highlight_clip_pct: 0.02,
        shadow_clip_pct: 0.03,
        saturation_mean: 0.35,
      },
    });

    expect(normalized.currentParams).toEqual({basic: {}});
    expect(normalized.image.mimeType).toBe('image/jpeg');
    expect(normalized.image.payloadBytes).toBe(1024);
    expect(normalized.image.encodeQuality).toBe(82);
    expect(normalized.imageStats.lumaMean).toBe(0.4);
  });

  test('normalizes snake_case segmentation request payload', () => {
    const normalized = normalizeSegmentationRequest({
      image: {
        mime_type: 'image/jpeg',
        base_64: 'ZmFrZQ==',
        width: 640,
        height: 480,
      },
    });

    expect(normalized.image.mimeType).toBe('image/jpeg');
    expect(normalized.image.base64).toBe('ZmFrZQ==');
  });

  test('adds camelCase and snake_case aliases for interpret response', () => {
    const compat = withInterpretCompat({
      intent_actions: [{action: 'adjust_param', target: 'contrast', delta: 8}],
      confidence: 0.9,
      fallback_used: false,
      reasoning_summary: 'ok',
      needsConfirmation: false,
      message: 'done',
      source: 'cloud',
      scene_profile: 'portrait',
    });

    expect(compat.actions).toHaveLength(1);
    expect(compat.intent_actions).toHaveLength(1);
    expect(compat.reasoningSummary).toBe('ok');
    expect(compat.reasoning_summary).toBe('ok');
    expect(compat.fallbackUsed).toBe(false);
    expect(compat.fallback_used).toBe(false);
  });

  test('adds camelCase and snake_case aliases for auto-grade and segmentation responses', () => {
    const autoGradeCompat = withAutoGradeCompat({
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
    });
    expect(autoGradeCompat.scene_profile).toBe('general');
    expect(autoGradeCompat.cloud_state).toBe('healthy');
    expect(autoGradeCompat.global_actions).toEqual([]);

    const segmentationCompat = withSegmentationCompat({
      model: 'seg',
      latencyMs: 12,
      fallbackUsed: false,
      masks: [],
    });
    expect(segmentationCompat.latency_ms).toBe(12);
    expect(segmentationCompat.fallback_used).toBe(false);
  });
});
