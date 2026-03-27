const path = require('path');

const backendRoot = path.resolve(__dirname, '../backend');
require(path.join(backendRoot, 'node_modules/dotenv')).config({
  path: path.join(backendRoot, '.env'),
});
const express = require(path.join(backendRoot, 'node_modules/express'));
const cors = require(path.join(backendRoot, 'node_modules/cors'));
const {initializeAccountModule} = require(path.join(backendRoot, 'src/account'));
const {initializeCommunityModule} = require(path.join(backendRoot, 'src/community'));

const DEMO_POSTS = [
  {
    userId: 'atelier_mira',
    title: '胶片人像修图思路分享',
    content:
      '最近在做人像风格化时，我会先把肤色压回自然区间，再叠一点暖灰和轻颗粒，这样更容易做出柔和、耐看的电影感。',
    tags: ['portrait', '人像', '电影感'],
  },
  {
    userId: 'studio_orbit',
    title: '旧城街景的复古配色记录',
    content:
      '这组练习里我把高光留白压低，阴影往青灰走，再用偏橙的中间调连接主体和背景，整体会更像旧相纸的味道。',
    tags: ['vintage', '复古', '街景'],
  },
  {
    userId: 'cinema_lab',
    title: '从单张图到完整叙事画面的构图笔记',
    content:
      '先确定主视线，再用前景遮挡和边缘光把空间拉开。哪怕只有一张图，也能做出像镜头切片一样的叙事感。',
    tags: ['cinema', '电影感', '构图'],
  },
];

const createBootstrapSignedUserMiddleware = account => async (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader) {
    next();
    return;
  }

  account.optionalAuthMiddleware(req, res, async () => {
    try {
      if (req.user?.id && req.user?.username && typeof account.repo?.findUserById === 'function') {
        const existing = await account.repo.findUserById(req.user.id);
        if (!existing && typeof account.repo?.ensureAuthUser === 'function') {
          await account.repo.ensureAuthUser({...req.user, isBypass: true});
        }
      }
      next();
    } catch (error) {
      console.error('[auth-only] bootstrap signed user failed', error);
      res.status(500).json({error: 'profile_bootstrap_failed'});
    }
  });
};

const ensureDemoCommunityContent = async community => {
  if (!community?.repo?.getFeed || !community?.repo?.createDraft || !community?.repo?.publishDraft) {
    return;
  }

  const existing = await community.repo.getFeed('guest', {
    filter: 'all',
    page: 1,
    size: 6,
    offset: 0,
  });
  if ((existing?.total || 0) > 0 || (existing?.items || []).length > 0) {
    return;
  }

  for (const item of DEMO_POSTS) {
    const draft = await community.repo.createDraft(item.userId, {
      title: item.title,
      content: item.content,
      tags: item.tags,
      beforeUrl: '',
      afterUrl: '',
      gradingParams: {},
    });
    if (draft?.id) {
      await community.repo.publishDraft(item.userId, draft.id);
    }
  }
};

const start = async () => {
  const app = express();
  app.use(cors());
  app.use(express.json({limit: '12mb'}));

  let community = null;
  const account = await initializeAccountModule({
    getCommunityPostsCount: async identity => {
      if (!community?.repo?.countPublishedByAuthorIdentity) {
        return 0;
      }
      try {
        return await community.repo.countPublishedByAuthorIdentity(identity);
      } catch (error) {
        console.warn('[auth-only] count community posts failed', error);
        return 0;
      }
    },
  });
  community = await initializeCommunityModule({
    authMiddleware: account.authMiddleware,
    optionalAuthMiddleware: account.optionalAuthMiddleware,
  });

  app.use('/v1/profile', createBootstrapSignedUserMiddleware(account));
  app.use('/v1/modules/community', createBootstrapSignedUserMiddleware(account));

  app.use('/v1/auth', account.authRouter);
  app.use('/v1/profile', account.profileRouter);
  if (community?.enabled && community?.router) {
    await ensureDemoCommunityContent(community);
    app.use('/v1/modules/community', community.router);
  }

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'auth-only',
      community: Boolean(community?.enabled && community?.router),
    });
  });

  const port = 8787;
  app.listen(port, () => {
    console.log(
      `[auth-only] listening ${port} community=${community?.enabled ? 'on' : community?.reason || 'off'}`,
    );
  });
};

start().catch(error => {
  console.error('[auth-only] startup failed', error);
  process.exit(1);
});
