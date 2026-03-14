import {
  defaultColorGradingParams,
  type ColorGradingParams,
  type ToneCurves,
  type ColorWheels,
} from '../types/colorGrading';
import {
  defaultHslSecondaryAdjustments,
  defaultMaskAdjustments,
  type GradePresetV2,
  type LocalMaskLayer,
} from '../types/colorEngine';

const cloneCurves = (curves: ToneCurves): ToneCurves => ({
  master: [...curves.master] as ToneCurves['master'],
  r: [...curves.r] as ToneCurves['r'],
  g: [...curves.g] as ToneCurves['g'],
  b: [...curves.b] as ToneCurves['b'],
});

const cloneWheels = (wheels: ColorWheels): ColorWheels => ({
  shadows: {...wheels.shadows},
  midtones: {...wheels.midtones},
  highlights: {...wheels.highlights},
});

export const makeFallbackBrushMask = (): LocalMaskLayer => ({
  id: `brush_${Date.now()}`,
  type: 'brush',
  enabled: true,
  strength: 0.6,
  confidence: 1,
  feather: 0.45,
  density: 0.85,
  invert: false,
  edgeAwareRefine: 0.35,
  source: 'fallback',
  adjustments: {
    ...defaultMaskAdjustments(),
    exposure: 0.15,
    saturation: 6,
    clarity: 8,
  },
});

export const toGradePresetV2 = (
  params: ColorGradingParams,
  options?: {
    id?: string;
    name?: string;
    sourcePresetId?: string;
    localMasks?: LocalMaskLayer[];
  },
): GradePresetV2 => ({
  id: options?.id || `preset_v2_${Date.now()}`,
  name: options?.name || '未命名专业预设',
  global: {
    basic: {...params.basic},
    colorBalance: {...params.colorBalance},
  },
  curve: cloneCurves(params.pro.curves),
  wheels: cloneWheels(params.pro.wheels),
  hsl: defaultHslSecondaryAdjustments(),
  localMasks: [...(options?.localMasks || [])],
  metadata: {
    version: 2,
    engine: 'pro',
    semanticVersion: 2,
    createdAt: new Date().toISOString(),
    sourcePresetId: options?.sourcePresetId,
  },
});

export const fromGradePresetV2 = (preset: GradePresetV2): ColorGradingParams => ({
  basic: {...preset.global.basic},
  colorBalance: {...preset.global.colorBalance},
  pro: {
    curves: cloneCurves(preset.curve),
    wheels: cloneWheels(preset.wheels),
  },
});

export const migrateV1PresetToV2 = (
  params: ColorGradingParams = defaultColorGradingParams,
  sourcePresetId?: string,
): GradePresetV2 =>
  toGradePresetV2(params, {
    sourcePresetId,
    name: '兼容导入预设',
  });
