const {interpretWithProvider} = require('./providers');
const {createSegmentationResult} = require('./segmentation/service');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const isObject = value => typeof value === 'object' && value !== null;

const AUTO_GRADE_PHASE_DEFAULTS = {
  fast: {
    timeoutMs: 5000,
    totalBudgetMs: 5500,
  },
  refine: {
    timeoutMs: 9000,
    totalBudgetMs: 12000,
  },
};

const toNumber = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const estimateBase64Bytes = base64 => {
  if (typeof base64 !== 'string' || base64.length === 0) {
    return 0;
  }
  const padding = (base64.match(/=*$/) || [''])[0].length;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
};

const resolveAutoGradePhaseRuntime = phase => {
  const resolvedPhase = phase === 'refine' ? 'refine' : 'fast';
  if (resolvedPhase === 'refine') {
    return {
      timeoutMs: toNumber(
        process.env.AUTOGRADE_REFINE_TIMEOUT_MS,
        AUTO_GRADE_PHASE_DEFAULTS.refine.timeoutMs,
      ),
      totalBudgetMs: toNumber(
        process.env.AUTOGRADE_REFINE_BUDGET_MS,
        AUTO_GRADE_PHASE_DEFAULTS.refine.totalBudgetMs,
      ),
    };
  }
  return {
    timeoutMs: toNumber(
      process.env.AUTOGRADE_FAST_TIMEOUT_MS,
      AUTO_GRADE_PHASE_DEFAULTS.fast.timeoutMs,
    ),
    totalBudgetMs: toNumber(
      process.env.AUTOGRADE_FAST_BUDGET_MS,
      AUTO_GRADE_PHASE_DEFAULTS.fast.totalBudgetMs,
    ),
  };
};

const getAutoGradePhaseRuntimeConfig = () => ({
  fast: resolveAutoGradePhaseRuntime('fast'),
  refine: resolveAutoGradePhaseRuntime('refine'),
});

const getRequestPayloadDiagnostics = request => {
  const payloadBytes = toNumber(request?.image?.payloadBytes, NaN);
  return {
    payloadBytes: Number.isFinite(payloadBytes)
      ? payloadBytes
      : estimateBase64Bytes(request?.image?.base64 || ''),
    encodeQuality: toNumber(request?.image?.encodeQuality, NaN),
    mimeType: String(request?.image?.mimeType || ''),
  };
};

const withRuntimeDiagnostics = (result, request, phaseRuntime) => {
  const payload = getRequestPayloadDiagnostics(request);
  return {
    ...result,
    phaseTimeoutMs: phaseRuntime.timeoutMs,
    phaseBudgetMs: phaseRuntime.totalBudgetMs,
    payloadBytes: payload.payloadBytes,
    encodeQuality: Number.isFinite(payload.encodeQuality) ? payload.encodeQuality : undefined,
    mimeType: payload.mimeType,
  };
};

const validateAutoGradeRequest = body => {
  if (!isObject(body)) {
    return {ok: false, message: 'request body must be object'};
  }
  if (body.mode !== 'upload_autograde') {
    return {ok: false, message: 'mode must be upload_autograde'};
  }
  if (body.phase && body.phase !== 'fast' && body.phase !== 'refine') {
    return {ok: false, message: 'phase must be fast or refine'};
  }
  if (!isObject(body.currentParams)) {
    return {ok: false, message: 'currentParams is required'};
  }
  if (
    !isObject(body.image) ||
    typeof body.image.mimeType !== 'string' ||
    typeof body.image.width !== 'number' ||
    typeof body.image.height !== 'number'
  ) {
    return {ok: false, message: 'image payload is invalid'};
  }
  const phase = body.phase === 'refine' ? 'refine' : 'fast';
  const hasBase64 = typeof body.image.base64 === 'string' && body.image.base64.length > 0;
  const hasUri = typeof body.image.uri === 'string' && body.image.uri.length > 0;
  if (phase === 'refine' && !hasBase64) {
    return {ok: false, message: 'refine phase requires image.base64'};
  }
  if (!hasBase64 && !hasUri) {
    return {ok: false, message: 'image base64 or uri is required'};
  }
  if (
    !isObject(body.imageStats) ||
    typeof body.imageStats.lumaMean !== 'number' ||
    typeof body.imageStats.lumaStd !== 'number' ||
    typeof body.imageStats.highlightClipPct !== 'number' ||
    typeof body.imageStats.shadowClipPct !== 'number' ||
    typeof body.imageStats.saturationMean !== 'number'
  ) {
    return {ok: false, message: 'imageStats payload is invalid'};
  }
  return {ok: true};
};

const adjustByScene = (type, sceneProfile, qualityRiskFlags, coverage) => {
  const base = {
    exposure: 0,
    temperature: 0,
    saturation: 0,
    clarity: 0,
    denoise: 0,
  };

  if (type === 'subject') {
    base.exposure = sceneProfile === 'night' ? 0.18 : 0.12;
    base.clarity = sceneProfile === 'portrait' ? 8 : 10;
  } else if (type === 'sky') {
    base.temperature = -8;
    base.saturation = sceneProfile === 'landscape' ? 6 : 4;
    if (qualityRiskFlags.includes('highlight_clipping')) {
      base.exposure -= 0.12;
    }
  } else if (type === 'skin') {
    base.temperature = 5;
    base.saturation = -3;
    base.denoise = sceneProfile === 'night' ? 12 : 8;
    base.clarity = -2;
  } else if (type === 'background') {
    base.saturation = -4;
    base.clarity = sceneProfile === 'portrait' ? -4 : -2;
  }

  if (coverage < 0.12) {
    base.exposure *= 0.82;
    base.saturation *= 0.82;
    base.clarity *= 0.82;
  }

  if (type === 'skin') {
    base.saturation = clamp(base.saturation, -8, 6);
    base.temperature = clamp(base.temperature, -6, 8);
    base.clarity = clamp(base.clarity, -4, 8);
  }

  return base;
};

const buildLocalMaskPlan = (segmentation, sceneProfile, qualityRiskFlags) =>
  segmentation.masks.map(mask => ({
    id: `${mask.type}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    type: mask.type,
    enabled: true,
    strength: clamp(mask.coverage * 0.85 + mask.confidence * 0.15, 0.2, 1),
    confidence: clamp(mask.confidence, 0, 1),
    feather: sceneProfile === 'portrait' ? 0.42 : 0.32,
    density: 1,
    invert: false,
    edgeAwareRefine: sceneProfile === 'portrait' ? 0.62 : 0.5,
    source: 'cloud',
    recommendedBy: 'cloud_model',
    adjustments: adjustByScene(mask.type, sceneProfile, qualityRiskFlags, mask.coverage),
  }));

const conservativeFallbackResult = (request, reason = 'unknown') => {
  const phase = request.phase === 'refine' ? 'refine' : 'fast';
  const phaseRuntime = resolveAutoGradePhaseRuntime(phase);
  if (phase === 'refine') {
    return withRuntimeDiagnostics(
      {
        phase,
        sceneProfile: 'general',
        confidence: 0.45,
        globalActions: [],
        localMaskPlan: [],
        qualityRiskFlags: [],
        explanation: 'refine 超预算或不可用，已保留 fast 首版结果。',
        fallbackUsed: true,
        fallbackReason: reason,
      },
      request,
      phaseRuntime,
    );
  }

  const segmentation = createSegmentationResult({image: request.image});
  const sceneProfile = request.imageStats.lumaMean < 0.24 ? 'night' : 'general';
  return withRuntimeDiagnostics(
    {
      phase,
      sceneProfile,
      confidence: 0.54,
      globalActions: [
        {
          action: 'adjust_param',
          target: 'exposure',
          delta: request.imageStats.lumaMean < 0.24 ? 0.22 : 0.08,
        },
        {action: 'adjust_param', target: 'contrast', delta: 8},
        {
          action: 'adjust_param',
          target: 'highlights',
          delta: request.imageStats.highlightClipPct > 0.08 ? -12 : -4,
        },
        {
          action: 'adjust_param',
          target: 'shadows',
          delta: request.imageStats.shadowClipPct > 0.1 ? 14 : 8,
        },
        {
          action: 'adjust_param',
          target: 'saturation',
          delta: request.imageStats.saturationMean > 0.6 ? -8 : 4,
        },
      ],
      localMaskPlan: buildLocalMaskPlan(segmentation, sceneProfile, []),
      qualityRiskFlags: [],
      explanation: '云端模型超时，已应用保守首版调色。',
      fallbackUsed: true,
      fallbackReason: reason,
    },
    request,
    phaseRuntime,
  );
};

const buildFastHeuristicResult = request => {
  const base = conservativeFallbackResult({...request, phase: 'fast'}, 'fast_heuristic');
  return {
    ...base,
    fallbackUsed: false,
    fallbackReason: undefined,
    confidence: Math.max(base.confidence || 0.54, 0.64),
    explanation: 'fast 首版已应用，refine 将在后台继续增强。',
  };
};

const dedupe = list => list.filter((item, index, arr) => item && arr.indexOf(item) === index);

const getFastModelChain = () =>
  dedupe([
    process.env.MODEL_FAST_NAME,
    process.env.MODEL_FALLBACK_NAME,
    process.env.MODEL_PRIMARY_NAME,
    process.env.MODEL_NAME,
  ]);

const getRefineModelChain = () =>
  dedupe([
    process.env.MODEL_PRIMARY_NAME,
    process.env.MODEL_NAME,
    process.env.MODEL_FALLBACK_NAME,
    process.env.MODEL_FAST_NAME,
  ]);

const runAutoGradeFast = async request => {
  const startedAt = Date.now();
  const phaseRuntime = resolveAutoGradePhaseRuntime('fast');
  const hasBase64 = typeof request?.image?.base64 === 'string' && request.image.base64.length > 0;
  if (!hasBase64) {
    return withRuntimeDiagnostics(
      {
        ...buildFastHeuristicResult(request),
        phase: 'fast',
        latencyMs: Date.now() - startedAt,
      },
      request,
      phaseRuntime,
    );
  }

  let fastPass = null;
  try {
    fastPass = await interpretWithProvider(
      {
        mode: 'initial_visual_suggest',
        transcript: '',
        currentParams: request.currentParams,
        locale: request.locale || 'zh-CN',
        image: request.image,
        imageStats: request.imageStats,
        sceneHints: ['upload_autograde', 'fast_pass'],
      },
      {
        mode: 'initial_visual_suggest',
        timeoutMs: phaseRuntime.timeoutMs,
        totalBudgetMs: phaseRuntime.totalBudgetMs,
        modelChain: getFastModelChain(),
      },
    );
  } catch (_error) {
    return withRuntimeDiagnostics(
      {
        ...buildFastHeuristicResult(request),
        phase: 'fast',
        latencyMs: Date.now() - startedAt,
      },
      request,
      phaseRuntime,
    );
  }

  const sceneProfile = fastPass?.scene_profile || 'general';
  const qualityRiskFlags = Array.isArray(fastPass.quality_risk_flags)
    ? fastPass.quality_risk_flags
    : [];
  const globalActions = Array.isArray(fastPass.intent_actions) ? fastPass.intent_actions : [];

  const segmentation = createSegmentationResult({image: request.image});
  const localMaskPlan = buildLocalMaskPlan(segmentation, sceneProfile, qualityRiskFlags);
  const explanation = fastPass.analysis_summary || fastPass.reasoning_summary || '自动首版调色完成';
  const confidence = typeof fastPass.confidence === 'number' ? fastPass.confidence : 0.8;
  const fallbackUsed = Boolean(fastPass.fallback_used);
  const fallbackReason = fallbackUsed
    ? fastPass.fallback_reason || fastPass.fallbackReason || 'unknown'
    : undefined;

  if (!globalActions.length && !localMaskPlan.length) {
    return withRuntimeDiagnostics(
      {
        ...buildFastHeuristicResult(request),
        phase: 'fast',
        latencyMs: Date.now() - startedAt,
      },
      request,
      phaseRuntime,
    );
  }

  return withRuntimeDiagnostics(
    {
      phase: 'fast',
      sceneProfile,
      confidence,
      globalActions,
      localMaskPlan,
      qualityRiskFlags,
      explanation,
      fallbackUsed,
      fallbackReason,
      latencyMs: Date.now() - startedAt,
    },
    request,
    phaseRuntime,
  );
};

const runAutoGradeRefine = async request => {
  const startedAt = Date.now();
  const phaseRuntime = resolveAutoGradePhaseRuntime('refine');
  const refinePass = await interpretWithProvider(
    {
      mode: 'voice_refine',
      transcript: '请在保持自然的前提下细化主体、天空、肤色、背景的局部调色建议。',
      currentParams: request.currentParams,
      locale: request.locale || 'zh-CN',
      image: request.image,
      imageStats: request.imageStats,
      sceneHints: ['upload_autograde', 'refine_pass'],
    },
    {
      mode: 'voice_refine',
      timeoutMs: phaseRuntime.timeoutMs,
      totalBudgetMs: phaseRuntime.totalBudgetMs,
      modelChain: getRefineModelChain(),
    },
  );

  const sceneProfile = refinePass.scene_profile || 'general';
  const qualityRiskFlags = Array.isArray(refinePass.quality_risk_flags)
    ? refinePass.quality_risk_flags
    : [];
  const globalActions = Array.isArray(refinePass.intent_actions) ? refinePass.intent_actions : [];
  const segmentation = createSegmentationResult({image: request.image});
  const localMaskPlan = buildLocalMaskPlan(segmentation, sceneProfile, qualityRiskFlags);
  const explanation =
    refinePass.analysis_summary || refinePass.reasoning_summary || 'refine 局部增强完成';
  const confidence = typeof refinePass.confidence === 'number' ? refinePass.confidence : 0.72;
  const fallbackUsed = Boolean(refinePass.fallback_used);
  const fallbackReason = fallbackUsed
    ? refinePass.fallback_reason || refinePass.fallbackReason || 'unknown'
    : undefined;

  if (!globalActions.length && !localMaskPlan.length) {
    return withRuntimeDiagnostics(
      conservativeFallbackResult({...request, phase: 'refine'}, 'bad_payload'),
      request,
      phaseRuntime,
    );
  }

  return withRuntimeDiagnostics(
    {
      phase: 'refine',
      sceneProfile,
      confidence,
      globalActions,
      localMaskPlan,
      qualityRiskFlags,
      explanation,
      fallbackUsed,
      fallbackReason,
      latencyMs: Date.now() - startedAt,
    },
    request,
    phaseRuntime,
  );
};

const runAutoGrade = async request => {
  const phase = request.phase === 'refine' ? 'refine' : 'fast';
  if (phase === 'refine') {
    return runAutoGradeRefine(request);
  }
  return runAutoGradeFast(request);
};

module.exports = {
  validateAutoGradeRequest,
  runAutoGrade,
  conservativeFallbackResult,
  getAutoGradePhaseRuntimeConfig,
};
