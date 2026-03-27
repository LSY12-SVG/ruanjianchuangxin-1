const toBoolean = value => Boolean(Number(value));

const toProfileShape = row => ({
  id: String(row.id),
  username: row.username,
  displayName: row.display_name,
  avatarUrl: row.avatar_url || '',
  tier: row.tier || 'Vision Creator · Pro',
});

const toSettingsShape = row => ({
  syncOnWifi: toBoolean(row?.sync_on_wifi ?? 1),
  communityNotify: toBoolean(row?.community_notify ?? 1),
  voiceAutoApply: toBoolean(row?.voice_auto_apply ?? 1),
});

const DEBUG_PASSWORD_HASH = '$2a$10$n8cEs4p8qlQ4eeA8vwfN8u95fY7f9.q8n9wYk7YwYyBr7H2x1A9y2';

const createAccountRepository = ({db, getCommunityPostsCount}) => {
  const isMysql = db?.dialect === 'mysql';

  const ensureUserRows = async userId => {
    await db.query(
      isMysql
        ? `
          INSERT INTO profile_settings(user_id)
          VALUES (?)
          ON DUPLICATE KEY UPDATE user_id = user_id
        `
        : `
          INSERT INTO profile_settings(user_id)
          VALUES (?)
          ON CONFLICT(user_id) DO NOTHING
        `,
      [Number(userId)],
    );
    await db.query(
      isMysql
        ? `
          INSERT INTO user_stats(user_id)
          VALUES (?)
          ON DUPLICATE KEY UPDATE user_id = user_id
        `
        : `
          INSERT INTO user_stats(user_id)
          VALUES (?)
          ON CONFLICT(user_id) DO NOTHING
        `,
      [Number(userId)],
    );
  };

  const findUserByUsername = async username => {
    const rows = await db.query(
      `
      SELECT id, username, password_hash, display_name, avatar_url, tier
      FROM users
      WHERE username = ?
      LIMIT 1
    `,
      [username],
    );
    return rows[0] || null;
  };

  const findUserById = async userId => {
    const rows = await db.query(
      `
      SELECT id, username, password_hash, display_name, avatar_url, tier
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
      [Number(userId)],
    );
    return rows[0] || null;
  };

  const normalizeDebugUsername = (userId, usernameHint) => {
    const fallback = `debug_user_${userId}`;
    const normalized = String(usernameHint || fallback)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .slice(0, 64);
    return normalized || fallback;
  };

  const ensureAuthUser = async ({id, username, isBypass}) => {
    const userId = Number(id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return null;
    }

    if (isBypass) {
      const debugUsername = normalizeDebugUsername(userId, username);
      await db.query(
        isMysql
          ? `
            INSERT INTO users(id, username, password_hash, display_name)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE id = id
          `
          : `
            INSERT INTO users(id, username, password_hash, display_name)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING
          `,
        [userId, debugUsername, DEBUG_PASSWORD_HASH, debugUsername],
      );
      await ensureUserRows(userId);
    }

    return findUserById(userId);
  };

  const createUser = async ({username, passwordHash}) => {
    const displayName = username;
    const result = await db.query(
      `
      INSERT INTO users(username, password_hash, display_name)
      VALUES (?, ?, ?)
    `,
      [username, passwordHash, displayName],
    );
    await ensureUserRows(result.insertId);
    return findUserById(result.insertId);
  };

  const getMyProfile = async userId => {
    const user = await findUserById(userId);
    if (!user) {
      return null;
    }
    await ensureUserRows(userId);
    const settingsRows = await db.query(
      `
      SELECT sync_on_wifi, community_notify, voice_auto_apply
      FROM profile_settings
      WHERE user_id = ?
      LIMIT 1
    `,
      [Number(userId)],
    );
    const statsRows = await db.query(
      `
      SELECT model_tasks_count, community_posts_count
      FROM user_stats
      WHERE user_id = ?
      LIMIT 1
    `,
      [Number(userId)],
    );

    let communityPostsCount = Number(statsRows[0]?.community_posts_count || 0);
    if (typeof getCommunityPostsCount === 'function') {
      const counted = await getCommunityPostsCount({
        userId: String(user.id),
        username: user.username,
      });
      if (Number.isFinite(counted) && counted >= 0) {
        communityPostsCount = Math.floor(counted);
        await db.query(
          `
          UPDATE user_stats
          SET community_posts_count = ?, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
        `,
          [communityPostsCount, Number(userId)],
        );
      }
    }

    return {
      profile: toProfileShape(user),
      settings: toSettingsShape(settingsRows[0]),
      stats: {
        modelTasksCount: Number(statsRows[0]?.model_tasks_count || 0),
        communityPostsCount,
      },
    };
  };

  const updateMyProfile = async (userId, patch) => {
    const updates = [];
    const params = [];

    if (typeof patch.displayName === 'string') {
      updates.push('display_name = ?');
      params.push(patch.displayName);
    }
    if (typeof patch.avatarUrl === 'string') {
      updates.push('avatar_url = ?');
      params.push(patch.avatarUrl);
    }
    if (typeof patch.tier === 'string') {
      updates.push('tier = ?');
      params.push(patch.tier);
    }

    if (!updates.length) {
      return findUserById(userId);
    }

    params.push(Number(userId));
    await db.query(
      `
      UPDATE users
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      params,
    );
    return findUserById(userId);
  };

  const updateMySettings = async (userId, patch) => {
    await ensureUserRows(userId);
    const next = {
      sync_on_wifi: typeof patch.syncOnWifi === 'boolean' ? (patch.syncOnWifi ? 1 : 0) : null,
      community_notify:
        typeof patch.communityNotify === 'boolean' ? (patch.communityNotify ? 1 : 0) : null,
      voice_auto_apply:
        typeof patch.voiceAutoApply === 'boolean' ? (patch.voiceAutoApply ? 1 : 0) : null,
    };

    const updates = [];
    const params = [];
    for (const [column, value] of Object.entries(next)) {
      if (value === null) {
        continue;
      }
      updates.push(`${column} = ?`);
      params.push(value);
    }
    if (!updates.length) {
      const rows = await db.query(
        `
        SELECT sync_on_wifi, community_notify, voice_auto_apply
        FROM profile_settings WHERE user_id = ? LIMIT 1
      `,
        [Number(userId)],
      );
      return toSettingsShape(rows[0]);
    }

    params.push(Number(userId));
    await db.query(
      `
      UPDATE profile_settings
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `,
      params,
    );
    const rows = await db.query(
      `
      SELECT sync_on_wifi, community_notify, voice_auto_apply
      FROM profile_settings WHERE user_id = ? LIMIT 1
    `,
      [Number(userId)],
    );
    return toSettingsShape(rows[0]);
  };

  return {
    findUserByUsername,
    createUser,
    findUserById,
    ensureAuthUser,
    getMyProfile,
    updateMyProfile,
    updateMySettings,
  };
};

module.exports = {
  createAccountRepository,
};
