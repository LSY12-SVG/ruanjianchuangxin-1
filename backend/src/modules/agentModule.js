const express = require('express');
const path = require('path');
const {
  validateAgentPlanRequest,
  normalizeAgentPlanResponse,
  validateExecuteRequest,
  validateMemoryUpsertRequest,
  validateMemoryQueryRequest,
} = require('../agentContracts');
const {planAgentActions} = require('../agentPlanner');
const {createAgentExecutionService} = require('../agentExecution');
const {createAgentMemoryStore} = require('../agentMemoryStore');
const {getAuthBypassUser, isAuthBypassEnabled} = require('../authBypass');
const {sendError} = require('./errorResponse');

const MODULE_NAME = 'agent';
const BASE_PATH = '/v1/modules/agent';

const requiredEnv = ['AGENT_MEMORY_PATH'];

const parseScopesHeader = value => {
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
};

const resolveAgentGrantedScopes = req => {
  const fromUser = Array.isArray(req.user?.scopes)
    ? req.user.scopes.filter(item => typeof item === 'string' && item.trim())
    : [];
  const fromHeader = parseScopesHeader(req.header('x-agent-scopes'));
  const merged = new Set([...fromUser, ...fromHeader]);
  return Array.from(merged);
};

const createAgentModule = ({
  getAuthMiddleware,
  getCommunityRepo,
  getSettingsRepo,
  getModelingService,
  getModelingConfig,
} = {}) => {
  const router = express.Router();
  const agentExecutionService = createAgentExecutionService({
    resolveServices: () => ({
      communityRepo: (typeof getCommunityRepo === 'function' ? getCommunityRepo() : null) || null,
      settingsRepo: (typeof getSettingsRepo === 'function' ? getSettingsRepo() : null) || null,
      modelingService:
        (typeof getModelingService === 'function' ? getModelingService() : null) || null,
      modelingConfig:
        (typeof getModelingConfig === 'function' ? getModelingConfig() : null) || null,
    }),
  });
  const agentMemoryStore = createAgentMemoryStore({
    filePath: process.env.AGENT_MEMORY_PATH || path.resolve(__dirname, '../../data/agent-memory.json'),
  });
  const metrics = {
    planTotal: 0,
    planFallbackLocal: 0,
    executeTotal: 0,
    workflowCompleted: 0,
    actionApplied: 0,
    actionFailed: 0,
    actionPending: 0,
    actionClientRequired: 0,
    rollbackAvailable: 0,
    scopeCheckTotal: 0,
    scopeCheckPassed: 0,
    blockedByPolicyCount: 0,
  };

  const ensureBypassUser = async bypassUser => {
    const settingsRepo = (typeof getSettingsRepo === 'function' ? getSettingsRepo() : null) || null;
    if (!settingsRepo || typeof settingsRepo.ensureAuthUser !== 'function') {
      return;
    }
    await settingsRepo.ensureAuthUser({
      id: bypassUser.id,
      username: bypassUser.username,
      isBypass: true,
    });
  };

  const requireAgentAuth = async (req, res, next) => {
    const authMiddleware = typeof getAuthMiddleware === 'function' ? getAuthMiddleware() : null;
    if (authMiddleware) {
      return authMiddleware(req, res, next);
    }
    if (!isAuthBypassEnabled()) {
      sendError(res, 503, 'AUTH_MODULE_UNAVAILABLE', 'auth_module_unavailable');
      return undefined;
    }
    const bypassUser = getAuthBypassUser();
    try {
      await ensureBypassUser(bypassUser);
    } catch (error) {
      sendError(
        res,
        500,
        'AUTH_BYPASS_USER_INIT_FAILED',
        error?.message || 'auth_bypass_user_init_failed',
      );
      return undefined;
    }
    req.user = {
      ...bypassUser,
      id: String(bypassUser.id),
      scopes: ['*'],
    };
    next();
    return undefined;
  };

  router.post('/plan', async (req, res) => {
    const validation = validateAgentPlanRequest(req.body);
    if (!validation.ok) {
      sendError(res, 400, 'BAD_REQUEST', validation.message);
      return;
    }

    const rawPlan = planAgentActions(req.body);
    const normalized = normalizeAgentPlanResponse(rawPlan);
    if (!normalized) {
      sendError(res, 500, 'PLAN_NORMALIZATION_FAILED', 'agent plan normalization failed');
      return;
    }
    metrics.planTotal += 1;
    if (normalized.plannerSource === 'local') {
      metrics.planFallbackLocal += 1;
    }
    const inputSource = req.body?.inputSource === 'voice' ? 'voice' : 'text';
    const stageSet = new Set(
      (Array.isArray(normalized.actions) ? normalized.actions : [])
        .map(item => String(item.stage || '').trim())
        .filter(Boolean),
    );
    console.log(
      '[agent-plan]',
      JSON.stringify({
        planId: normalized.planId,
        inputSource,
        plannerSource: normalized.plannerSource,
        actionCount: normalized.actions.length,
        stages: Array.from(stageSet),
      }),
    );
    res.json(normalized);
  });

  router.post('/execute', requireAgentAuth, async (req, res) => {
    const validation = validateExecuteRequest(req.body);
    if (!validation.ok) {
      sendError(res, 400, 'BAD_REQUEST', validation.message);
      return;
    }

    const payload = validation.payload;
    const userId = String(req.user?.id || payload.userId || '').trim();
    if (!userId) {
      sendError(res, 401, 'UNAUTHORIZED', 'unauthorized');
      return;
    }
    const grantedScopes = resolveAgentGrantedScopes(req);
    const debugOverride = Boolean(req.user?.isBypass) || isAuthBypassEnabled();
    const result = await agentExecutionService.execute({
      ...payload,
      userId,
      namespace: payload.namespace || 'app.agent',
      grantedScopes,
      debugOverride,
    });
    metrics.executeTotal += 1;
    if (result.status === 'applied') {
      metrics.workflowCompleted += 1;
    }
    metrics.actionApplied += result.appliedActions.length;
    metrics.actionFailed += result.failedActions.length;
    metrics.actionPending += result.pendingActions.length;
    metrics.actionClientRequired += Array.isArray(result.clientRequiredActions)
      ? result.clientRequiredActions.length
      : 0;
    if (result.rollbackAvailable) {
      metrics.rollbackAvailable += 1;
    }
    const scopedResults = result.actionResults.filter(
      item => Array.isArray(item.action?.requiredScopes) && item.action.requiredScopes.length > 0,
    );
    const scopePassed = scopedResults.filter(item => item.errorCode !== 'forbidden_scope').length;
    metrics.scopeCheckTotal += scopedResults.length;
    metrics.scopeCheckPassed += scopePassed;
    const blockedByPolicyCount = result.actionResults.filter(
      item => item.errorCode === 'forbidden_scope' || item.errorCode === 'confirmation_required',
    ).length;
    metrics.blockedByPolicyCount += blockedByPolicyCount;
    const firstFailure = result.actionResults.find(item => item.status === 'failed');
    console.log(
      '[agent-execute]',
      JSON.stringify({
        planId: result.planId,
        executionId: result.executionId,
        status: result.status,
        actionCount: result.actionResults.length,
        appliedCount: result.appliedActions.length,
        pendingCount: result.pendingActions.length,
        failedCount: result.failedActions.length,
        nextRequiredContext: result.workflowState?.nextRequiredContext || '',
        firstFailure: firstFailure
          ? {
              domain: firstFailure.action?.domain || '',
              operation: firstFailure.action?.operation || '',
              errorCode: firstFailure.errorCode || '',
              message: firstFailure.message || '',
            }
          : null,
      }),
    );
    res.json(result);
  });

  router.post('/memory/upsert', requireAgentAuth, async (req, res) => {
    const validation = validateMemoryUpsertRequest(req.body);
    if (!validation.ok) {
      sendError(res, 400, 'BAD_REQUEST', validation.message);
      return;
    }

    const userId = String(req.user?.id || req.body.userId || '').trim();
    if (!userId) {
      sendError(res, 401, 'UNAUTHORIZED', 'unauthorized');
      return;
    }
    const stored = agentMemoryStore.upsert({
      userId,
      namespace: String(req.body.namespace || '').trim(),
      key: String(req.body.key || '').trim(),
      value: req.body.value,
      ttlSeconds: req.body.ttlSeconds,
    });
    res.json({
      ok: true,
      key: req.body.key,
      version: stored.version,
      updatedAt: stored.updatedAt,
    });
  });

  router.post('/memory/query', requireAgentAuth, async (req, res) => {
    const validation = validateMemoryQueryRequest(req.body);
    if (!validation.ok) {
      sendError(res, 400, 'BAD_REQUEST', validation.message);
      return;
    }
    const userId = String(req.user?.id || req.body.userId || '').trim();
    if (!userId) {
      sendError(res, 401, 'UNAUTHORIZED', 'unauthorized');
      return;
    }
    const result = agentMemoryStore.query({
      userId,
      namespace: String(req.body.namespace || '').trim(),
      key: String(req.body.key || '').trim(),
    });

    res.json({
      ok: true,
      key: result.key,
      value: result.value,
      version: result.version,
      updatedAt: result.updatedAt,
    });
  });

  router.get('/health', (_req, res) => {
    res.json({
      module: MODULE_NAME,
      ok: true,
      strictMode: true,
      metrics: {
        ...metrics,
      },
    });
  });

  return {
    module: MODULE_NAME,
    basePath: BASE_PATH,
    router,
    async init() {},
    async healthCheck() {
      return {
        module: MODULE_NAME,
        ok: true,
        strictMode: true,
        metrics: {
          ...metrics,
        },
      };
    },
    capabilities() {
      return {
        module: MODULE_NAME,
        enabled: true,
        strictMode: true,
        provider: 'local',
        requiredEnv,
        auth: {
          required: true,
          scopes: [
            'app:read',
            'app:navigate',
            'grading:write',
            'convert:write',
            'community:*',
            'settings:write',
          ],
        },
        endpoints: [
          'POST /v1/modules/agent/plan',
          'POST /v1/modules/agent/execute',
          'POST /v1/modules/agent/memory/upsert',
          'POST /v1/modules/agent/memory/query',
          'GET /v1/modules/agent/health',
        ],
      };
    },
    close() {},
  };
};

module.exports = {
  createAgentModule,
};
