const parseJsonSafe = (value, fallback) => {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === 'object') {
    return value;
  }
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
};

const toPostView = row => ({
  id: String(row.id),
  author: {
    id: row.author_id,
    name: row.display_name,
    avatarUrl: row.avatar_url || '',
  },
  status: row.status,
  title: row.title,
  content: row.content,
  beforeUrl: row.before_url || '',
  afterUrl: row.after_url || '',
  tags: parseJsonSafe(row.tags_json, []),
  gradingParams: parseJsonSafe(row.grading_params_json, {}),
  likesCount: Number(row.likes_count || 0),
  savesCount: Number(row.saves_count || 0),
  commentsCount: Number(row.comments_count || 0),
  isLiked: Boolean(row.is_liked),
  isSaved: Boolean(row.is_saved),
  publishedAt: row.published_at || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toCommentView = row => ({
  id: String(row.id),
  postId: String(row.post_id),
  parentId: row.parent_id ? String(row.parent_id) : null,
  author: {
    id: row.author_id,
    name: row.display_name,
    avatarUrl: row.avatar_url || '',
  },
  content: row.content,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const feedFilterWhereClause = filter => {
  if (filter === 'portrait') {
    return `AND (p.tags_json LIKE '%portrait%' OR p.tags_json LIKE '%人像%')`;
  }
  if (filter === 'cinema') {
    return `AND (p.tags_json LIKE '%cinema%' OR p.tags_json LIKE '%电影感%')`;
  }
  if (filter === 'vintage') {
    return `AND (p.tags_json LIKE '%vintage%' OR p.tags_json LIKE '%复古%')`;
  }
  return '';
};

const normalizeUserId = value => {
  const normalized = String(value || '').trim();
  if (!normalized || normalized === 'guest') {
    return '';
  }
  return normalized.slice(0, 64);
};

const createCommunityRepository = db => {
  const ensureUser = async userId => {
    const normalizedUserId = normalizeUserId(userId);
    if (!normalizedUserId) {
      return;
    }
    const fallbackName = `user_${normalizedUserId.slice(0, 12)}`;
    await db.query(
      `
      INSERT INTO community_users(id, display_name)
      VALUES (?, ?)
      ON CONFLICT(id) DO NOTHING
    `,
      [normalizedUserId, fallbackName],
    );
  };

  const fetchPostById = async id => {
    const rows = await db.query(
      `
      SELECT p.*, u.display_name, u.avatar_url, 0 AS is_liked, 0 AS is_saved
      FROM community_posts p
      JOIN community_users u ON u.id = p.author_id
      WHERE p.id = ?
      LIMIT 1
    `,
      [Number(id)],
    );
    return rows[0] || null;
  };

  const createDraft = async (userId, payload) => {
    const normalizedUserId = normalizeUserId(userId);
    await ensureUser(normalizedUserId);
    const result = await db.query(
      `
      INSERT INTO community_posts(
        author_id, status, title, content, before_url, after_url, tags_json, grading_params_json
      )
      VALUES (?, 'draft', ?, ?, ?, ?, ?, ?)
    `,
      [
        normalizedUserId,
        payload.title,
        payload.content,
        payload.beforeUrl,
        payload.afterUrl,
        JSON.stringify(payload.tags || []),
        JSON.stringify(payload.gradingParams || {}),
      ],
    );
    const row = await fetchPostById(result.insertId);
    return row ? toPostView(row) : null;
  };

  const updateDraft = async (userId, draftId, payload) => {
    const normalizedUserId = normalizeUserId(userId);
    await db.query(
      `
      UPDATE community_posts
      SET
        title = ?,
        content = ?,
        before_url = ?,
        after_url = ?,
        tags_json = ?,
        grading_params_json = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND author_id = ? AND status = 'draft'
    `,
      [
        payload.title,
        payload.content,
        payload.beforeUrl,
        payload.afterUrl,
        JSON.stringify(payload.tags || []),
        JSON.stringify(payload.gradingParams || {}),
        Number(draftId),
        normalizedUserId,
      ],
    );
    const row = await fetchPostById(draftId);
    if (!row || row.author_id !== normalizedUserId || row.status !== 'draft') {
      return null;
    }
    return toPostView(row);
  };

  const publishDraft = async (userId, draftId) => {
    const normalizedUserId = normalizeUserId(userId);
    const result = await db.query(
      `
      UPDATE community_posts
      SET status = 'published', published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND author_id = ? AND status = 'draft'
    `,
      [Number(draftId), normalizedUserId],
    );
    if (!result.affectedRows) {
      return null;
    }
    const row = await fetchPostById(draftId);
    return row ? toPostView(row) : null;
  };

  const getFeed = async (userId, {filter, size, offset, page}) => {
    const normalizedUserId = normalizeUserId(userId);
    if (normalizedUserId) {
      await ensureUser(normalizedUserId);
    }
    const readUserId = normalizedUserId || '__guest__';
    const filterClause = feedFilterWhereClause(filter);

    const totalRows = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM community_posts p
      WHERE p.status = 'published'
      ${filterClause}
    `,
    );
    const total = Number(totalRows[0]?.total || 0);

    const rows = await db.query(
      `
      SELECT
        p.*,
        u.display_name,
        u.avatar_url,
        EXISTS(
          SELECT 1 FROM community_post_likes l
          WHERE l.post_id = p.id AND l.user_id = ?
        ) AS is_liked,
        EXISTS(
          SELECT 1 FROM community_post_saves s
          WHERE s.post_id = p.id AND s.user_id = ?
        ) AS is_saved
      FROM community_posts p
      JOIN community_users u ON u.id = p.author_id
      WHERE p.status = 'published'
      ${filterClause}
      ORDER BY p.published_at DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `,
      [readUserId, readUserId, size, offset],
    );

    return {
      items: rows.map(toPostView),
      page,
      size,
      total,
      hasMore: offset + size < total,
    };
  };

  const getMyPosts = async (userId, {status, size, offset, page}) => {
    const normalizedUserId = normalizeUserId(userId);
    await ensureUser(normalizedUserId);
    const totalRows = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM community_posts
      WHERE author_id = ? AND status = ?
    `,
      [normalizedUserId, status],
    );
    const total = Number(totalRows[0]?.total || 0);

    const rows = await db.query(
      `
      SELECT
        p.*,
        u.display_name,
        u.avatar_url,
        0 AS is_liked,
        0 AS is_saved
      FROM community_posts p
      JOIN community_users u ON u.id = p.author_id
      WHERE p.author_id = ? AND p.status = ?
      ORDER BY p.updated_at DESC
      LIMIT ? OFFSET ?
    `,
      [normalizedUserId, status, size, offset],
    );

    return {
      items: rows.map(toPostView),
      page,
      size,
      total,
      hasMore: offset + size < total,
    };
  };

  const getRecentPostsByRelation = async (
    userId,
    {size, offset, page},
    relationTable,
    relationAlias,
    relationColumn,
  ) => {
    const normalizedUserId = normalizeUserId(userId);
    await ensureUser(normalizedUserId);
    const totalRows = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM ${relationTable} r
      JOIN community_posts p ON p.id = r.post_id
      WHERE r.user_id = ? AND p.status = 'published'
    `,
      [normalizedUserId],
    );
    const total = Number(totalRows[0]?.total || 0);

    const rows = await db.query(
      `
      SELECT
        p.*,
        u.display_name,
        u.avatar_url,
        EXISTS(
          SELECT 1 FROM community_post_likes l
          WHERE l.post_id = p.id AND l.user_id = ?
        ) AS is_liked,
        EXISTS(
          SELECT 1 FROM community_post_saves s
          WHERE s.post_id = p.id AND s.user_id = ?
        ) AS is_saved,
        r.created_at AS ${relationAlias}
      FROM ${relationTable} r
      JOIN community_posts p ON p.id = r.post_id
      JOIN community_users u ON u.id = p.author_id
      WHERE r.user_id = ? AND p.status = 'published'
      ORDER BY r.created_at DESC, p.published_at DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `,
      [normalizedUserId, normalizedUserId, normalizedUserId, size, offset],
    );

    return {
      items: rows.map(row =>
        toPostView({
          ...row,
          is_liked:
            relationColumn === 'liked'
              ? 1
              : row.is_liked,
          is_saved:
            relationColumn === 'saved'
              ? 1
              : row.is_saved,
        }),
      ),
      page,
      size,
      total,
      hasMore: offset + size < total,
    };
  };

  const getLikedPosts = async (userId, pagination) =>
    getRecentPostsByRelation(
      userId,
      pagination,
      'community_post_likes',
      'liked_at',
      'liked',
    );

  const getSavedPosts = async (userId, pagination) =>
    getRecentPostsByRelation(
      userId,
      pagination,
      'community_post_saves',
      'saved_at',
      'saved',
    );

  const countPublishedByAuthorIdentity = async ({userId, username}) => {
    const candidates = [normalizeUserId(userId), normalizeUserId(username)].filter(Boolean);
    const uniqueCandidates = Array.from(new Set(candidates));
    if (!uniqueCandidates.length) {
      return 0;
    }
    const placeholders = uniqueCandidates.map(() => '?').join(', ');
    const totalRows = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM community_posts
      WHERE status = 'published' AND author_id IN (${placeholders})
    `,
      uniqueCandidates,
    );
    return Number(totalRows[0]?.total || 0);
  };

  const toggleLike = async (userId, postId, liked) => {
    const normalizedUserId = normalizeUserId(userId);
    await ensureUser(normalizedUserId);
    return db.withTransaction(async client => {
      const postRows = await client.query(
        'SELECT id, status FROM community_posts WHERE id = ? LIMIT 1',
        [Number(postId)],
      );
      if (!postRows.length) {
        return {error: 'not_found'};
      }
      if (postRows[0].status !== 'published') {
        return {error: 'not_published'};
      }

      if (liked) {
        await client.query(
          `
          INSERT INTO community_post_likes(post_id, user_id)
          VALUES (?, ?)
          ON CONFLICT(post_id, user_id) DO NOTHING
        `,
          [Number(postId), normalizedUserId],
        );
      } else {
        await client.query(
          'DELETE FROM community_post_likes WHERE post_id = ? AND user_id = ?',
          [Number(postId), normalizedUserId],
        );
      }

      await client.query(
        `
        UPDATE community_posts
        SET likes_count = (
          SELECT COUNT(*) FROM community_post_likes l WHERE l.post_id = community_posts.id
        )
        WHERE id = ?
      `,
        [Number(postId)],
      );
      const countRows = await client.query(
        'SELECT likes_count FROM community_posts WHERE id = ? LIMIT 1',
        [Number(postId)],
      );
      return {
        likesCount: Number(countRows[0]?.likes_count || 0),
        liked,
      };
    });
  };

  const toggleSave = async (userId, postId, saved) => {
    const normalizedUserId = normalizeUserId(userId);
    await ensureUser(normalizedUserId);
    return db.withTransaction(async client => {
      const postRows = await client.query(
        'SELECT id, status FROM community_posts WHERE id = ? LIMIT 1',
        [Number(postId)],
      );
      if (!postRows.length) {
        return {error: 'not_found'};
      }
      if (postRows[0].status !== 'published') {
        return {error: 'not_published'};
      }

      if (saved) {
        await client.query(
          `
          INSERT INTO community_post_saves(post_id, user_id)
          VALUES (?, ?)
          ON CONFLICT(post_id, user_id) DO NOTHING
        `,
          [Number(postId), normalizedUserId],
        );
      } else {
        await client.query(
          'DELETE FROM community_post_saves WHERE post_id = ? AND user_id = ?',
          [Number(postId), normalizedUserId],
        );
      }

      await client.query(
        `
        UPDATE community_posts
        SET saves_count = (
          SELECT COUNT(*) FROM community_post_saves s WHERE s.post_id = community_posts.id
        )
        WHERE id = ?
      `,
        [Number(postId)],
      );
      const countRows = await client.query(
        'SELECT saves_count FROM community_posts WHERE id = ? LIMIT 1',
        [Number(postId)],
      );
      return {
        savesCount: Number(countRows[0]?.saves_count || 0),
        saved,
      };
    });
  };

  const getComments = async (userId, postId, {size, offset, page}) => {
    await ensureUser(normalizeUserId(userId));
    const postRows = await db.query(
      'SELECT id FROM community_posts WHERE id = ? AND status = ? LIMIT 1',
      [Number(postId), 'published'],
    );
    if (!postRows.length) {
      return {error: 'not_found'};
    }

    const totalRows = await db.query(
      'SELECT COUNT(*) AS total FROM community_comments WHERE post_id = ?',
      [Number(postId)],
    );
    const total = Number(totalRows[0]?.total || 0);

    const rows = await db.query(
      `
      SELECT c.*, u.display_name, u.avatar_url
      FROM community_comments c
      JOIN community_users u ON u.id = c.author_id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
      LIMIT ? OFFSET ?
    `,
      [Number(postId), size, offset],
    );
    return {
      items: rows.map(toCommentView),
      page,
      size,
      total,
      hasMore: offset + size < total,
    };
  };

  const createComment = async (userId, postId, {content, parentId}) => {
    const normalizedUserId = normalizeUserId(userId);
    await ensureUser(normalizedUserId);
    return db.withTransaction(async client => {
      const postRows = await client.query(
        'SELECT id, status FROM community_posts WHERE id = ? LIMIT 1',
        [Number(postId)],
      );
      if (!postRows.length) {
        return {error: 'not_found'};
      }
      if (postRows[0].status !== 'published') {
        return {error: 'not_published'};
      }

      let parentValue = null;
      if (parentId) {
        const parentRows = await client.query(
          `
          SELECT id, parent_id
          FROM community_comments
          WHERE id = ? AND post_id = ?
          LIMIT 1
        `,
          [Number(parentId), Number(postId)],
        );
        if (!parentRows.length) {
          return {error: 'parent_not_found'};
        }
        if (parentRows[0].parent_id) {
          return {error: 'reply_depth_exceeded'};
        }
        parentValue = Number(parentId);
      }

      const inserted = await client.query(
        `
        INSERT INTO community_comments(post_id, author_id, parent_id, content)
        VALUES (?, ?, ?, ?)
      `,
        [Number(postId), normalizedUserId, parentValue, content],
      );

      await client.query(
        `
        UPDATE community_posts
        SET comments_count = (
          SELECT COUNT(*) FROM community_comments c WHERE c.post_id = community_posts.id
        )
        WHERE id = ?
      `,
        [Number(postId)],
      );

      const userRows = await client.query(
        'SELECT display_name, avatar_url FROM community_users WHERE id = ? LIMIT 1',
        [normalizedUserId],
      );

      return toCommentView({
        id: inserted.insertId,
        post_id: Number(postId),
        author_id: normalizedUserId,
        parent_id: parentValue,
        content,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        display_name: userRows[0]?.display_name || normalizedUserId,
        avatar_url: userRows[0]?.avatar_url || '',
      });
    });
  };

  return {
    createDraft,
    updateDraft,
    publishDraft,
    getFeed,
    getMyPosts,
    getLikedPosts,
    getSavedPosts,
    countPublishedByAuthorIdentity,
    toggleLike,
    toggleSave,
    getComments,
    createComment,
  };
};

module.exports = {
  createCommunityRepository,
};
