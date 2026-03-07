import {applyVoiceInterpretation} from '../../src/voice/paramApplier';
import {defaultColorGradingParams} from '../../src/types/colorGrading';

describe('applyVoiceInterpretation', () => {
  it('applies exposure delta with decimal precision', () => {
    const next = applyVoiceInterpretation(defaultColorGradingParams, {
      actions: [{action: 'adjust_param', target: 'exposure', delta: 0.3}],
      confidence: 0.9,
      needsConfirmation: true,
      fallbackUsed: false,
      reasoningSummary: 'test',
      message: 'test',
      source: 'local',
    });

    expect(next.basic.exposure).toBeCloseTo(0.3, 5);
  });

  it('clamps exposure and channel values in range', () => {
    const next = applyVoiceInterpretation(defaultColorGradingParams, {
      actions: [
        {action: 'set_param', target: 'exposure', value: 8},
        {action: 'set_param', target: 'blueBalance', value: -300},
      ],
      confidence: 0.9,
      needsConfirmation: true,
      fallbackUsed: false,
      reasoningSummary: 'test',
      message: 'test',
      source: 'local',
    });

    expect(next.basic.exposure).toBe(2);
    expect(next.colorBalance.blueBalance).toBe(-100);
  });

  it('applies pro curve and wheel targets', () => {
    const next = applyVoiceInterpretation(defaultColorGradingParams, {
      actions: [
        {action: 'adjust_param', target: 'curve_master', delta: 20},
        {action: 'adjust_param', target: 'wheel_shadows', delta: -15},
      ],
      confidence: 0.9,
      needsConfirmation: false,
      fallbackUsed: false,
      reasoningSummary: 'pro apply',
      message: 'ok',
      source: 'cloud',
    });

    expect(next.pro.curves.master[2]).toBeGreaterThan(0.5);
    expect(next.pro.wheels.shadows.luma).toBeLessThan(0);
    expect(next.pro.wheels.shadows.sat).toBeGreaterThanOrEqual(0);
  });
});
