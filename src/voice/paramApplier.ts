import {
  defaultColorGradingParams,
  type ColorGradingParams,
  type ToneCurvePoints,
} from '../types/colorGrading.ts';
import {mapStyleToVector} from './styleMapper';
import type {InterpretResponse, VoiceIntentAction, VoiceTarget} from './types';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const cloneParams = (params: ColorGradingParams): ColorGradingParams => ({
  basic: {...params.basic},
  colorBalance: {...params.colorBalance},
  pro: {
    curves: {
      master: [...params.pro.curves.master] as ToneCurvePoints,
      r: [...params.pro.curves.r] as ToneCurvePoints,
      g: [...params.pro.curves.g] as ToneCurvePoints,
      b: [...params.pro.curves.b] as ToneCurvePoints,
    },
    wheels: {
      shadows: {...params.pro.wheels.shadows},
      midtones: {...params.pro.wheels.midtones},
      highlights: {...params.pro.wheels.highlights},
    },
  },
});

const clampByTarget = (target: VoiceTarget, value: number): number => {
  if (target === 'exposure') {
    return clamp(value, -2, 2);
  }
  if (
    target === 'curve_master' ||
    target === 'curve_r' ||
    target === 'curve_g' ||
    target === 'curve_b' ||
    target === 'wheel_shadows' ||
    target === 'wheel_midtones' ||
    target === 'wheel_highlights'
  ) {
    return clamp(value, -100, 100);
  }
  return clamp(value, -100, 100);
};

const addCurveDelta = (curve: ToneCurvePoints, amount: number): ToneCurvePoints => {
  const delta = amount / 100;
  const next = [...curve] as ToneCurvePoints;
  next[1] = clamp(next[1] + delta * 0.6, 0, 1);
  next[2] = clamp(next[2] + delta, 0, 1);
  next[3] = clamp(next[3] + delta * 0.6, 0, 1);
  return next;
};

const setCurveAbsolute = (curve: ToneCurvePoints, amount: number): ToneCurvePoints => {
  const center = clamp(0.5 + amount / 200, 0, 1);
  const shoulder = clamp(center + 0.25, 0, 1);
  const toe = clamp(center - 0.25, 0, 1);
  return [0, toe, center, shoulder, 1];
};

const applyWheelDelta = (
  wheel: {hue: number; sat: number; luma: number},
  amount: number,
  setMode: boolean,
) => {
  const value = clamp(amount, -100, 100);
  if (setMode) {
    return {
      ...wheel,
      sat: clamp(Math.abs(value), 0, 100),
      luma: value,
    };
  }
  return {
    ...wheel,
    sat: clamp(wheel.sat + Math.abs(value), 0, 100),
    luma: clamp(wheel.luma + value, -100, 100),
  };
};

const applyTargetValue = (
  params: ColorGradingParams,
  target: VoiceTarget,
  value: number,
  setMode = false,
): void => {
  const clamped = clampByTarget(target, value);
  switch (target) {
    case 'exposure':
      params.basic.exposure = clamped;
      return;
    case 'brightness':
      params.basic.brightness = clamped;
      return;
    case 'contrast':
      params.basic.contrast = clamped;
      return;
    case 'highlights':
      params.basic.highlights = clamped;
      return;
    case 'shadows':
      params.basic.shadows = clamped;
      return;
    case 'whites':
      params.basic.whites = clamped;
      return;
    case 'blacks':
      params.basic.blacks = clamped;
      return;
    case 'temperature':
      params.colorBalance.temperature = clamped;
      return;
    case 'tint':
      params.colorBalance.tint = clamped;
      return;
    case 'vibrance':
      params.colorBalance.vibrance = clamped;
      return;
    case 'saturation':
      params.colorBalance.saturation = clamped;
      return;
    case 'redBalance':
      params.colorBalance.redBalance = clamped;
      return;
    case 'greenBalance':
      params.colorBalance.greenBalance = clamped;
      return;
    case 'blueBalance':
      params.colorBalance.blueBalance = clamped;
      return;
    case 'curve_master':
      params.pro.curves.master = setMode
        ? setCurveAbsolute(params.pro.curves.master, clamped)
        : addCurveDelta(params.pro.curves.master, clamped);
      return;
    case 'curve_r':
      params.pro.curves.r = setMode
        ? setCurveAbsolute(params.pro.curves.r, clamped)
        : addCurveDelta(params.pro.curves.r, clamped);
      return;
    case 'curve_g':
      params.pro.curves.g = setMode
        ? setCurveAbsolute(params.pro.curves.g, clamped)
        : addCurveDelta(params.pro.curves.g, clamped);
      return;
    case 'curve_b':
      params.pro.curves.b = setMode
        ? setCurveAbsolute(params.pro.curves.b, clamped)
        : addCurveDelta(params.pro.curves.b, clamped);
      return;
    case 'wheel_shadows':
      params.pro.wheels.shadows = applyWheelDelta(
        params.pro.wheels.shadows,
        clamped,
        setMode,
      );
      return;
    case 'wheel_midtones':
      params.pro.wheels.midtones = applyWheelDelta(
        params.pro.wheels.midtones,
        clamped,
        setMode,
      );
      return;
    case 'wheel_highlights':
      params.pro.wheels.highlights = applyWheelDelta(
        params.pro.wheels.highlights,
        clamped,
        setMode,
      );
      return;
    default:
      return;
  }
};

const applySingleAction = (
  params: ColorGradingParams,
  action: VoiceIntentAction,
): ColorGradingParams => {
  const next = cloneParams(params);

  if (action.action === 'reset') {
    return cloneParams(defaultColorGradingParams);
  }

  if (action.action === 'apply_style' && action.style) {
    const vector = mapStyleToVector(action.style, action.strength || 1);
    (Object.keys(vector) as VoiceTarget[]).forEach(key => {
      if (key === 'style') {
        return;
      }
      applyTargetValue(next, key, (vector as Record<string, number>)[key]);
    });
    return next;
  }

  const amount = action.action === 'set_param' ? action.value || 0 : action.delta || 0;
  if (action.action === 'set_param') {
    applyTargetValue(next, action.target, amount, true);
    return next;
  }

  switch (action.target) {
    case 'exposure':
      applyTargetValue(next, 'exposure', next.basic.exposure + amount);
      break;
    case 'brightness':
      applyTargetValue(next, 'brightness', next.basic.brightness + amount);
      break;
    case 'contrast':
      applyTargetValue(next, 'contrast', next.basic.contrast + amount);
      break;
    case 'highlights':
      applyTargetValue(next, 'highlights', next.basic.highlights + amount);
      break;
    case 'shadows':
      applyTargetValue(next, 'shadows', next.basic.shadows + amount);
      break;
    case 'whites':
      applyTargetValue(next, 'whites', next.basic.whites + amount);
      break;
    case 'blacks':
      applyTargetValue(next, 'blacks', next.basic.blacks + amount);
      break;
    case 'temperature':
      applyTargetValue(next, 'temperature', next.colorBalance.temperature + amount);
      break;
    case 'tint':
      applyTargetValue(next, 'tint', next.colorBalance.tint + amount);
      break;
    case 'vibrance':
      applyTargetValue(next, 'vibrance', next.colorBalance.vibrance + amount);
      break;
    case 'saturation':
      applyTargetValue(next, 'saturation', next.colorBalance.saturation + amount);
      break;
    case 'redBalance':
      applyTargetValue(next, 'redBalance', next.colorBalance.redBalance + amount);
      break;
    case 'greenBalance':
      applyTargetValue(next, 'greenBalance', next.colorBalance.greenBalance + amount);
      break;
    case 'blueBalance':
      applyTargetValue(next, 'blueBalance', next.colorBalance.blueBalance + amount);
      break;
    case 'curve_master':
      applyTargetValue(next, 'curve_master', amount);
      break;
    case 'curve_r':
      applyTargetValue(next, 'curve_r', amount);
      break;
    case 'curve_g':
      applyTargetValue(next, 'curve_g', amount);
      break;
    case 'curve_b':
      applyTargetValue(next, 'curve_b', amount);
      break;
    case 'wheel_shadows':
      applyTargetValue(next, 'wheel_shadows', amount);
      break;
    case 'wheel_midtones':
      applyTargetValue(next, 'wheel_midtones', amount);
      break;
    case 'wheel_highlights':
      applyTargetValue(next, 'wheel_highlights', amount);
      break;
    default:
      break;
  }

  return next;
};

export const applyVoiceInterpretation = (
  currentParams: ColorGradingParams,
  interpretation: InterpretResponse,
): ColorGradingParams =>
  interpretation.actions.reduce(
    (acc, action) => applySingleAction(acc, action),
    cloneParams(currentParams),
  );

export const formatInterpretationSummary = (
  interpretation: InterpretResponse,
): string => {
  const targetLabel: Record<string, string> = {
    exposure: '曝光',
    brightness: '亮度',
    contrast: '对比度',
    highlights: '高光',
    shadows: '阴影',
    whites: '白色色阶',
    blacks: '黑色色阶',
    temperature: '色温',
    tint: '色调',
    vibrance: '自然饱和度',
    saturation: '饱和度',
    redBalance: '红色通道',
    greenBalance: '绿色通道',
    blueBalance: '蓝色通道',
    curve_master: '主曲线',
    curve_r: '红曲线',
    curve_g: '绿曲线',
    curve_b: '蓝曲线',
    wheel_shadows: '阴影色轮',
    wheel_midtones: '中间调色轮',
    wheel_highlights: '高光色轮',
  };

  if (interpretation.actions.length === 0) {
    return '没有可应用的调色动作';
  }

  return interpretation.actions
    .map(action => {
      if (action.action === 'reset') {
        return '重置参数';
      }
      if (action.action === 'apply_style') {
        return `风格: ${action.style}`;
      }
      const value = action.action === 'set_param' ? action.value : action.delta;
      const label = targetLabel[action.target] || action.target;
      return `${label} ${action.action === 'set_param' ? '=' : ''}${value}`;
    })
    .join(' | ');
};

