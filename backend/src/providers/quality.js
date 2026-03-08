const GLOBAL_BASE_TARGETS = new Set([
  'exposure',
  'brightness',
  'contrast',
  'highlights',
  'shadows',
  'whites',
  'blacks',
  'temperature',
  'tint',
  'vibrance',
  'saturation',
]);

const SCENE_REFINE_TARGETS = new Set([
  'redBalance',
  'greenBalance',
  'blueBalance',
  'curve_master',
  'curve_r',
  'curve_g',
  'curve_b',
  'wheel_shadows',
  'wheel_midtones',
  'wheel_highlights',
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const roundTo = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const estimateSceneProfile = (imageStats, hints = []) => {
  const loweredHints = Array.isArray(hints)
    ? hints.map(item => String(item || '').toLowerCase())
    : [];
  if (loweredHints.some(item => item.includes('portrait') || item.includes('人像'))) {
    return 'portrait';
  }
  if (loweredHints.some(item => item.includes('night') || item.includes('夜'))) {
    return 'night';
  }
  if (loweredHints.some(item => item.includes('landscape') || item.includes('风光'))) {
    return 'landscape';
  }
  if (!imageStats) {
    return 'general';
  }
  if ((imageStats.skinPct || 0) > 0.2) {
    return 'portrait';
  }
  if ((imageStats.lumaMean || 0) < 0.24) {
    return 'night';
  }
  if ((imageStats.skyPct || 0) > 0.2 || (imageStats.greenPct || 0) > 0.22) {
    return 'landscape';
  }
  return 'general';
};

const detectQualityRiskFlags = imageStats => {
  if (!imageStats) {
    return [];
  }
  const flags = [];
  if (imageStats.highlightClipPct > 0.06) {
    flags.push('highlight_clipping');
  }
  if (imageStats.shadowClipPct > 0.08) {
    flags.push('shadow_crush');
  }
  if (imageStats.saturationMean > 0.6) {
    flags.push('over_saturation_risk');
  }
  if (imageStats.saturationMean < 0.16) {
    flags.push('flat_color_risk');
  }
  if (imageStats.lumaStd < 0.11) {
    flags.push('low_micro_contrast');
  }
  return flags;
};

const recommendIntensity = ({imageStats, sceneProfile}) => {
  if (!imageStats) {
    return 'normal';
  }
  if (sceneProfile === 'portrait') {
    if (imageStats.highlightClipPct > 0.08 || imageStats.saturationMean > 0.58) {
      return 'soft';
    }
    if (imageStats.lumaStd < 0.12 && imageStats.saturationMean < 0.2) {
      return 'strong';
    }
    return 'normal';
  }
  if (sceneProfile === 'night') {
    if (imageStats.shadowClipPct > 0.12) {
      return 'soft';
    }
    if (imageStats.lumaMean < 0.2) {
      return 'strong';
    }
    return 'normal';
  }
  if (sceneProfile === 'landscape') {
    if (imageStats.saturationMean > 0.62) {
      return 'soft';
    }
    if (imageStats.saturationMean < 0.22 && imageStats.lumaStd < 0.15) {
      return 'strong';
    }
    return 'normal';
  }
  return 'normal';
};

const intensityScale = intensity => {
  if (intensity === 'soft') {
    return 0.75;
  }
  if (intensity === 'strong') {
    return 1.15;
  }
  return 1;
};

const scaleActionByIntensity = (action, scale) => {
  if (!action || typeof action !== 'object') {
    return action;
  }
  if (action.action === 'adjust_param' && typeof action.delta === 'number') {
    return {...action, delta: roundTo(action.delta * scale, 2)};
  }
  if (action.action === 'apply_style' && typeof action.strength === 'number') {
    return {
      ...action,
      strength: roundTo(clamp(action.strength * (0.9 + (scale - 1) * 0.6), 0.5, 1.4), 2),
    };
  }
  return action;
};

const clampActionValue = (target, value) => {
  if (target === 'exposure') {
    return roundTo(clamp(value, -2, 2), 2);
  }
  return roundTo(clamp(value, -100, 100), 2);
};

const portraitSafetyClamp = (target, value) => {
  if (target === 'saturation') {
    return clamp(value, -28, 26);
  }
  if (target === 'vibrance') {
    return clamp(value, -18, 24);
  }
  if (target === 'temperature') {
    return clamp(value, -24, 22);
  }
  if (target === 'tint') {
    return clamp(value, -20, 18);
  }
  return value;
};

const applySafetyToAction = ({action, sceneProfile, imageStats}) => {
  if (!action || typeof action !== 'object') {
    return action;
  }
  if (action.action === 'adjust_param' && typeof action.delta === 'number') {
    let nextDelta = clampActionValue(action.target, action.delta);
    if (sceneProfile === 'portrait') {
      nextDelta = portraitSafetyClamp(action.target, nextDelta);
    }
    if (
      imageStats &&
      imageStats.highlightClipPct > 0.07 &&
      (action.target === 'exposure' || action.target === 'highlights' || action.target === 'whites')
    ) {
      nextDelta = Math.min(nextDelta, action.target === 'exposure' ? 0.06 : 8);
    }
    if (
      imageStats &&
      imageStats.shadowClipPct > 0.1 &&
      (action.target === 'shadows' || action.target === 'blacks')
    ) {
      nextDelta = Math.max(nextDelta, -8);
    }
    return {...action, delta: roundTo(nextDelta, 2)};
  }

  if (action.action === 'set_param' && typeof action.value === 'number') {
    let nextValue = clampActionValue(action.target, action.value);
    if (sceneProfile === 'portrait') {
      nextValue = portraitSafetyClamp(action.target, nextValue);
    }
    return {...action, value: roundTo(nextValue, 2)};
  }

  if (action.action === 'apply_style' && typeof action.strength === 'number') {
    const nextStrength = sceneProfile === 'portrait'
      ? clamp(action.strength, 0.55, 1.15)
      : clamp(action.strength, 0.5, 1.4);
    return {...action, strength: roundTo(nextStrength, 2)};
  }

  return action;
};

const buildSafetyClampActions = ({imageStats, sceneProfile, qualityRiskFlags}) => {
  const actions = [];
  if (!imageStats) {
    return actions;
  }
  if (qualityRiskFlags.includes('highlight_clipping')) {
    actions.push({action: 'adjust_param', target: 'highlights', delta: -10});
    actions.push({action: 'adjust_param', target: 'whites', delta: -7});
    actions.push({action: 'adjust_param', target: 'exposure', delta: -0.08});
  }
  if (qualityRiskFlags.includes('shadow_crush')) {
    actions.push({action: 'adjust_param', target: 'shadows', delta: 9});
    actions.push({action: 'adjust_param', target: 'blacks', delta: 7});
  }
  if (sceneProfile === 'portrait' && qualityRiskFlags.includes('over_saturation_risk')) {
    actions.push({action: 'adjust_param', target: 'vibrance', delta: -8});
    actions.push({action: 'adjust_param', target: 'saturation', delta: -6});
  }
  return actions;
};

const splitLayeredActions = (actions, safetyActions) => {
  const globalBase = [];
  const sceneRefine = [];
  for (const action of actions) {
    if (!action || action.action === 'reset' || action.action === 'apply_style') {
      globalBase.push(action);
      continue;
    }
    if (SCENE_REFINE_TARGETS.has(action.target)) {
      sceneRefine.push(action);
      continue;
    }
    if (GLOBAL_BASE_TARGETS.has(action.target)) {
      globalBase.push(action);
      continue;
    }
    globalBase.push(action);
  }
  return {
    global_base: globalBase,
    scene_refine: sceneRefine,
    safety_clamp: safetyActions,
  };
};

module.exports = {
  estimateSceneProfile,
  detectQualityRiskFlags,
  recommendIntensity,
  intensityScale,
  scaleActionByIntensity,
  applySafetyToAction,
  buildSafetyClampActions,
  splitLayeredActions,
};
