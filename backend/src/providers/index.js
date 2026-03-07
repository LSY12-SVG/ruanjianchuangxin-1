const {normalizeInterpretResponse} = require('../contracts');
const {interpretWithOpenAICompat} = require('./openaiCompat');
const {fallbackInterpret} = require('./fallback');

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
    error.code === 'SCHEMA_INVALID'
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

  return appendModelMetadata(normalized, modelName, route, Date.now() - startAt);
};

const fallbackWithMetadata = (request, reason) => {
  const fallback = fallbackInterpret(request);
  return {
    ...fallback,
    reasoning_summary: `${fallback.reasoning_summary} | route:fallback_parser | reason:${reason}`,
    model_used: 'local_fallback_parser',
    latency_ms: 0,
  };
};

const interpretWithProvider = async request => {
  const providerName = process.env.MODEL_PROVIDER || 'openai_compat';
  const provider = providerMap[providerName] || providerMap.openai_compat;
  const timeoutMs = Number(process.env.MODEL_TIMEOUT_MS || 8000);
  const primaryModel =
    process.env.MODEL_PRIMARY_NAME ||
    process.env.MODEL_NAME ||
    'Qwen/Qwen2.5-VL-32B-Instruct';
  const fallbackModel =
    process.env.MODEL_FALLBACK_NAME || 'Qwen/Qwen3-VL-8B-Instruct';

  if (!primaryModel) {
    console.warn('[provider] missing primary model, use parser fallback');
    return fallbackWithMetadata(request, 'missing_model_config');
  }

  try {
    return await invokeModelAndNormalize({
      provider,
      request,
      modelName: primaryModel,
      timeoutMs,
      route: 'primary_model',
    });
  } catch (error) {
    const primaryMessage = error && error.message ? error.message : 'unknown_error';
    const shouldTryFallbackModel =
      fallbackModel &&
      fallbackModel !== primaryModel &&
      isRetryableModelError(error);

    if (shouldTryFallbackModel) {
      try {
        return await invokeModelAndNormalize({
          provider,
          request,
          modelName: fallbackModel,
          timeoutMs,
          route: 'fallback_model',
        });
      } catch (fallbackError) {
        const fallbackMessage =
          fallbackError && fallbackError.message
            ? fallbackError.message
            : 'unknown_error';
        console.warn(
          '[provider] model fallback failed:',
          primaryMessage,
          '->',
          fallbackMessage,
        );
        return fallbackWithMetadata(
          request,
          `model_failed:${primaryMessage}|fallback_failed:${fallbackMessage}`,
        );
      }
    }

    console.warn('[provider] use parser fallback due to:', primaryMessage);
    return fallbackWithMetadata(request, `model_failed:${primaryMessage}`);
  }
};

module.exports = {
  interpretWithProvider,
  isRetryableModelError,
};
