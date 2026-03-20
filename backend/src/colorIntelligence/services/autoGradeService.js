const {
  validateAutoGradeRequest,
  runAutoGrade,
  conservativeFallbackResult,
} = require('../../autoGrade');
const {normalizeAutoGradeRequest} = require('../contracts/autoGrade');

const handleAutoGrade = async (requestBodyRaw, modelHealthSnapshot, options = {}) => {
  const strictMode = options.strictMode === true;
  const responseShape = options.responseShape === 'module' ? 'module' : 'legacy';
  const requestBody = normalizeAutoGradeRequest(requestBodyRaw);
  const validation = validateAutoGradeRequest(requestBody, {strictMode});
  if (!validation.ok) {
    return {
      status: 400,
      payload:
        responseShape === 'module'
          ? {
              error: {
                code: 'BAD_REQUEST',
                message: validation.message,
              },
            }
          : {error: validation.message},
    };
  }
  const phase = requestBody?.phase === 'refine' ? 'refine' : 'fast';
  if (phase === 'refine' && !modelHealthSnapshot.refineModelReady) {
    if (strictMode) {
      return {
        status: 503,
        payload: {
          error: {
            code: 'MODEL_UNAVAILABLE',
            message: 'Refine model is not ready.',
            details: {
              modelCheckError: modelHealthSnapshot.modelCheckError || '',
              missingModels: modelHealthSnapshot.missingModelIds || [],
            },
          },
        },
      };
    }
    const fallback = conservativeFallbackResult(requestBody, 'model_unavailable');
    console.warn(
      '[auto-grade-proxy] fallback',
      JSON.stringify({
        phase,
        fallback_reason: 'model_unavailable',
        model_check_error: modelHealthSnapshot.modelCheckError || '',
        missing_models: modelHealthSnapshot.missingModelIds || [],
        latency_ms: typeof fallback.latencyMs === 'number' ? fallback.latencyMs : -1,
        phase_timeout_ms: typeof fallback.phaseTimeoutMs === 'number' ? fallback.phaseTimeoutMs : -1,
        phase_budget_ms: typeof fallback.phaseBudgetMs === 'number' ? fallback.phaseBudgetMs : -1,
        payload_bytes: typeof fallback.payloadBytes === 'number' ? fallback.payloadBytes : -1,
        encode_quality: typeof fallback.encodeQuality === 'number' ? fallback.encodeQuality : -1,
        mime_type: typeof fallback.mimeType === 'string' ? fallback.mimeType : '',
      }),
    );
    return {
      status: 200,
      payload: fallback,
    };
  }

  try {
    const result = await runAutoGrade(requestBody, {strictMode});
    console.log(
      '[auto-grade-proxy] metrics',
      JSON.stringify({
        phase,
        scene_profile: result.sceneProfile || '',
        model_used: typeof result.modelUsed === 'string' ? result.modelUsed : '',
        model_route: typeof result.modelRoute === 'string' ? result.modelRoute : '',
        latency_ms: typeof result.latencyMs === 'number' ? result.latencyMs : -1,
        fallback_used: Boolean(result.fallbackUsed),
        fallback_reason: typeof result.fallbackReason === 'string' ? result.fallbackReason : '',
        phase_timeout_ms: typeof result.phaseTimeoutMs === 'number' ? result.phaseTimeoutMs : -1,
        phase_budget_ms: typeof result.phaseBudgetMs === 'number' ? result.phaseBudgetMs : -1,
        payload_bytes: typeof result.payloadBytes === 'number' ? result.payloadBytes : -1,
        encode_quality: typeof result.encodeQuality === 'number' ? result.encodeQuality : -1,
        mime_type: typeof result.mimeType === 'string' ? result.mimeType : '',
      }),
    );
    return {
      status: 200,
      payload: result,
    };
  } catch (_error) {
    if (strictMode) {
      const statusCode =
        typeof _error?.statusCode === 'number' && _error.statusCode >= 400 && _error.statusCode < 600
          ? _error.statusCode
          : 502;
      return {
        status: statusCode,
        payload: {
          error: {
            code: String(_error?.code || 'REAL_MODEL_REQUIRED'),
            message: String(_error?.message || 'Strict mode requires real model output.'),
          },
        },
      };
    }
    const fallback = conservativeFallbackResult(requestBody, 'http_5xx');
    console.warn(
      '[auto-grade-proxy] fallback',
      JSON.stringify({
        phase,
        fallback_reason: 'http_5xx',
        latency_ms: typeof fallback.latencyMs === 'number' ? fallback.latencyMs : -1,
        phase_timeout_ms: typeof fallback.phaseTimeoutMs === 'number' ? fallback.phaseTimeoutMs : -1,
        phase_budget_ms: typeof fallback.phaseBudgetMs === 'number' ? fallback.phaseBudgetMs : -1,
        payload_bytes: typeof fallback.payloadBytes === 'number' ? fallback.payloadBytes : -1,
        encode_quality: typeof fallback.encodeQuality === 'number' ? fallback.encodeQuality : -1,
        mime_type: typeof fallback.mimeType === 'string' ? fallback.mimeType : '',
      }),
    );
    return {
      status: 200,
      payload: fallback,
    };
  }
};

module.exports = {
  handleAutoGrade,
};
