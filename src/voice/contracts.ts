import type {
  InterpretRequest,
  InterpretResponse,
  VoiceIntentAction,
  VoiceTarget,
  VoiceStyleTag,
} from './types';

const ACTIONS = ['set_param', 'adjust_param', 'apply_style', 'reset'];
const TARGETS: VoiceTarget[] = [
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
];

const ACTION_ALIAS: Record<string, VoiceIntentAction['action']> = {
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

const TARGET_ALIAS: Record<string, VoiceTarget> = {
  exposure: 'exposure',
  曝光: 'exposure',
  曝光度: 'exposure',
  brightness: 'brightness',
  亮度: 'brightness',
  contrast: 'contrast',
  对比: 'contrast',
  对比度: 'contrast',
  highlights: 'highlights',
  高光: 'highlights',
  亮部: 'highlights',
  shadows: 'shadows',
  阴影: 'shadows',
  暗部: 'shadows',
  whites: 'whites',
  白场: 'whites',
  白位: 'whites',
  blacks: 'blacks',
  黑场: 'blacks',
  黑位: 'blacks',
  temperature: 'temperature',
  色温: 'temperature',
  tint: 'tint',
  色调: 'tint',
  vibrance: 'vibrance',
  自然饱和度: 'vibrance',
  自然饱和: 'vibrance',
  saturation: 'saturation',
  饱和: 'saturation',
  饱和度: 'saturation',
  redbalance: 'redBalance',
  red_balance: 'redBalance',
  redBalance: 'redBalance',
  红色通道: 'redBalance',
  红通道: 'redBalance',
  greenbalance: 'greenBalance',
  green_balance: 'greenBalance',
  greenBalance: 'greenBalance',
  绿色通道: 'greenBalance',
  绿通道: 'greenBalance',
  bluebalance: 'blueBalance',
  blue_balance: 'blueBalance',
  blueBalance: 'blueBalance',
  蓝色通道: 'blueBalance',
  蓝通道: 'blueBalance',
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

const STYLE_ALIAS: Record<string, VoiceStyleTag> = {
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

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeAction = (value: unknown): VoiceIntentAction | null => {
  if (!isObject(value)) {
    return null;
  }

  const rawAction = String(value.action || '').trim().toLowerCase();
  const action = ACTION_ALIAS[rawAction] || null;
  if (!action) {
    return null;
  }

  const rawTarget = String(value.target || '').trim();
  const target = TARGET_ALIAS[rawTarget] || TARGET_ALIAS[rawTarget.toLowerCase()] || null;

  if (action === 'reset') {
    return {action: 'reset', target: 'style'};
  }

  if (!target) {
    return null;
  }

  if (action === 'apply_style') {
    const styleRaw = String(value.style || '').trim();
    const style = STYLE_ALIAS[styleRaw] || STYLE_ALIAS[styleRaw.toLowerCase()] || null;
    if (!style) {
      return null;
    }

    const strength = toNumberOrNull(value.strength) ?? 1;
    return {
      action: 'apply_style',
      target: 'style',
      style,
      strength,
    };
  }

  if (action === 'set_param') {
    const valueNum = toNumberOrNull(value.value ?? value.amount ?? value.delta);
    if (valueNum === null) {
      return null;
    }
    return {
      action: 'set_param',
      target,
      value: valueNum,
    };
  }

  const rawDelta = toNumberOrNull(value.delta ?? value.amount ?? value.value);
  if (rawDelta === null) {
    return null;
  }

  const isDecrease = rawAction === 'decrease';
  const isIncrease = rawAction === 'increase';
  const delta = isDecrease ? -Math.abs(rawDelta) : isIncrease ? Math.abs(rawDelta) : rawDelta;

  return {
    action: 'adjust_param',
    target,
    delta,
  };
};

const isAction = (value: unknown): value is VoiceIntentAction => {
  if (!isObject(value)) {
    return false;
  }

  if (!ACTIONS.includes(String(value.action))) {
    return false;
  }

  if (!TARGETS.includes(value.target as VoiceTarget)) {
    return false;
  }

  const hasValue = typeof value.value === 'number';
  const hasDelta = typeof value.delta === 'number';

  if (value.action === 'set_param' && !hasValue) {
    return false;
  }

  if (value.action === 'adjust_param' && !hasDelta) {
    return false;
  }

  return true;
};

export const isValidInterpretRequest = (value: unknown): value is InterpretRequest => {
  if (!isObject(value)) {
    return false;
  }

  const mode =
    value.mode === 'initial_visual_suggest' || value.mode === 'voice_refine'
      ? value.mode
      : 'voice_refine';

  const imageValid =
    value.image === undefined ||
    (isObject(value.image) &&
      typeof value.image.mimeType === 'string' &&
      typeof value.image.width === 'number' &&
      typeof value.image.height === 'number' &&
      typeof value.image.base64 === 'string' &&
      value.image.base64.length > 0);

  const statsValid =
    value.imageStats === undefined ||
    (isObject(value.imageStats) &&
      typeof value.imageStats.lumaMean === 'number' &&
      typeof value.imageStats.lumaStd === 'number' &&
      typeof value.imageStats.highlightClipPct === 'number' &&
      typeof value.imageStats.shadowClipPct === 'number' &&
      typeof value.imageStats.saturationMean === 'number');

  return (
    typeof value.transcript === 'string' &&
    (mode === 'initial_visual_suggest' || value.transcript.trim().length > 0) &&
    typeof value.locale === 'string' &&
    isObject(value.currentParams) &&
    imageValid &&
    statsValid
  );
};

export const isValidInterpretResponse = (
  value: unknown,
): value is InterpretResponse => {
  if (!isObject(value)) {
    return false;
  }

  if (!Array.isArray(value.actions) || !value.actions.every(isAction)) {
    return false;
  }

  return (
    typeof value.confidence === 'number' &&
    typeof value.needsConfirmation === 'boolean' &&
    typeof value.fallbackUsed === 'boolean' &&
    typeof value.reasoningSummary === 'string' &&
    typeof value.message === 'string' &&
    (value.analysisSummary === undefined || typeof value.analysisSummary === 'string') &&
    (value.appliedProfile === undefined || typeof value.appliedProfile === 'string') &&
    (value.sceneProfile === undefined || typeof value.sceneProfile === 'string') &&
    (value.sceneConfidence === undefined || typeof value.sceneConfidence === 'number') &&
    (value.qualityRiskFlags === undefined ||
      (Array.isArray(value.qualityRiskFlags) &&
        value.qualityRiskFlags.every(item => typeof item === 'string'))) &&
    (value.recommendedIntensity === undefined ||
      value.recommendedIntensity === 'soft' ||
      value.recommendedIntensity === 'normal' ||
      value.recommendedIntensity === 'strong')
  );
};

export const normalizeInterpretResponse = (value: unknown): InterpretResponse | null => {
  if (!isObject(value)) {
    return null;
  }

  const actionsRaw = value.intent_actions ?? value.actions;
  const fallbackUsedRaw = value.fallbackUsed ?? value.fallback_used;
  const summaryRaw = value.reasoningSummary ?? value.reasoning_summary;
  const analysisSummaryRaw = value.analysisSummary ?? value.analysis_summary;
  const appliedProfileRaw = value.appliedProfile ?? value.applied_profile;
  const sceneProfileRaw = value.sceneProfile ?? value.scene_profile;
  const sceneConfidenceRaw = Number(value.sceneConfidence ?? value.scene_confidence);
  const riskFlagsRaw = value.qualityRiskFlags ?? value.quality_risk_flags;
  const intensityRaw = value.recommendedIntensity ?? value.recommended_intensity;
  const globalBaseRaw = value.globalBase ?? value.global_base;
  const sceneRefineRaw = value.sceneRefine ?? value.scene_refine;
  const safetyClampRaw = value.safetyClamp ?? value.safety_clamp;

  const normalizedActions = Array.isArray(actionsRaw)
    ? actionsRaw.map(normalizeAction).filter((item): item is VoiceIntentAction => Boolean(item))
    : [];

  if (normalizedActions.length === 0) {
    return null;
  }

  const normalizeActionList = (input: unknown): VoiceIntentAction[] | undefined => {
    if (!Array.isArray(input)) {
      return undefined;
    }
    const output = input
      .map(normalizeAction)
      .filter((item): item is VoiceIntentAction => Boolean(item));
    return output.length > 0 ? output : [];
  };

  const normalized = {
    actions: normalizedActions,
    globalBaseActions: normalizeActionList(globalBaseRaw),
    sceneRefineActions: normalizeActionList(sceneRefineRaw),
    safetyClampActions: normalizeActionList(safetyClampRaw),
    confidence:
      typeof value.confidence === 'number'
        ? value.confidence
        : Number(value.confidence) || 0,
    needsConfirmation:
      typeof value.needsConfirmation === 'boolean'
        ? value.needsConfirmation
        : true,
    fallbackUsed: Boolean(fallbackUsedRaw),
    reasoningSummary:
      typeof summaryRaw === 'string' ? summaryRaw : '云端解析返回摘要缺失',
    message:
      typeof value.message === 'string' ? value.message : '已完成语义解析',
    source:
      value.source === 'cloud' || value.source === 'local' || value.source === 'fallback'
        ? value.source
        : 'cloud',
    analysisSummary:
      typeof analysisSummaryRaw === 'string' ? analysisSummaryRaw : undefined,
    appliedProfile:
      typeof appliedProfileRaw === 'string' ? appliedProfileRaw : undefined,
    sceneProfile:
      typeof sceneProfileRaw === 'string' ? sceneProfileRaw : undefined,
    sceneConfidence: Number.isFinite(sceneConfidenceRaw) ? sceneConfidenceRaw : undefined,
    qualityRiskFlags: Array.isArray(riskFlagsRaw)
      ? riskFlagsRaw.map(item => String(item)).filter(Boolean)
      : undefined,
    recommendedIntensity:
      intensityRaw === 'soft' || intensityRaw === 'normal' || intensityRaw === 'strong'
        ? intensityRaw
        : undefined,
  };

  return isValidInterpretResponse(normalized) ? normalized : null;
};

export const describeAction = (action: VoiceIntentAction): string => {
  if (action.action === 'reset') {
    return '重置全部参数';
  }

  if (action.action === 'apply_style' && action.style) {
    return `应用风格: ${action.style}`;
  }

  if (action.action === 'set_param') {
    return `${action.target} 设为 ${action.value}`;
  }

  return `${action.target} ${action.delta && action.delta > 0 ? '+' : ''}${action.delta}`;
};
