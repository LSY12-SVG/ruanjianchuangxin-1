const path = require('path');
require('dotenv').config({path: path.resolve(__dirname, '../.env')});

const cors = require('cors');
const express = require('express');
const {initializeAccountModule} = require('./account');
const {createColorModule} = require('./modules/colorModule');
const {createModelingModule} = require('./modules/modelingModule');
const {createAgentModule} = require('./modules/agentModule');
const {createCommunityGatewayModule} = require('./modules/communityModule');
const {sendError} = require('./modules/errorResponse');

const port = Number(process.env.PORT || 8787);

const app = express();
app.use(cors());
app.use(express.json({limit: '12mb'}));

let accountModule = null;
let colorModule = null;
let modelingModule = null;
let agentModule = null;
let communityModule = null;

const requiredModuleNames = ['color', 'modeling', 'agent', 'community'];

const mountedModules = () =>
  [colorModule, modelingModule, agentModule, communityModule].filter(Boolean);

const collectHealth = async () => {
  const results = {};
  for (const moduleInstance of mountedModules()) {
    if (!moduleInstance || typeof moduleInstance.healthCheck !== 'function') {
      continue;
    }
    const snapshot = await moduleInstance.healthCheck();
    results[moduleInstance.module] = snapshot;
  }
  const missing = requiredModuleNames.filter(name => !results[name]);
  const ok =
    missing.length === 0 &&
    Object.values(results).every(item => item && typeof item.ok === 'boolean' && item.ok);
  return {
    ok,
    missingModules: missing,
    modules: results,
  };
};

const collectCapabilities = () =>
  mountedModules()
    .filter(item => typeof item.capabilities === 'function')
    .map(item => item.capabilities());

const mountModules = async () => {
  colorModule = createColorModule();
  await colorModule.init();
  app.use('/v1/modules/color', colorModule.router);

  modelingModule = await createModelingModule();
  app.use(modelingModule.router);

  agentModule = createAgentModule({
    getAuthMiddleware: () => accountModule?.authMiddleware || null,
  });
  app.use('/v1/modules/agent', agentModule.router);

  communityModule = await createCommunityGatewayModule({
    authMiddleware: accountModule?.authMiddleware,
    optionalAuthMiddleware: accountModule?.optionalAuthMiddleware,
  });
  app.use('/v1/modules/community', communityModule.router);
};

const startServer = async () => {
  accountModule = await initializeAccountModule({
    getCommunityPostsCount: async ({userId, username}) => {
      if (!communityModule?.repo?.countPublishedByAuthorIdentity) {
        return null;
      }
      return communityModule.repo.countPublishedByAuthorIdentity({userId, username});
    },
  });
  if (!accountModule?.enabled || !accountModule?.authRouter || !accountModule?.profileRouter) {
    const reason =
      typeof accountModule?.reason === 'string' ? accountModule.reason : 'account_module_disabled';
    throw new Error(`Account module initialization failed: ${reason}`);
  }
  app.use('/v1/auth', accountModule.authRouter);
  app.use('/v1/profile', accountModule.profileRouter);

  await mountModules();

  app.get('/v1/modules/health', async (_req, res) => {
    const health = await collectHealth();
    res.status(health.ok ? 200 : 503).json(health);
  });

  app.get('/v1/modules/capabilities', (_req, res) => {
    res.json({
      ok: true,
      modules: collectCapabilities(),
    });
  });

  app.get('/health', async (_req, res) => {
    const health = await collectHealth();
    res.status(health.ok ? 200 : 503).json({
      ok: health.ok,
      service: 'visiongenie-modules-gateway',
      modules: health.modules,
      missingModules: health.missingModules,
    });
  });

  app.use((error, req, res, next) => {
    if (modelingModule?.handleError) {
      modelingModule.handleError(error, req, res, next);
      return;
    }
    if (res.headersSent) {
      next(error);
      return;
    }
    sendError(res, 500, 'INTERNAL_ERROR', error?.message || 'Unexpected server error.');
  });

  app.listen(port, async () => {
    const health = await collectHealth();
    console.log(
      '[modules-gateway] listening',
      JSON.stringify({
        port,
        service: 'visiongenie-modules-gateway',
        ok: health.ok,
        missingModules: health.missingModules,
      }),
    );
  });
};

const cleanup = async () => {
  for (const moduleInstance of mountedModules()) {
    try {
      if (typeof moduleInstance.close === 'function') {
        await moduleInstance.close();
      }
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

startServer().catch(error => {
  console.error('[modules-gateway] startup failed:', error);
  process.exit(1);
});

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
