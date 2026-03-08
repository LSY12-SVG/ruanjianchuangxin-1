const express = require('express');

const isString = value => typeof value === 'string';

const trimMax = (value, max) => String(value || '').trim().slice(0, max);

const asSettingsPatch = body => ({
  syncOnWifi: typeof body?.syncOnWifi === 'boolean' ? body.syncOnWifi : undefined,
  communityNotify:
    typeof body?.communityNotify === 'boolean' ? body.communityNotify : undefined,
  voiceAutoApply:
    typeof body?.voiceAutoApply === 'boolean' ? body.voiceAutoApply : undefined,
});

const createAccountRouter = ({authService}) => {
  const router = express.Router();

  router.post('/register', async (req, res) => {
    const result = await authService.register(req.body);
    if (result.error) {
      const status =
        result.error === 'username_taken'
          ? 409
          : result.error === 'validation_failed'
            ? 400
            : 500;
      res.status(status).json({error: result.error});
      return;
    }
    res.status(201).json(result);
  });

  router.post('/login', async (req, res) => {
    const result = await authService.login(req.body);
    if (result.error) {
      const status =
        result.error === 'invalid_credentials'
          ? 401
          : result.error === 'validation_failed'
            ? 400
            : 500;
      res.status(status).json({error: result.error});
      return;
    }
    res.json(result);
  });

  return router;
};

const createProfileRouter = ({repo, authMiddleware}) => {
  const router = express.Router();
  router.use(authMiddleware);

  router.get('/me', async (req, res) => {
    const item = await repo.getMyProfile(req.user.id);
    if (!item) {
      res.status(404).json({error: 'profile_not_found'});
      return;
    }
    res.json(item);
  });

  router.patch('/me', async (req, res) => {
    const patch = {};
    if (isString(req.body?.displayName)) {
      patch.displayName = trimMax(req.body.displayName, 120);
    }
    if (isString(req.body?.avatarUrl)) {
      patch.avatarUrl = trimMax(req.body.avatarUrl, 1200);
    }
    if (isString(req.body?.tier)) {
      patch.tier = trimMax(req.body.tier, 120);
    }

    if (!Object.keys(patch).length) {
      res.status(400).json({error: 'validation_failed'});
      return;
    }

    const updated = await repo.updateMyProfile(req.user.id, patch);
    if (!updated) {
      res.status(404).json({error: 'profile_not_found'});
      return;
    }
    res.json({
      profile: {
        id: String(updated.id),
        username: updated.username,
        displayName: updated.display_name,
        avatarUrl: updated.avatar_url || '',
        tier: updated.tier || 'Vision Creator · Pro',
      },
    });
  });

  router.patch('/me/settings', async (req, res) => {
    const patch = asSettingsPatch(req.body);
    if (
      patch.syncOnWifi === undefined &&
      patch.communityNotify === undefined &&
      patch.voiceAutoApply === undefined
    ) {
      res.status(400).json({error: 'validation_failed'});
      return;
    }
    const settings = await repo.updateMySettings(req.user.id, patch);
    res.json({settings});
  });

  return router;
};

module.exports = {
  createAccountRouter,
  createProfileRouter,
};
