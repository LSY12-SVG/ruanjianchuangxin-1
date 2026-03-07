import {isValidInterpretRequest, normalizeInterpretResponse} from '../../src/voice/contracts';

describe('voice contracts', () => {
  it('validates interpret request shape', () => {
    expect(
      isValidInterpretRequest({
        transcript: '亮一点',
        locale: 'zh-CN',
        currentParams: {
          basic: {
            exposure: 0,
            contrast: 0,
            brightness: 0,
            highlights: 0,
            shadows: 0,
            whites: 0,
            blacks: 0,
          },
          colorBalance: {
            temperature: 0,
            tint: 0,
            redBalance: 0,
            greenBalance: 0,
            blueBalance: 0,
            vibrance: 0,
            saturation: 0,
          },
        },
        image: {
          mimeType: 'image/jpeg',
          width: 1024,
          height: 768,
          base64: 'abc123',
        },
        imageStats: {
          lumaMean: 0.5,
          lumaStd: 0.21,
          highlightClipPct: 0.03,
          shadowClipPct: 0.02,
          saturationMean: 0.4,
        },
      }),
    ).toBe(true);
  });

  it('accepts empty transcript in initial_visual_suggest mode', () => {
    expect(
      isValidInterpretRequest({
        mode: 'initial_visual_suggest',
        transcript: '',
        locale: 'zh-CN',
        currentParams: {basic: {}, colorBalance: {}, pro: {}},
        image: {
          mimeType: 'image/jpeg',
          width: 800,
          height: 600,
          base64: 'abc',
        },
        imageStats: {
          lumaMean: 0.5,
          lumaStd: 0.2,
          highlightClipPct: 0.01,
          shadowClipPct: 0.01,
          saturationMean: 0.35,
        },
      }),
    ).toBe(true);
  });

  it('normalizes snake_case cloud payload', () => {
    const payload = {
      intent_actions: [
        {
          action: 'adjust_param',
          target: 'brightness',
          delta: 10,
        },
      ],
      confidence: 0.9,
      reasoning_summary: 'matched',
      fallback_used: false,
      needsConfirmation: true,
      message: 'ok',
      source: 'cloud',
      analysis_summary: '人像轻微过曝，建议压高光并提中间调',
      applied_profile: 'portrait',
    };

    const normalized = normalizeInterpretResponse(payload);
    expect(normalized).not.toBeNull();
    expect(normalized?.actions[0]).toMatchObject({target: 'brightness'});
    expect(normalized?.analysisSummary).toContain('人像');
    expect(normalized?.appliedProfile).toBe('portrait');
  });

  it('normalizes alias action/target from cloud payload', () => {
    const payload = {
      actions: [
        {
          action: 'increase',
          target: '亮度',
          value: 15,
        },
      ],
      confidence: '0.8',
      reasoningSummary: 'alias mapped',
      fallbackUsed: false,
      source: 'cloud',
    };

    const normalized = normalizeInterpretResponse(payload);
    expect(normalized).not.toBeNull();
    expect(normalized?.actions[0]).toMatchObject({
      action: 'adjust_param',
      target: 'brightness',
      delta: 15,
    });
  });

  it('normalizes extended target aliases', () => {
    const payload = {
      actions: [
        {
          action: 'decrease',
          target: '高光',
          amount: 12,
        },
      ],
      confidence: 0.9,
      reasoningSummary: 'extended alias',
      fallbackUsed: false,
      source: 'cloud',
    };

    const normalized = normalizeInterpretResponse(payload);
    expect(normalized).not.toBeNull();
    expect(normalized?.actions[0]).toMatchObject({
      action: 'adjust_param',
      target: 'highlights',
      delta: -12,
    });
  });

  it('normalizes pro target aliases', () => {
    const payload = {
      actions: [
        {
          action: 'adjust_param',
          target: '阴影色轮',
          delta: -12,
        },
      ],
      confidence: 0.9,
      reasoningSummary: 'pro alias',
      fallbackUsed: false,
      source: 'cloud',
    };

    const normalized = normalizeInterpretResponse(payload);
    expect(normalized).not.toBeNull();
    expect(normalized?.actions[0]).toMatchObject({
      action: 'adjust_param',
      target: 'wheel_shadows',
      delta: -12,
    });
  });

  it('drops invalid actions but keeps valid ones', () => {
    const payload = {
      actions: [
        {
          action: 'invalid_action',
          target: 'brightness',
          delta: 10,
        },
        {
          action: 'set_param',
          target: 'contrast',
          value: 20,
        },
      ],
      confidence: 0.7,
      reasoning_summary: 'partial valid',
      fallback_used: false,
      message: 'ok',
    };

    const normalized = normalizeInterpretResponse(payload);
    expect(normalized).not.toBeNull();
    expect(normalized?.actions).toHaveLength(1);
    expect(normalized?.actions[0]).toMatchObject({
      action: 'set_param',
      target: 'contrast',
      value: 20,
    });
  });
});
