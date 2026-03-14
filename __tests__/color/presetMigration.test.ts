import {defaultColorGradingParams} from '../../src/types/colorGrading';
import {
  fromGradePresetV2,
  migrateV1PresetToV2,
  makeFallbackBrushMask,
} from '../../src/colorEngine/presetMigration';

describe('presetMigration', () => {
  it('migrates V1 params into a pro-compatible V2 preset without losing core params', () => {
    const preset = migrateV1PresetToV2(defaultColorGradingParams, 'preset_original');
    const restored = fromGradePresetV2(preset);

    expect(preset.metadata.version).toBe(2);
    expect(preset.metadata.engine).toBe('pro');
    expect(restored).toEqual(defaultColorGradingParams);
  });

  it('creates a fallback brush mask for segmentation degradation', () => {
    const mask = makeFallbackBrushMask();

    expect(mask.type).toBe('brush');
    expect(mask.enabled).toBe(true);
    expect(mask.adjustments.clarity).toBeGreaterThan(0);
  });
});
