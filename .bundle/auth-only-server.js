const path = require('path');

const backendRoot = path.resolve(__dirname, '../backend');
require(path.join(backendRoot, 'node_modules/dotenv')).config({
  path: path.join(backendRoot, '.env'),
});
const express = require(path.join(backendRoot, 'node_modules/express'));
const cors = require(path.join(backendRoot, 'node_modules/cors'));
const {initializeAccountModule} = require(path.join(backendRoot, 'src/account'));

const start = async () => {
  const app = express();
  app.use(cors());
  app.use(express.json({limit: '12mb'}));

  const account = await initializeAccountModule({
    getCommunityPostsCount: async () => 0,
  });

  app.use('/v1/auth', account.authRouter);
  app.use('/v1/profile', account.profileRouter);
  app.get('/health', (_req, res) => {
    res.json({ok: true, service: 'auth-only'});
  });

  const port = 8787;
  app.listen(port, () => {
    console.log(`[auth-only] listening ${port}`);
  });
};

start().catch(error => {
  console.error('[auth-only] startup failed', error);
  process.exit(1);
});
