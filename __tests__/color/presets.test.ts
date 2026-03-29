import {
  BUILTIN_PRESETS,
  COLOR_PARAM_SPECS,
  defaultColorGradingParams,
  type ColorParamKey,
} from '../../src/types/colorGrading';

const EXPECTED_NEW_PRESET_IDS = [
  'preset_night_clarity',
  'preset_black_gold_film',
  'preset_portrait_clear',
  'preset_documentary_film',
  'preset_japanese_creamy',
  'preset_cyber_neon',
] as const;

const getParamValue = (
  params: typeof defaultColorGradingParams,
  key: ColorParamKey,
): number => {
  if (key in params.basic) {
    return params.basic[key as keyof typeof params.basic];
  }
  if (key in params.colorBalance) {
    return params.colorBalance[key as keyof typeof params.colorBalance];
  }
  switch (key) {
    case 'curve_master':
      return (params.pro.curves.master[2] - 0.5) * 200;
    case 'curve_r':
      return (params.pro.curves.r[2] - 0.5) * 200;
    case 'curve_g':
      return (params.pro.curves.g[2] - 0.5) * 200;
    case 'curve_b':
      return (params.pro.curves.b[2] - 0.5) * 200;
    case 'wheel_shadows':
      return params.pro.wheels.shadows.luma;
    case 'wheel_midtones':
      return params.pro.wheels.midtones.luma;
    case 'wheel_highlights':
      return params.pro.wheels.highlights.luma;
    default:
      return 0;
  }
};

describe('built-in presets', () => {
  it('includes original presets and 6 new expanded presets', () => {
    expect(BUILTIN_PRESETS.length).toBeGreaterThanOrEqual(12);
    const presetIds = new Set(BUILTIN_PRESETS.map(item => item.id));
    EXPECTED_NEW_PRESET_IDS.forEach(id => {
      expect(presetIds.has(id)).toBe(true);
    });
  });

  it('contains complete 14-parameter vectors in range', () => {
    BUILTIN_PRESETS.forEach(preset => {
      (Object.keys(COLOR_PARAM_SPECS) as ColorParamKey[]).forEach(key => {
        const value = getParamValue(preset.params, key);
        const spec = COLOR_PARAM_SPECS[key];
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(spec.min);
        expect(value).toBeLessThanOrEqual(spec.max);
      });
    });
  });
});
