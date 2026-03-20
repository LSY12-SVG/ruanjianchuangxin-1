const express = require('express');
const {initializeCommunityModule} = require('../community');

const MODULE_NAME = 'community';
const BASE_PATH = '/v1/modules/community';
const requiredEnv = ['COMMUNITY_ENABLE', 'DB_CLIENT', 'SQLITE_PATH'];

const createCommunityGatewayModule = async ({authMiddleware, optionalAuthMiddleware}) => {
  const communityModule = await initializeCommunityModule({
    authMiddleware,
    optionalAuthMiddleware,
  });
  if (!communityModule?.enabled || !communityModule?.router) {
    const reason =
      typeof communityModule?.reason === 'string' ? communityModule.reason : 'community_disabled';
    throw new Error(`Community module initialization failed: ${reason}`);
  }

  const router = express.Router();
  router.use('/', communityModule.router);
  router.get('/health', (_req, res) => {
    res.json({
      module: MODULE_NAME,
      ok: true,
      strictMode: true,
      provider: communityModule.config?.dbClient || 'unknown',
    });
  });

  return {
    module: MODULE_NAME,
    basePath: BASE_PATH,
    router,
    repo: communityModule.repo,
    async init() {},
    async healthCheck() {
      return {
        module: MODULE_NAME,
        ok: true,
        strictMode: true,
        provider: communityModule.config?.dbClient || 'unknown',
      };
    },
    capabilities() {
      return {
        module: MODULE_NAME,
        enabled: true,
        strictMode: true,
        provider: communityModule.config?.dbClient || 'unknown',
        requiredEnv,
        auth: {
          required: true,
          scopes: ['community:read', 'community:write', 'community:publish'],
        },
        endpoints: [
          'GET /v1/modules/community/feed',
          'GET /v1/modules/community/me/posts',
          'POST /v1/modules/community/drafts',
          'PUT /v1/modules/community/drafts/:id',
          'POST /v1/modules/community/drafts/:id/publish',
          'POST /v1/modules/community/posts/:id/like',
          'POST /v1/modules/community/posts/:id/save',
          'GET /v1/modules/community/posts/:id/comments',
          'POST /v1/modules/community/posts/:id/comments',
          'GET /v1/modules/community/health',
        ],
      };
    },
    async close() {
      if (typeof communityModule.close === 'function') {
        await communityModule.close();
      }
    },
  };
};

module.exports = {
  createCommunityGatewayModule,
};
