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

const createStrictProviderError = (message, code, status, details) => {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (details && typeof details === 'object') {
    error.details = details;
  }
  return error;
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
    normalized.includes('model_unavailable') ||
    normalized.includes('model unavailable') ||
    normalized.includes('model does not exist') ||
    normalized.includes('model not found') ||
    normalized.includes('does not exist')
  ) {
    return 'model_unavailable';
  }
  if (
    normalized.includes('timeout') ||
    normalized.includes('budget_exceeded') ||
    normalized.includes('time out') ||
    normalized.includes('429') ||
    normalized.includes('rate limit')
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
    normalized.includes('response missing message content') ||
    normalized.includes('provider response missing message content') ||
    normalized.includes('bad payload') ||
    normalized.includes('invalid image') ||
    normalized.includes('http_400') ||
    normalized.includes('http_422') ||
    normalized.includes('invalid_request') ||
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

const classifyStrictProviderFailure = errors => {
  const list = Array.isArray(errors) ? errors : [];
  const normalized = list.map(item => ({
    code: String(item?.code || ''),
    status: Number(item?.status || 0),
    message: String(item?.message || '').toLowerCase(),
  }));

  if (
    normalized.some(
      item =>
        item.code === 'MODEL_UNAVAILABLE' ||
        item.message.includes('model does not exist') ||
        item.message.includes('model unavailable'),
    )
  ) {
    return {code: 'MODEL_UNAVAILABLE', status: 503};
  }

  if (
    normalized.some(
      item =>
        item.code === 'TIMEOUT' ||
        item.message.includes('timeout') ||
        item.message.includes('budget_exceeded'),
    )
  ) {
    return {code: 'PROVIDER_TIMEOUT', status: 504};
  }

  if (
    normalized.some(
      item =>
        item.code === 'NETWORK' ||
        item.message.includes('failed to fetch') ||
        item.message.includes('econnrefused') ||
        item.message.includes('enotfound') ||
        item.message.includes('getaddrinfo'),
    )
  ) {
    return {code: 'PROVIDER_NETWORK_ERROR', status: 502};
  }

  if (
    normalized.some(
      item =>
        item.code === 'UNSUPPORTED_RESPONSE_FORMAT' ||
        item.code === 'SCHEMA_INVALID' ||
        item.code === 'INVALID_JSON' ||
        item.code === 'BAD_PAYLOAD' ||
        item.code === 'HTTP_400' ||
        item.message.includes('invalid') ||
        item.message.includes('bad payload'),
    )
  ) {
    return {code: 'BAD_PROVIDER_PAYLOAD', status: 502};
  }

  if (normalized.some(item => item.status === 401 || item.status === 403)) {
    return {code: 'PROVIDER_AUTH_ERROR', status: 502};
  }

  return {code: 'REAL_MODEL_REQUIRED', status: 502};
};

const fetchProviderModelIds = async (options = {}) => {
  const baseUrl = String(process.env.MODEL_BASE_URL || '').trim();
  const apiKey = String(process.env.MODEL_API_KEY || '').trim();
  const timeoutMs = Number(options.timeoutMs || process.env.MODEL_LIST_TIMEOUT_MS || 6000);

  if (!baseUrl || !apiKey) {
    return {
      ok: false,
      modelIds: [],
      error: 'missing_model_provider_config',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        modelIds: [],
        error: `http_${response.status}`,
      };
    }
    const payload = await response.json().catch(() => ({}));
    const modelIds = Array.isArray(payload?.data)
      ? payload.data
          .map(item => (item && typeof item.id === 'string' ? item.id.trim() : ''))
          .filter(Boolean)
      : [];
    return {
      ok: true,
      modelIds,
      error: '',
    };
  } catch (error) {
    if (error && error.name === 'AbortError') {
      return {
        ok: false,
        modelIds: [],
        error: 'timeout',
      };
    }
    return {
      ok: false,
      modelIds: [],
      error: String(error?.message || 'unknown'),
    };
  } finally {
    clearTimeout(timer);
  }
};

const appendModelMetadata = (normalized, modelName, route, latencyMs) => {
  const usesBackupModel =
    route === 'fallback_model' || String(route || '').startsWith('fallback_model');
  return {
    ...normalized,
    reasoning_summary: `${normalized.reasoning_summary} | model_used:${modelName} | route:${route}`,
    // "fallback_used" means degraded output (parser/local fallback), not "used backup cloud model".
    fallback_used: Boolean(normalized.fallback_used || normalized.source === 'fallback'),
    model_used: modelName,
    model_route: route,
    model_fallback_used: usesBackupModel,
    latency_ms: latencyMs,
  };
};

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
  strictMode = false,
}) => {
  const startAt = Date.now();
  const raw = await provider(request, {model: modelName, timeoutMs});
  const normalized = normalizeInterpretResponse(raw);

  if (!normalized) {
    const keyList =
      raw && typeof raw === 'object'
        ? Object.keys(raw).slice(0, 12).join(',')
        : '';
    const error = new Error(
      `provider schema invalid${keyList ? ` keys:${keyList}` : ''}`,
    );
    error.code = 'SCHEMA_INVALID';
    throw error;
  }

  if (
    strictMode &&
    (normalized.fallback_used === true || String(normalized.source || '') === 'fallback')
  ) {
    throw createStrictProviderError(
      'Fallback output is not allowed in strict mode.',
      'REAL_MODEL_REQUIRED',
      502,
    );
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
  const strictMode = runtimeOptions.strictMode === true;

  if (!dedupedChain.length) {
    if (strictMode) {
      throw createStrictProviderError(
        'Missing model configuration in strict mode.',
        'MODEL_UNAVAILABLE',
        503,
      );
    }
    console.warn('[provider] missing primary model, use parser fallback');
    return fallbackWithMetadata(request, 'missing_model_config');
  }

  const errors = [];
  const attemptErrors = [];
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
        strictMode,
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
      attemptErrors.push({
        code: String(error?.code || ''),
        status: Number(error?.status || 0),
        message,
      });
      if (Date.now() - startedAt >= totalBudgetMs) {
        errors.push(`budget_exceeded:${totalBudgetMs}`);
        attemptErrors.push({
          code: 'TIMEOUT',
          status: 504,
          message: `budget_exceeded:${totalBudgetMs}`,
        });
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

  if (strictMode) {
    const strictFailure = classifyStrictProviderFailure(attemptErrors);
    throw createStrictProviderError(
      `strict_model_chain_failed:${reason}`,
      strictFailure.code,
      strictFailure.status,
      {attemptErrors},
    );
  }

  console.warn('[provider] use parser fallback due to:', reason);
  return fallbackWithMetadata(request, reason);
};

module.exports = {
  interpretWithProvider,
  isRetryableModelError,
  inferFallbackReasonFromProviderReason,
  fetchProviderModelIds,
};
