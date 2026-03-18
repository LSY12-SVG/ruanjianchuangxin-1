const {validateInterpretRequest, normalizeInterpretResponse} = require('../../contracts');
const {interpretWithProvider} = require('../../providers');
const {normalizeInterpretRequest} = require('../contracts/interpret');

const toNumber = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const buildModelChain = preferFast => {
  const chain = preferFast
    ? [
        process.env.MODEL_FAST_NAME,
        process.env.MODEL_FALLBACK_NAME,
        process.env.MODEL_PRIMARY_NAME,
        process.env.MODEL_NAME,
      ]
    : [
        process.env.MODEL_PRIMARY_NAME,
        process.env.MODEL_FALLBACK_NAME,
        process.env.MODEL_FAST_NAME,
        process.env.MODEL_NAME,
      ];
  return chain.filter((item, index, arr) => item && arr.indexOf(item) === index);
};

const resolveInterpretRuntimeOptions = mode => {
  const isFast = mode === 'initial_visual_suggest';
  return {
    mode,
    timeoutMs: isFast
      ? toNumber(process.env.INTERPRET_FAST_TIMEOUT_MS, 2600)
      : toNumber(process.env.INTERPRET_VOICE_TIMEOUT_MS, 4500),
    totalBudgetMs: isFast
      ? toNumber(process.env.INTERPRET_FAST_BUDGET_MS, 3600)
      : toNumber(process.env.INTERPRET_VOICE_BUDGET_MS, 8000),
    modelChain: buildModelChain(true),
  };
};

const handleInterpret = async requestBodyRaw => {
  const requestBody = normalizeInterpretRequest(requestBodyRaw);
  const validation = validateInterpretRequest(requestBody);
  if (!validation.ok) {
    return {
      status: 400,
      payload: {
        error: validation.message,
      },
    };
  }

  let providerResult;
  try {
    providerResult = await interpretWithProvider(
      requestBody,
      resolveInterpretRuntimeOptions(requestBody.mode),
    );
  } catch (error) {
    return {
      status: 502,
      payload: {
        intent_actions: [],
        confidence: 0,
        reasoning_summary: String(error?.message || 'provider execution failed'),
        fallback_used: true,
        needsConfirmation: true,
        message: '语义服务暂时不可用',
        source: 'fallback',
        analysis_summary: '',
        applied_profile: '',
        scene_profile: 'general',
        scene_confidence: 0,
        quality_risk_flags: [],
        recommended_intensity: 'normal',
        fallback_reason: 'unknown',
      },
    };
  }

  const interpreted = normalizeInterpretResponse(providerResult);
  if (!interpreted) {
    return {
      status: 502,
      payload: {
        intent_actions: [],
        confidence: 0,
        reasoning_summary: 'provider returned invalid schema',
        fallback_used: true,
        needsConfirmation: true,
        message: '语义服务暂时不可用',
        source: 'fallback',
        analysis_summary: '',
        applied_profile: '',
        scene_profile: 'general',
        scene_confidence: 0,
        quality_risk_flags: [],
        recommended_intensity: 'normal',
      },
    };
  }

  console.log(
    '[voice-agent-proxy] metrics',
    JSON.stringify({
      mode: requestBody.mode,
      model_used:
        typeof providerResult?.model_used === 'string'
          ? providerResult.model_used
          : 'unknown',
      latency_ms:
        typeof providerResult?.latency_ms === 'number'
          ? providerResult.latency_ms
          : -1,
      fallback_used: interpreted.fallback_used,
      fallback_reason:
        typeof interpreted?.fallback_reason === 'string' ? interpreted.fallback_reason : '',
      confidence: interpreted.confidence,
      scene_profile: interpreted.scene_profile || '',
      recommended_intensity: interpreted.recommended_intensity || 'normal',
      quality_risk_flags: Array.isArray(interpreted.quality_risk_flags)
        ? interpreted.quality_risk_flags
        : [],
    }),
  );

  return {
    status: 200,
    payload: interpreted,
  };
};

module.exports = {
  handleInterpret,
};
