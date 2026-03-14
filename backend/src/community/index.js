const {readCommunityConfig} = require('./config');
const {createCommunityDb} = require('./db');
const {runCommunityMigrations} = require('./migrations');
const {createCommunityRepository} = require('./repository');
const {createCommunityRouter} = require('./routes');

const initializeCommunityModule = async ({authMiddleware, optionalAuthMiddleware} = {}) => {
  const config = readCommunityConfig();
  if (!config.enabled) {
    return {
      enabled: false,
      router: null,
      close: async () => undefined,
    };
  }
  if (!config.databaseUrl) {
    return {
      enabled: false,
      router: null,
      close: async () => undefined,
      reason: 'missing_database_url',
    };
  }
  if (typeof authMiddleware !== 'function' || typeof optionalAuthMiddleware !== 'function') {
    return {
      enabled: false,
      router: null,
      close: async () => undefined,
      reason: 'missing_auth_middleware',
    };
  }

  const db = createCommunityDb(config);
  await runCommunityMigrations(db);
  const repo = createCommunityRepository(db);
  const router = createCommunityRouter({
    repo,
    authMiddleware,
    optionalAuthMiddleware,
    pageSizeDefault: config.pageSizeDefault,
    pageSizeMax: config.pageSizeMax,
  });

  return {
    enabled: true,
    router,
    repo,
    close: async () => {
      await db.close();
    },
  };
};

module.exports = {
  initializeCommunityModule,
};
