const path = require('path');
require('dotenv').config({path: path.resolve(__dirname, '../.env')});

const cors = require('cors');
const express = require('express');
const {validateInterpretRequest, normalizeInterpretResponse} = require('./contracts');
const {interpretWithProvider} = require('./providers');
const {initializeCommunityModule} = require('./community');
const {initializeAccountModule} = require('./account');
const {initializeSegmentationModule} = require('./segmentation/controller');
const {
  validateAgentPlanRequest,
  normalizeAgentPlanResponse,
  validateExecuteRequest,
  validateMemoryUpsertRequest,
} = require('./agentContracts');
const {planAgentActions} = require('./agentPlanner');
const {
  validateAutoGradeRequest,
  runAutoGrade,
  conservativeFallbackResult,
  getAutoGradePhaseRuntimeConfig,
} = require('./autoGrade');

const app = express();
const port = Number(process.env.PORT || 8787);
const agentMemory = new Map();
let communityModule = null;
let accountModule = null;
let segmentationModule = null;

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

app.use(cors());
app.use(express.json({limit: '12mb'}));

app.get('/health', (_req, res) => {
  res.json({ok: true, service: 'visiongenie-color-agent-proxy'});
});

app.post('/v1/color/interpret', async (req, res) => {
  const validation = validateInterpretRequest(req.body);
  if (!validation.ok) {
    res.status(400).json({
      error: validation.message,
    });
    return;
  }

  const requestPayload = {
    mode: req.body.mode,
    transcript: req.body.transcript,
    currentParams: req.body.currentParams,
    locale: req.body.locale,
    sceneHints: Array.isArray(req.body.sceneHints) ? req.body.sceneHints : [],
    image: req.body.image,
    imageStats: req.body.imageStats,
  };

  const providerResult = await interpretWithProvider(
    requestPayload,
    resolveInterpretRuntimeOptions(requestPayload.mode),
  );
  const interpreted = normalizeInterpretResponse(providerResult);

  if (!interpreted) {
    res.status(502).json({
      intent_actions: [],
      global_base: [],
      scene_refine: [],
      safety_clamp: [],
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
    });
    return;
  }

  console.log(
    '[voice-agent-proxy] metrics',
    JSON.stringify({
      mode: requestPayload.mode,
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

  res.json(interpreted);
});

app.post('/v1/color/auto-grade', async (req, res) => {
  const validation = validateAutoGradeRequest(req.body);
  if (!validation.ok) {
    res.status(400).json({error: validation.message});
    return;
  }

  try {
    const result = await runAutoGrade(req.body);
    console.log(
      '[auto-grade-proxy] metrics',
      JSON.stringify({
        phase: req.body?.phase === 'refine' ? 'refine' : 'fast',
        scene_profile: result.sceneProfile || '',
        latency_ms: typeof result.latencyMs === 'number' ? result.latencyMs : -1,
        fallback_used: Boolean(result.fallbackUsed),
        fallback_reason: typeof result.fallbackReason === 'string' ? result.fallbackReason : '',
        phase_timeout_ms:
          typeof result.phaseTimeoutMs === 'number' ? result.phaseTimeoutMs : -1,
        phase_budget_ms:
          typeof result.phaseBudgetMs === 'number' ? result.phaseBudgetMs : -1,
        payload_bytes: typeof result.payloadBytes === 'number' ? result.payloadBytes : -1,
        encode_quality: typeof result.encodeQuality === 'number' ? result.encodeQuality : -1,
        mime_type: typeof result.mimeType === 'string' ? result.mimeType : '',
      }),
    );
    res.json(result);
  } catch (error) {
    const fallback = conservativeFallbackResult(req.body, 'http_5xx');
    console.warn(
      '[auto-grade-proxy] fallback',
      JSON.stringify({
        phase: req.body?.phase === 'refine' ? 'refine' : 'fast',
        fallback_reason: 'http_5xx',
        latency_ms: typeof fallback.latencyMs === 'number' ? fallback.latencyMs : -1,
        phase_timeout_ms:
          typeof fallback.phaseTimeoutMs === 'number' ? fallback.phaseTimeoutMs : -1,
        phase_budget_ms:
          typeof fallback.phaseBudgetMs === 'number' ? fallback.phaseBudgetMs : -1,
        payload_bytes: typeof fallback.payloadBytes === 'number' ? fallback.payloadBytes : -1,
        encode_quality: typeof fallback.encodeQuality === 'number' ? fallback.encodeQuality : -1,
        mime_type: typeof fallback.mimeType === 'string' ? fallback.mimeType : '',
      }),
    );
    res.status(200).json(fallback);
  }
});

app.post('/v1/agent/plan', async (req, res) => {
  const validation = validateAgentPlanRequest(req.body);
  if (!validation.ok) {
    res.status(400).json({error: validation.message});
    return;
  }

  const rawPlan = planAgentActions(req.body);
  const normalized = normalizeAgentPlanResponse(rawPlan);
  if (!normalized) {
    res.status(500).json({error: 'agent plan normalization failed'});
    return;
  }

  res.json(normalized);
});

app.post('/v1/agent/execute', async (req, res) => {
  const validation = validateExecuteRequest(req.body);
  if (!validation.ok) {
    res.status(400).json({error: validation.message});
    return;
  }

  const actions = validation.actions || [];
  res.json({
    applied_actions: actions,
    failed_actions: [],
    rollback_available: true,
  });
});

app.post('/v1/agent/memory/upsert', async (req, res) => {
  const validation = validateMemoryUpsertRequest(req.body);
  if (!validation.ok) {
    res.status(400).json({error: validation.message});
    return;
  }

  agentMemory.set(req.body.key, req.body.value);
  res.json({ok: true});
});

app.post('/v1/agent/memory/query', async (req, res) => {
  const key = typeof req.body?.key === 'string' ? req.body.key : '';
  if (!key) {
    res.status(400).json({error: 'key is required'});
    return;
  }

  res.json({
    ok: true,
    key,
    value: agentMemory.has(key) ? agentMemory.get(key) : null,
  });
});

const startServer = async () => {
  try {
    segmentationModule = await initializeSegmentationModule();
    if (segmentationModule.enabled && segmentationModule.router) {
      app.use('/v1/color', segmentationModule.router);
      console.log('[segmentation] module enabled');
    }
  } catch (error) {
    console.error('[segmentation] module init failed:', error);
  }

  try {
    accountModule = await initializeAccountModule({
      getCommunityPostsCount: async ({userId, username}) => {
        if (!communityModule?.enabled || !communityModule?.repo?.countPublishedByAuthorIdentity) {
          return null;
        }
        return communityModule.repo.countPublishedByAuthorIdentity({userId, username});
      },
    });
    if (accountModule.enabled && accountModule.authRouter && accountModule.profileRouter) {
      app.use('/v1/auth', accountModule.authRouter);
      app.use('/v1/profile', accountModule.profileRouter);
      console.log('[account] module enabled');
    } else {
      const reason =
        typeof accountModule.reason === 'string'
          ? accountModule.reason
          : 'account_disabled';
      console.warn(`[account] module disabled: ${reason}`);
    }
  } catch (error) {
    console.error('[account] module init failed:', error);
  }

  try {
    communityModule = await initializeCommunityModule({
      authMiddleware: accountModule?.authMiddleware,
      optionalAuthMiddleware: accountModule?.optionalAuthMiddleware,
    });
    if (communityModule.enabled && communityModule.router) {
      app.use('/v1/community', communityModule.router);
      console.log('[community] module enabled');
    } else {
      const reason =
        typeof communityModule.reason === 'string'
          ? communityModule.reason
          : 'community_disabled';
      console.warn(`[community] module disabled: ${reason}`);
    }
  } catch (error) {
    console.error('[community] module init failed:', error);
  }

  app.listen(port, () => {
    const runtime = getAutoGradePhaseRuntimeConfig();
    console.log(
      '[auto-grade-proxy] runtime',
      JSON.stringify({
        fast_timeout_ms: runtime.fast.timeoutMs,
        fast_budget_ms: runtime.fast.totalBudgetMs,
        refine_timeout_ms: runtime.refine.timeoutMs,
        refine_budget_ms: runtime.refine.totalBudgetMs,
      }),
    );
    console.log(`[voice-agent-proxy] listening on :${port}`);
  });
};

startServer();

const cleanup = async () => {
  if (communityModule?.close) {
    try {
      await communityModule.close();
    } catch {
      // ignore
    }
  }
  if (accountModule?.close) {
    try {
      await accountModule.close();
    } catch {
      // ignore
    }
  }
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
