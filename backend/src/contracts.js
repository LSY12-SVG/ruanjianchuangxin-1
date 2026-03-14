const VALID_ACTIONS = new Set(['set_param', 'adjust_param', 'apply_style', 'reset']);
const VALID_TARGETS = new Set([
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
  'style',
]);

const ACTION_ALIAS = {
  set: 'set_param',
  setparam: 'set_param',
  set_param: 'set_param',
  adjust: 'adjust_param',
  adjust_param: 'adjust_param',
  change: 'adjust_param',
  increase: 'adjust_param',
  decrease: 'adjust_param',
  style: 'apply_style',
  applystyle: 'apply_style',
  apply_style: 'apply_style',
  reset: 'reset',
  reset_all: 'reset',
};

const TARGET_ALIAS = {
  exposure: 'exposure',
  曝光: 'exposure',
  曝光度: 'exposure',
  brightness: 'brightness',
  亮度: 'brightness',
  contrast: 'contrast',
  对比: 'contrast',
  对比度: 'contrast',
  highlights: 'highlights',
  highlight: 'highlights',
  高光: 'highlights',
  亮部: 'highlights',
  shadows: 'shadows',
  shadow: 'shadows',
  阴影: 'shadows',
  暗部: 'shadows',
  whites: 'whites',
  white: 'whites',
  白场: 'whites',
  白位: 'whites',
  blacks: 'blacks',
  black: 'blacks',
  黑场: 'blacks',
  黑位: 'blacks',
  temperature: 'temperature',
  temp: 'temperature',
  wb_temp: 'temperature',
  color_temperature: 'temperature',
  色温: 'temperature',
  tint: 'tint',
  色调: 'tint',
  vibrance: 'vibrance',
  自然饱和度: 'vibrance',
  saturation: 'saturation',
  饱和: 'saturation',
  饱和度: 'saturation',
  redbalance: 'redBalance',
  red_balance: 'redBalance',
  redBalance: 'redBalance',
  红色通道: 'redBalance',
  greenbalance: 'greenBalance',
  green_balance: 'greenBalance',
  greenBalance: 'greenBalance',
  绿色通道: 'greenBalance',
  bluebalance: 'blueBalance',
  blue_balance: 'blueBalance',
  blueBalance: 'blueBalance',
  蓝色通道: 'blueBalance',
  curve_master: 'curve_master',
  master_curve: 'curve_master',
  主曲线: 'curve_master',
  curve_r: 'curve_r',
  red_curve: 'curve_r',
  红曲线: 'curve_r',
  curve_g: 'curve_g',
  green_curve: 'curve_g',
  绿曲线: 'curve_g',
  curve_b: 'curve_b',
  blue_curve: 'curve_b',
  蓝曲线: 'curve_b',
  wheel_shadows: 'wheel_shadows',
  shadows_wheel: 'wheel_shadows',
  阴影色轮: 'wheel_shadows',
  wheel_midtones: 'wheel_midtones',
  midtones_wheel: 'wheel_midtones',
  中间调色轮: 'wheel_midtones',
  wheel_highlights: 'wheel_highlights',
  highlights_wheel: 'wheel_highlights',
  高光色轮: 'wheel_highlights',
  style: 'style',
  风格: 'style',
};

const STYLE_ALIAS = {
  cinematic_cool: 'cinematic_cool',
  清冷电影感: 'cinematic_cool',
  冷色电影: 'cinematic_cool',
  cinematic_warm: 'cinematic_warm',
  暖色电影: 'cinematic_warm',
  portrait_clean: 'portrait_clean',
  通透人像: 'portrait_clean',
  vintage_fade: 'vintage_fade',
  复古: 'vintage_fade',
  moody_dark: 'moody_dark',
  情绪暗调: 'moody_dark',
  fresh_bright: 'fresh_bright',
  清新明亮: 'fresh_bright',
};

const isObject = value => typeof value === 'object' && value !== null;

const normalizeToken = value =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_')
    .replace(/[^\w\u4e00-\u9fa5]/g, '');

const resolveAlias = (aliasMap, rawValue) => {
  const raw = String(rawValue || '').trim();
  if (!raw) {
    return null;
  }
  return (
    aliasMap[raw] ||
    aliasMap[raw.toLowerCase()] ||
    aliasMap[normalizeToken(raw)] ||
    null
  );
};

const toNumberOrNull = value => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const resolveTarget = value => {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }
  const normalized = normalizeToken(raw);
  const candidates = [
    raw,
    raw.toLowerCase(),
    normalized,
    normalized.replace(/(?:_)?(delta|value|amount|adjust|adjustment)$/, ''),
  ];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (TARGET_ALIAS[candidate]) {
      return TARGET_ALIAS[candidate];
    }
  }
  return null;
};

const normalizeAction = value => {
  if (!isObject(value)) {
    return null;
  }

  const rawAction =
    value.action ||
    value.type ||
    value.op ||
    value.operation ||
    value.intent ||
    '';
  const rawStyle =
    typeof value.style === 'string'
      ? value.style
      : typeof value.profile === 'string'
        ? value.profile
        : typeof value.look === 'string'
          ? value.look
          : '';
  const inferredDelta = toNumberOrNull(
    value.delta ?? value.amount ?? value.change ?? value.adjustment,
  );
  const inferredValue = toNumberOrNull(
    value.value ?? value.amount ?? value.targetValue ?? value.set,
  );

  let action = resolveAlias(ACTION_ALIAS, rawAction);
  if (!action) {
    if (rawStyle.trim()) {
      action = 'apply_style';
    } else if (inferredDelta !== null) {
      action = 'adjust_param';
    } else if (inferredValue !== null) {
      action = 'set_param';
    }
  }
  if (!action) {
    return null;
  }

  const target = resolveTarget(
    value.target ??
      value.param ??
      value.parameter ??
      value.key ??
      value.name ??
      value.channel,
  );

  if (action === 'reset') {
    return {action: 'reset', target: 'style'};
  }

  if (action === 'apply_style') {
    const styleRaw = String(rawStyle || value.value || value.label || '').trim();
    const style = resolveAlias(STYLE_ALIAS, styleRaw) || styleRaw;
    if (!style) {
      return null;
    }
    return {
      action: 'apply_style',
      target: 'style',
      style,
      strength: toNumberOrNull(value.strength) || 1,
    };
  }

  if (!target || target === 'style') {
    return null;
  }

  if (action === 'set_param') {
    const valueNum = toNumberOrNull(
      value.value ?? value.amount ?? value.targetValue ?? value.set ?? value.delta,
    );
    if (valueNum === null) {
      return null;
    }
    return {
      action: 'set_param',
      target,
      value: valueNum,
    };
  }

  const rawDelta = toNumberOrNull(
    value.delta ?? value.amount ?? value.change ?? value.adjustment ?? value.value,
  );
  if (rawDelta === null) {
    return null;
  }

  const normalizedAction = normalizeToken(rawAction);
  const isDecrease = normalizedAction === 'decrease';
  const isIncrease = normalizedAction === 'increase';
  const delta = isDecrease ? -Math.abs(rawDelta) : isIncrease ? Math.abs(rawDelta) : rawDelta;

  return {
    action: 'adjust_param',
    target,
    delta,
  };
};

const isAction = action => {
  if (!isObject(action)) {
    return false;
  }

  if (!VALID_ACTIONS.has(action.action) || !VALID_TARGETS.has(action.target)) {
    return false;
  }

  if (action.action === 'set_param' && typeof action.value !== 'number') {
    return false;
  }

  if (action.action === 'adjust_param' && typeof action.delta !== 'number') {
    return false;
  }

  if (action.action === 'apply_style' && typeof action.style !== 'string') {
    return false;
  }

  return true;
};

const validateInterpretRequest = body => {
  if (!isObject(body)) {
    return {ok: false, message: 'request body must be an object'};
  }

  const mode =
    body.mode === 'initial_visual_suggest' || body.mode === 'voice_refine'
      ? body.mode
      : 'voice_refine';

  if (typeof body.transcript !== 'string' || !body.transcript.trim()) {
    if (mode !== 'initial_visual_suggest') {
      return {ok: false, message: 'transcript is required in voice_refine mode'};
    }
  }

  if (typeof body.locale !== 'string' || !body.locale.trim()) {
    return {ok: false, message: 'locale is required'};
  }

  if (!isObject(body.currentParams)) {
    return {ok: false, message: 'currentParams is required'};
  }

  if (
    !isObject(body.image) ||
    typeof body.image.mimeType !== 'string' ||
    typeof body.image.width !== 'number' ||
    typeof body.image.height !== 'number' ||
    typeof body.image.base64 !== 'string' ||
    body.image.base64.length === 0
  ) {
    return {ok: false, message: 'image {mimeType,width,height,base64} is required'};
  }

  if (
    body.imageStats !== undefined &&
    (!isObject(body.imageStats) ||
      typeof body.imageStats.lumaMean !== 'number' ||
      typeof body.imageStats.lumaStd !== 'number' ||
      typeof body.imageStats.highlightClipPct !== 'number' ||
      typeof body.imageStats.shadowClipPct !== 'number' ||
      typeof body.imageStats.saturationMean !== 'number')
  ) {
    return {ok: false, message: 'imageStats shape is invalid'};
  }

  return {ok: true};
};

const normalizeInterpretResponse = payload => {
  if (!isObject(payload)) {
    return null;
  }

  const mapObjectActions = value => {
    if (!isObject(value)) {
      return [];
    }
    return Object.entries(value)
      .map(([target, item]) => {
        if (item === null || item === undefined) {
          return null;
        }
        if (isObject(item)) {
          return {
            ...item,
            target: item.target || item.param || target,
          };
        }
        const numeric = toNumberOrNull(item);
        if (numeric === null) {
          return null;
        }
        return {
          action: 'set_param',
          target,
          value: numeric,
        };
      })
      .filter(Boolean);
  };

  const listCandidates = [
    payload.actions,
    payload.intent_actions,
    payload.intentActions,
    payload.global_actions,
    payload.globalActions,
    payload.operations,
    payload.ops,
    payload.adjustments,
  ];
  const objectCandidates = [
    payload.global_actions,
    payload.globalActions,
    payload.global,
    payload.globalAdjustments,
    payload.global_adjustments,
    payload.params,
    payload.paramValues,
    payload.param_values,
  ];

  let actionsRaw = [];
  for (const candidate of listCandidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      actionsRaw = candidate;
      break;
    }
  }
  if (actionsRaw.length === 0) {
    for (const candidate of objectCandidates) {
      const mapped = mapObjectActions(candidate);
      if (mapped.length > 0) {
        actionsRaw = mapped;
        break;
      }
    }
  }

  const actions = Array.isArray(actionsRaw)
    ? actionsRaw.map(normalizeAction).filter(item => Boolean(item))
    : [];

  if (actions.length === 0) {
    return null;
  }

  if (!actions.every(isAction)) {
    return null;
  }

  const confidence = Number(payload.confidence || 0.5);
  const riskFlagsRaw =
    payload.quality_risk_flags || payload.qualityRiskFlags || payload.riskFlags;
  const qualityRiskFlags = Array.isArray(riskFlagsRaw)
    ? riskFlagsRaw.map(item => String(item)).filter(Boolean)
    : [];
  const recommendedIntensityRaw =
    payload.recommended_intensity || payload.recommendedIntensity;
  const recommendedIntensity =
    recommendedIntensityRaw === 'soft' ||
    recommendedIntensityRaw === 'normal' ||
    recommendedIntensityRaw === 'strong'
      ? recommendedIntensityRaw
      : 'normal';
  const sceneProfileRaw = payload.scene_profile || payload.sceneProfile;
  const sceneProfile = typeof sceneProfileRaw === 'string' ? sceneProfileRaw : '';
  const sceneConfidenceRaw = Number(payload.scene_confidence ?? payload.sceneConfidence);
  const sceneConfidence = Number.isFinite(sceneConfidenceRaw)
    ? sceneConfidenceRaw
    : undefined;

  return {
    intent_actions: actions,
    confidence: Number.isFinite(confidence) ? confidence : 0.5,
    reasoning_summary:
      typeof payload.reasoning_summary === 'string'
        ? payload.reasoning_summary
        : typeof payload.reasoningSummary === 'string'
          ? payload.reasoningSummary
          : 'Structured response without summary',
    fallback_used: Boolean(payload.fallback_used || payload.fallbackUsed),
    needsConfirmation:
      typeof payload.needsConfirmation === 'boolean'
        ? payload.needsConfirmation
        : true,
    message:
      typeof payload.message === 'string'
        ? payload.message
        : 'Interpretation generated',
    source:
      payload.source === 'cloud' || payload.source === 'fallback'
        ? payload.source
        : 'cloud',
    analysis_summary:
      typeof payload.analysis_summary === 'string'
        ? payload.analysis_summary
        : typeof payload.analysisSummary === 'string'
          ? payload.analysisSummary
          : '',
    applied_profile:
      typeof payload.applied_profile === 'string'
        ? payload.applied_profile
        : typeof payload.appliedProfile === 'string'
          ? payload.appliedProfile
          : '',
    scene_profile: sceneProfile,
    scene_confidence: sceneConfidence,
    quality_risk_flags: qualityRiskFlags,
    recommended_intensity: recommendedIntensity,
    fallback_reason:
      typeof payload.fallback_reason === 'string'
        ? payload.fallback_reason
        : typeof payload.fallbackReason === 'string'
          ? payload.fallbackReason
          : undefined,
  };
};

module.exports = {
  validateInterpretRequest,
  normalizeInterpretResponse,
};
