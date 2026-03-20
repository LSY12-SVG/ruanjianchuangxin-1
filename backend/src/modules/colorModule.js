const express = require('express');
const {
  refreshModelHealth,
  getRuntimeSnapshot,
} = require('../colorIntelligence');
const {handleInterpret} = require('../colorIntelligence/services/interpretService');
const {handleAutoGrade} = require('../colorIntelligence/services/autoGradeService');
const {handleSegmentation} = require('../colorIntelligence/services/segmentationService');
const {sendError} = require('./errorResponse');

const MODULE_NAME = 'color';
const BASE_PATH = '/v1/modules/color';

const requiredEnv = [
  'MODEL_PROVIDER',
  'MODEL_BASE_URL',
  'MODEL_API_KEY',
  'MODEL_PRIMARY_NAME',
  'MODEL_REFINE_NAME',
];

const capabilities = () => ({
  module: MODULE_NAME,
  enabled: true,
  strictMode: true,
  provider: String(process.env.MODEL_PROVIDER || 'openai_compat'),
  requiredEnv,
  auth: {
    required: false,
    scopes: [],
  },
  endpoints: [
    'POST /v1/modules/color/initial-suggest',
    'POST /v1/modules/color/voice-refine',
    'POST /v1/modules/color/pro/auto-grade',
    'POST /v1/modules/color/pro/segment',
    'GET /v1/modules/color/health',
  ],
});

const healthCheck = () => {
  const snapshot = getRuntimeSnapshot();
  return {
    module: MODULE_NAME,
    ok: Boolean(snapshot.refineModelReady),
    strictMode: true,
    provider: String(process.env.MODEL_PROVIDER || 'openai_compat'),
    refineModelReady: Boolean(snapshot.refineModelReady),
    missingModelIds: Array.isArray(snapshot.missingModelIds) ? snapshot.missingModelIds : [],
    modelCheckError: snapshot.modelCheckError || '',
    lastCheckedAt: snapshot.lastCheckedAt || null,
  };
};

const createColorModule = () => {
  const router = express.Router();

  router.post('/initial-suggest', async (req, res) => {
    const result = await handleInterpret(
      {
        ...req.body,
        mode: 'initial_visual_suggest',
      },
      {strictMode: true, responseShape: 'module', forceMode: 'initial_visual_suggest'},
    );
    if (result.status !== 200) {
      const errorPayload = result.payload?.error || {};
      sendError(
        res,
        result.status,
        errorPayload.code || 'REAL_MODEL_REQUIRED',
        errorPayload.message || 'Strict mode requires real model output.',
        errorPayload.details,
      );
      return;
    }
    res.status(200).json(result.payload);
  });

  router.post('/voice-refine', async (req, res) => {
    const result = await handleInterpret(
      {
        ...req.body,
        mode: 'voice_refine',
      },
      {strictMode: true, responseShape: 'module', forceMode: 'voice_refine'},
    );
    if (result.status !== 200) {
      const errorPayload = result.payload?.error || {};
      sendError(
        res,
        result.status,
        errorPayload.code || 'REAL_MODEL_REQUIRED',
        errorPayload.message || 'Strict mode requires real model output.',
        errorPayload.details,
      );
      return;
    }
    res.status(200).json(result.payload);
  });

  router.post('/pro/auto-grade', async (req, res) => {
    const result = await handleAutoGrade(req.body, getRuntimeSnapshot(), {
      strictMode: true,
      responseShape: 'module',
    });
    if (result.status !== 200) {
      const errorPayload = result.payload?.error || {};
      sendError(
        res,
        result.status,
        errorPayload.code || 'REAL_MODEL_REQUIRED',
        errorPayload.message || 'Strict mode requires real model output.',
        errorPayload.details,
      );
      return;
    }
    res.status(200).json(result.payload);
  });

  router.post('/pro/segment', (req, res) => {
    const result = handleSegmentation(req.body);
    if (result.status !== 200) {
      sendError(res, result.status, 'SEGMENTATION_FAILED', result.payload?.error || 'segmentation_failed');
      return;
    }
    res.status(200).json(result.payload);
  });

  router.get('/health', (_req, res) => {
    const status = healthCheck();
    res.status(status.ok ? 200 : 503).json(status);
  });

  return {
    module: MODULE_NAME,
    basePath: BASE_PATH,
    router,
    async healthCheck() {
      return healthCheck();
    },
    capabilities,
    async init() {
      await refreshModelHealth();
      const snapshot = getRuntimeSnapshot();
      if (!snapshot.refineModelReady) {
        const reason = snapshot.modelCheckError || 'model_check_failed';
        throw new Error(
          `Color module strict startup check failed: ${reason}${
            Array.isArray(snapshot.missingModelIds) && snapshot.missingModelIds.length
              ? ` (missing: ${snapshot.missingModelIds.join(',')})`
              : ''
          }`,
        );
      }
    },
    close() {},
  };
};

module.exports = {
  createColorModule,
};
