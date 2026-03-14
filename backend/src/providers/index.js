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

const inferFallbackReasonFromProviderReason = reason => {
  const normalized = String(reason || '').toLowerCase();
  if (!normalized) {
    return 'unknown';
  }
  if (
    normalized.includes('timeout') ||
    normalized.includes('budget_exceeded') ||
    normalized.includes('time out') ||
    normalized.includes('429')
  ) {
    return 'timeout';
  }
  if (
    normalized.includes('enotfound') ||
    normalized.includes('getaddrinfo') ||
    normalized.includes('dns')
  ) {
    return 'dns_error';
  }
  if (
    normalized.includes('network') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('econnrefused') ||
    normalized.includes('host unreachable')
  ) {
    return 'host_unreachable';
  }
  if (
    normalized.includes('401') ||
    normalized.includes('403') ||
    normalized.includes('invalid api key') ||
    normalized.includes('unauthorized') ||
    normalized.includes('forbidden') ||
    normalized.includes('auth')
  ) {
    return 'auth_error';
  }
  if (
    normalized.includes('http_5') ||
    normalized.includes('status 5') ||
    normalized.includes('service unavailable')
  ) {
    return 'http_5xx';
  }
  if (
    normalized.includes('schema invalid') ||
    normalized.includes('invalid json') ||
    normalized.includes('bad payload') ||
    normalized.includes('invalid image') ||
    normalized.includes('image_url provided is not a valid image') ||
    normalized.includes('verify image file failed') ||
    normalized.includes('broken png') ||
    normalized.includes('bad header checksum') ||
    normalized.includes('cannot identify image')
  ) {
    return 'bad_payload';
  }
  return 'unknown';
};

const appendModelMetadata = (normalized, modelName, route, latencyMs) => ({
  ...normalized,
  reasoning_summary: `${normalized.reasoning_summary} | model_used:${modelName} | route:${route}`,
  fallback_used: Boolean(
    normalized.fallback_used ||
      route === 'fallback_model' ||
      String(route || '').startsWith('fallback_model'),
  ),
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
  const fallbackReason = inferFallbackReasonFromProviderReason(reason);
  if (!fallback) {
    return {
      intent_actions: [],
      confidence: 0,
      reasoning_summary: `fallback parser invalid | route:fallback_parser | reason:${reason}`,
      fallback_used: true,
      fallback_reason: fallbackReason,
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
    fallback_reason: fallbackReason,
    model_used: 'local_fallback_parser',
    latency_ms: 0,
  };
  return postProcessInterpretation(withMetadata, request);
};

const interpretWithProvider = async (request, runtimeOptions = {}) => {
  const providerName = process.env.MODEL_PROVIDER || 'openai_compat';
  const provider = providerMap[providerName] || providerMap.openai_compat;
  const mode =
    runtimeOptions.mode === 'initial_visual_suggest' || runtimeOptions.mode === 'voice_refine'
      ? runtimeOptions.mode
      : request?.mode === 'initial_visual_suggest' || request?.mode === 'voice_refine'
        ? request.mode
      : 'voice_refine';
  const timeoutMs = Number(
    runtimeOptions.timeoutMs ??
      (mode === 'initial_visual_suggest'
        ? process.env.MODEL_TIMEOUT_MS_INITIAL || process.env.MODEL_TIMEOUT_MS || 9000
        : process.env.MODEL_TIMEOUT_MS_VOICE || process.env.MODEL_TIMEOUT_MS || 12000),
  );
  const totalBudgetMs = Number(
    runtimeOptions.totalBudgetMs ??
      (mode === 'initial_visual_suggest'
        ? process.env.MODEL_TOTAL_BUDGET_MS_INITIAL || 18000
        : process.env.MODEL_TOTAL_BUDGET_MS_VOICE || 26000),
  );
  const configuredPrimary =
    process.env.MODEL_PRIMARY_NAME ||
    process.env.MODEL_NAME ||
    'Qwen/Qwen3-VL-32B-Instruct';
  const configuredFallback =
    process.env.MODEL_FALLBACK_NAME || 'Qwen/Qwen3-VL-8B-Instruct';
  const configuredFast =
    process.env.MODEL_FAST_NAME || process.env.MODEL_FALLBACK_NAME || 'Qwen/Qwen2.5-VL-32B-Instruct';

  const modelChain = Array.isArray(runtimeOptions.modelChain)
    ? runtimeOptions.modelChain
    : mode === 'initial_visual_suggest'
      ? [configuredFast, configuredPrimary, configuredFallback]
      : [configuredPrimary, configuredFallback, configuredFast];
  const dedupedChain = modelChain.filter((model, index, arr) => model && arr.indexOf(model) === index);

  if (!dedupedChain.length) {
    console.warn('[provider] missing primary model, use parser fallback');
    return fallbackWithMetadata(request, 'missing_model_config');
  }

  const errors = [];
  const startedAt = Date.now();
  for (let index = 0; index < dedupedChain.length; index += 1) {
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= totalBudgetMs) {
      errors.push(`budget_exceeded:${totalBudgetMs}`);
      break;
    }
    const remainingBudgetMs = totalBudgetMs - elapsedMs;
    // Enforce hard deadline across model chain attempts.
    // Each model call gets capped by remaining budget so we never exceed totalBudgetMs by much.
    const attemptTimeoutMs = Math.max(300, Math.min(timeoutMs, remainingBudgetMs));
    if (attemptTimeoutMs <= 300 && remainingBudgetMs <= 300) {
      errors.push(`budget_exceeded:${totalBudgetMs}`);
      break;
    }
    const modelName = dedupedChain[index];
    try {
      return await invokeModelAndNormalize({
        provider,
        request,
        modelName,
        timeoutMs: attemptTimeoutMs,
        route:
          mode === 'initial_visual_suggest'
            ? index === 0
              ? 'fast_path_model'
              : `fallback_model_${index}`
            : index === 0
              ? 'primary_model'
              : `fallback_model_${index}`,
      });
    } catch (error) {
      const message = error && error.message ? error.message : 'unknown_error';
      errors.push(`${modelName}:${message}`);
      if (Date.now() - startedAt >= totalBudgetMs) {
        errors.push(`budget_exceeded:${totalBudgetMs}`);
        break;
      }
      const continueNext = index < dedupedChain.length - 1 && isRetryableModelError(error);
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
  inferFallbackReasonFromProviderReason,
};
