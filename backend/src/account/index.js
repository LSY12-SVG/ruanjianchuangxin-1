const {readAccountConfig} = require('./config');
const {createAccountDb} = require('./db');
const {runAccountMigrations} = require('./migrations');
const {createAccountRepository} = require('./repository');
const {createTokenTools} = require('./token');
const {createAuthService} = require('./auth');
const {createAuthMiddleware} = require('./middleware');
const {createAccountRouter, createProfileRouter} = require('./routes');

const initializeAccountModule = async ({getCommunityPostsCount}) => {
  const config = readAccountConfig();
  if (!process.env.JWT_SECRET) {
    console.warn('[account] using default JWT_SECRET for local development');
  }

  const db = createAccountDb(config.sqlitePath);
  await runAccountMigrations(db);

  const repo = createAccountRepository({
    db,
    getCommunityPostsCount,
  });

  const tokenTools = createTokenTools(config);
  const authService = createAuthService({repo, tokenTools});
  const authMiddleware = createAuthMiddleware(tokenTools);

  return {
    enabled: true,
    authRouter: createAccountRouter({authService}),
    profileRouter: createProfileRouter({repo, authMiddleware}),
    close: async () => {
      await db.close();
    },
  };
};

module.exports = {
  initializeAccountModule,
};
