import {defaultColorGradingParams, type ColorGradingParams} from '../../types/colorGrading';
import {
  defaultHslSecondaryAdjustments,
  type GradePresetV2,
  type HslSecondaryAdjustments,
  type LocalMaskLayer,
} from '../../types/colorEngine';
import {migrateV1PresetToV2} from '../presetMigration';

export const cloneColorParams = (
  params: ColorGradingParams = defaultColorGradingParams,
): ColorGradingParams => ({
  basic: {...params.basic},
  colorBalance: {...params.colorBalance},
  pro: {
    curves: {
      master: [...params.pro.curves.master] as typeof params.pro.curves.master,
      r: [...params.pro.curves.r] as typeof params.pro.curves.r,
      g: [...params.pro.curves.g] as typeof params.pro.curves.g,
      b: [...params.pro.curves.b] as typeof params.pro.curves.b,
    },
    wheels: {
      shadows: {...params.pro.wheels.shadows},
      midtones: {...params.pro.wheels.midtones},
      highlights: {...params.pro.wheels.highlights},
    },
  },
});

export const buildPresetBundle = (
  params: ColorGradingParams,
  localMasks: LocalMaskLayer[],
): GradePresetV2 => {
  const preset = migrateV1PresetToV2(params, 'active_edit');
  return {
    ...preset,
    localMasks: [...localMasks],
  };
};

export const mergeHslAdjustments = (
  source?: Partial<HslSecondaryAdjustments>,
): HslSecondaryAdjustments => ({
  ...defaultHslSecondaryAdjustments(),
  ...source,
});
