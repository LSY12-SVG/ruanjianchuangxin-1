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
      ? toNumber(process.env.INTERPRET_FAST_TIMEOUT_MS, 15000)
      : toNumber(process.env.INTERPRET_VOICE_TIMEOUT_MS, 7000),
    totalBudgetMs: isFast
      ? toNumber(process.env.INTERPRET_FAST_BUDGET_MS, 20000)
      : toNumber(process.env.INTERPRET_VOICE_BUDGET_MS, 14000),
    modelChain: buildModelChain(true),
  };
};

const toModuleInterpretPayload = interpreted => ({
  actions: Array.isArray(interpreted.intent_actions) ? interpreted.intent_actions : [],
  confidence: Number.isFinite(interpreted.confidence) ? interpreted.confidence : 0,
  reasoningSummary: interpreted.reasoning_summary || '',
  needsConfirmation:
    typeof interpreted.needsConfirmation === 'boolean' ? interpreted.needsConfirmation : true,
  message: interpreted.message || '',
  source: interpreted.source || 'cloud',
  analysisSummary: interpreted.analysis_summary || '',
  appliedProfile: interpreted.applied_profile || '',
  sceneProfile: interpreted.scene_profile || 'general',
  sceneConfidence:
    typeof interpreted.scene_confidence === 'number' ? interpreted.scene_confidence : 0,
  qualityRiskFlags: Array.isArray(interpreted.quality_risk_flags)
    ? interpreted.quality_risk_flags
    : [],
  recommendedIntensity: interpreted.recommended_intensity || 'normal',
  modelUsed: typeof interpreted.model_used === 'string' ? interpreted.model_used : '',
  modelRoute: typeof interpreted.model_route === 'string' ? interpreted.model_route : '',
  latencyMs: typeof interpreted.latency_ms === 'number' ? interpreted.latency_ms : -1,
});

const toInterpretError = error => {
  const code = String(error?.code || '');
  const status = Number(error?.status || 0);
  if (status >= 400 && status < 600 && code) {
    return {
      status,
      payload: {
        error: {
          code,
          message: String(error?.message || 'interpret_failed'),
        },
      },
    };
  }

  if (code === 'MODEL_UNAVAILABLE') {
    return {
      status: 503,
      payload: {
        error: {
          code: 'MODEL_UNAVAILABLE',
          message: String(error?.message || 'Model is unavailable.'),
        },
      },
    };
  }
  if (code === 'PROVIDER_TIMEOUT' || code === 'TIMEOUT') {
    return {
      status: 504,
      payload: {
        error: {
          code: 'PROVIDER_TIMEOUT',
          message: String(error?.message || 'Provider timeout.'),
        },
      },
    };
  }

  return {
    status: 502,
    payload: {
      error: {
        code: 'REAL_MODEL_REQUIRED',
        message: String(error?.message || 'Strict mode requires real model output.'),
      },
    },
  };
};

const handleInterpret = async (requestBodyRaw, options = {}) => {
  const strictMode = options.strictMode === true;
  const responseShape = options.responseShape === 'module' ? 'module' : 'legacy';
  const requestBody = normalizeInterpretRequest(requestBodyRaw);
  if (options.forceMode === 'initial_visual_suggest' || options.forceMode === 'voice_refine') {
    requestBody.mode = options.forceMode;
  }
  const validation = validateInterpretRequest(requestBody);
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
          : {
              error: validation.message,
            },
    };
  }

  let providerResult;
  try {
    providerResult = await interpretWithProvider(
      requestBody,
      {
        ...resolveInterpretRuntimeOptions(requestBody.mode),
        strictMode,
      },
    );
  } catch (error) {
    if (strictMode) {
      return toInterpretError(error);
    }
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
    if (strictMode) {
      return {
        status: 502,
        payload: {
          error: {
            code: 'BAD_PROVIDER_PAYLOAD',
            message: 'provider returned invalid schema',
          },
        },
      };
    }
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
      raw_action_count:
        interpreted &&
        interpreted.action_debug &&
        typeof interpreted.action_debug.raw_action_count === 'number'
          ? interpreted.action_debug.raw_action_count
          : -1,
      normalized_action_count:
        interpreted &&
        interpreted.action_debug &&
        typeof interpreted.action_debug.normalized_action_count === 'number'
          ? interpreted.action_debug.normalized_action_count
          : -1,
      final_action_count: Array.isArray(interpreted.intent_actions)
        ? interpreted.intent_actions.length
        : -1,
      dropped_action_count:
        interpreted &&
        interpreted.action_debug &&
        typeof interpreted.action_debug.dropped_action_count === 'number'
          ? interpreted.action_debug.dropped_action_count
          : -1,
      dropped_reason_counts:
        interpreted &&
        interpreted.action_debug &&
        interpreted.action_debug.dropped_reason_counts &&
        typeof interpreted.action_debug.dropped_reason_counts === 'object'
          ? interpreted.action_debug.dropped_reason_counts
          : {},
    }),
  );

  if (strictMode && (interpreted.fallback_used || interpreted.source === 'fallback')) {
    return {
      status: 502,
      payload: {
        error: {
          code: 'REAL_MODEL_REQUIRED',
          message: 'Fallback output is not allowed in strict mode.',
        },
      },
    };
  }

  return {
    status: 200,
    payload: responseShape === 'module' ? toModuleInterpretPayload(interpreted) : interpreted,
  };
};

module.exports = {
  handleInterpret,
};
