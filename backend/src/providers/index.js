const {normalizeInterpretResponse} = require('../contracts');
const {interpretWithOpenAICompat} = require('./openaiCompat');
const {fallbackInterpret} = require('./fallback');
const {
  estimateSceneProfile,
  detectQualityRiskFlags,
  recommendIntensity,
  intensityScale,
  scaleActionByIntensity,
  applySafetyToAction,
  buildSafetyClampActions,
  splitLayeredActions,
} = require('./quality');

const providerMap = {
  openai_compat: interpretWithOpenAICompat,
};

const isRetryableModelError = error => {
  if (!error) {
    return false;
  }

  if (
    error.code === 'TIMEOUT' ||
    error.code === 'NETWORK' ||
    error.code === 'SCHEMA_INVALID' ||
    error.code === 'MODEL_UNAVAILABLE' ||
    error.code === 'UNSUPPORTED_RESPONSE_FORMAT'
  ) {
    return true;
  }

  const status = Number(error.status || String(error.code || '').replace('HTTP_', ''));
  if (!Number.isFinite(status)) {
    return false;
  }

  return status === 429 || status >= 500;
};

const appendModelMetadata = (normalized, modelName, route, latencyMs) => ({
  ...normalized,
  reasoning_summary: `${normalized.reasoning_summary} | model_used:${modelName} | route:${route}`,
  fallback_used: Boolean(normalized.fallback_used || route === 'fallback_model'),
  model_used: modelName,
  latency_ms: latencyMs,
});

const postProcessInterpretation = (normalized, request) => {
  const mode =
    request?.mode === 'initial_visual_suggest' || request?.mode === 'voice_refine'
      ? request.mode
      : 'voice_refine';
  const sceneProfile =
    typeof normalized.scene_profile === 'string' && normalized.scene_profile
      ? normalized.scene_profile
      : estimateSceneProfile(request?.imageStats, request?.sceneHints);
  const qualityRiskFlags = Array.isArray(normalized.quality_risk_flags)
    ? normalized.quality_risk_flags
    : detectQualityRiskFlags(request?.imageStats);
  const recommendedIntensity =
    normalized.recommended_intensity ||
    recommendIntensity({
      imageStats: request?.imageStats,
      sceneProfile,
    });
  const scale = intensityScale(recommendedIntensity);

  const sourceActions = Array.isArray(normalized.intent_actions)
    ? normalized.intent_actions
    : [];
  const intensityScaled = sourceActions.map(action =>
    mode === 'initial_visual_suggest' ? scaleActionByIntensity(action, scale) : action,
  );
  const protectedActions = intensityScaled.map(action =>
    applySafetyToAction({
      action,
      sceneProfile,
      imageStats: request?.imageStats,
    }),
  );
  const safetyClampActions = buildSafetyClampActions({
    imageStats: request?.imageStats,
    sceneProfile,
    qualityRiskFlags,
  }).map(action =>
    applySafetyToAction({
      action,
      sceneProfile,
      imageStats: request?.imageStats,
    }),
  );

  const layeredActions = splitLayeredActions(protectedActions, safetyClampActions);
  const finalActions = [
    ...layeredActions.global_base,
    ...layeredActions.scene_refine,
    ...layeredActions.safety_clamp,
  ];

  return {
    ...normalized,
    intent_actions: finalActions,
    global_base: layeredActions.global_base,
    scene_refine: layeredActions.scene_refine,
    safety_clamp: layeredActions.safety_clamp,
    scene_profile: sceneProfile,
    scene_confidence:
      typeof normalized.scene_confidence === 'number'
        ? normalized.scene_confidence
        : request?.imageStats
          ? 0.72
          : 0.55,
    quality_risk_flags: qualityRiskFlags,
    recommended_intensity: recommendedIntensity || 'normal',
  };
};

const invokeModelAndNormalize = async ({
  provider,
  request,
  modelName,
  timeoutMs,
  route,
}) => {
  const startAt = Date.now();
  const raw = await provider(request, {model: modelName, timeoutMs});
  const normalized = normalizeInterpretResponse(raw);

  if (!normalized) {
    const error = new Error('provider schema invalid');
    error.code = 'SCHEMA_INVALID';
    throw error;
  }

  const withMetadata = appendModelMetadata(
    normalized,
    modelName,
    route,
    Date.now() - startAt,
  );
  return postProcessInterpretation(withMetadata, request);
};

const fallbackWithMetadata = (request, reason) => {
  const fallbackRaw = fallbackInterpret(request);
  const fallback = normalizeInterpretResponse(fallbackRaw);
  if (!fallback) {
    return {
      intent_actions: [],
      confidence: 0,
      reasoning_summary: `fallback parser invalid | route:fallback_parser | reason:${reason}`,
      fallback_used: true,
      needsConfirmation: true,
      message: 'fallback parse invalid',
      source: 'fallback',
      analysis_summary: '',
      applied_profile: '',
      scene_profile: estimateSceneProfile(request?.imageStats, request?.sceneHints),
      scene_confidence: 0.2,
      quality_risk_flags: detectQualityRiskFlags(request?.imageStats),
      recommended_intensity: 'normal',
      model_used: 'local_fallback_parser',
      latency_ms: 0,
      global_base: [],
      scene_refine: [],
      safety_clamp: [],
    };
  }
  const withMetadata = {
    ...fallback,
    reasoning_summary: `${fallback.reasoning_summary} | route:fallback_parser | reason:${reason}`,
    model_used: 'local_fallback_parser',
    latency_ms: 0,
  };
  return postProcessInterpretation(withMetadata, request);
};

const interpretWithProvider = async request => {
  const providerName = process.env.MODEL_PROVIDER || 'openai_compat';
  const provider = providerMap[providerName] || providerMap.openai_compat;
  const timeoutMs = Number(process.env.MODEL_TIMEOUT_MS || 8000);
  const configuredPrimary =
    process.env.MODEL_PRIMARY_NAME ||
    process.env.MODEL_NAME ||
    'Qwen/Qwen3-VL-32B-Instruct';
  const configuredFallback =
    process.env.MODEL_FALLBACK_NAME || 'Qwen/Qwen3-VL-8B-Instruct';
  const preferredSecondary = 'Qwen/Qwen2.5-VL-32B-Instruct';

  const modelChain = [
    configuredPrimary,
    preferredSecondary,
    configuredFallback,
  ].filter((model, index, arr) => model && arr.indexOf(model) === index);

  if (!modelChain.length) {
    console.warn('[provider] missing primary model, use parser fallback');
    return fallbackWithMetadata(request, 'missing_model_config');
  }

  const errors = [];
  for (let index = 0; index < modelChain.length; index += 1) {
    const modelName = modelChain[index];
    try {
      return await invokeModelAndNormalize({
        provider,
        request,
        modelName,
        timeoutMs,
        route: index === 0 ? 'primary_model' : `fallback_model_${index}`,
      });
    } catch (error) {
      const message = error && error.message ? error.message : 'unknown_error';
      errors.push(`${modelName}:${message}`);
      const continueNext = index < modelChain.length - 1 && isRetryableModelError(error);
      if (!continueNext) {
        break;
      }
    }
  }

  const reason = errors.length
    ? `model_chain_failed:${errors.join('|')}`
    : 'model_chain_failed:unknown';
  console.warn('[provider] use parser fallback due to:', reason);
  return fallbackWithMetadata(request, reason);
};

module.exports = {
  interpretWithProvider,
  isRetryableModelError,
};
