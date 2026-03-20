const express = require('express');
const {runTripoPrecheck} = require('../imageTo3d/providers/tripoPrecheck');

const MODULE_NAME = 'modeling';
const BASE_PATH = '/v1/modules/modeling';
const JOBS_BASE_PATH = '/v1/modules/modeling';
const CAPTURE_BASE_PATH = '/v1/modules/modeling/capture-sessions';
const MODELS_BASE_PATH = '/v1/modules/modeling/models';

const requiredEnv = [
  'IMAGE_TO_3D_PROVIDER',
  'TRIPO_BASE_URL',
  'TRIPO_SECRET_KEY',
  'TRIPO_MODEL_VERSION',
  'TRIPO_OUTPUT_FORMAT',
];

const assertTripoStrictMode = () => {
  const provider = String(process.env.IMAGE_TO_3D_PROVIDER || '').trim().toLowerCase();
  if (provider !== 'tripo') {
    throw new Error('IMAGE_TO_3D_PROVIDER must be set to tripo in strict mode.');
  }
};

const capabilities = providerName => ({
  module: MODULE_NAME,
  enabled: true,
  strictMode: true,
  provider: providerName,
  requiredEnv,
  auth: {
    required: false,
    scopes: [],
  },
  endpoints: [
    'POST /v1/modules/modeling/jobs',
    'GET /v1/modules/modeling/jobs/:taskId',
    'GET /v1/modules/modeling/jobs/:taskId/assets/:assetIndex',
    'POST /v1/modules/modeling/capture-sessions',
    'GET /v1/modules/modeling/capture-sessions/:sessionId',
    'POST /v1/modules/modeling/capture-sessions/:sessionId/frames',
    'POST /v1/modules/modeling/capture-sessions/:sessionId/generate',
    'GET /v1/modules/modeling/models/:modelId',
    'GET /v1/modules/modeling/health',
  ],
});

const createModelingModule = async () => {
  assertTripoStrictMode();
  await runTripoPrecheck({
    baseUrl: process.env.TRIPO_BASE_URL,
    apiKey: process.env.TRIPO_SECRET_KEY || process.env.TRIPO_API_KEY,
    timeoutMs: Number(process.env.TRIPO_PRECHECK_TIMEOUT_MS || 8000),
  });

  const {createImageTo3DModule} = require('../imageTo3d/module');
  const imageTo3DModule = createImageTo3DModule({
    config: {
      providerName: 'tripo',
    },
    jobsBasePath: JOBS_BASE_PATH,
    captureBasePath: CAPTURE_BASE_PATH,
    modelsBasePath: MODELS_BASE_PATH,
  });

  const router = express.Router();
  router.use(imageTo3DModule.imageTo3DRouter);
  router.use(imageTo3DModule.captureRouter);
  router.get(`${BASE_PATH}/health`, (_req, res) => {
    res.json({
      module: MODULE_NAME,
      ok: true,
      strictMode: true,
      provider: imageTo3DModule.provider?.name || 'tripo',
      databasePath: imageTo3DModule.config?.databasePath || '',
      pollAfterMs: imageTo3DModule.config?.pollAfterMs || 5000,
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
        provider: imageTo3DModule.provider?.name || 'tripo',
        databasePath: imageTo3DModule.config?.databasePath || '',
      };
    },
    capabilities: () => capabilities(imageTo3DModule.provider?.name || 'tripo'),
    close() {
      if (imageTo3DModule?.close) {
        imageTo3DModule.close();
      }
    },
    handleError(error, req, res, next) {
      imageTo3DModule.handleError(error, req, res, next);
    },
  };
};

module.exports = {
  createModelingModule,
};
