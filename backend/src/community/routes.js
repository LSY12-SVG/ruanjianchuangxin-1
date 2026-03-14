const express = require('express');
const {
  parsePageAndSize,
  sanitizePostPayload,
  sanitizeCommentPayload,
  validateStatus,
  validateFeedFilter,
} = require('./validators');

const asBoolean = (value, fallback) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') {
      return true;
    }
    if (value.toLowerCase() === 'false') {
      return false;
    }
  }
  return fallback;
};

const isNonEmpty = value => typeof value === 'string' && value.trim().length > 0;
const resolveUserId = req => String(req.user?.id || '').trim();

const createCommunityRouter = ({
  repo,
  authMiddleware,
  optionalAuthMiddleware,
  pageSizeDefault,
  pageSizeMax,
}) => {
  const router = express.Router();

  router.get('/feed', optionalAuthMiddleware, async (req, res) => {
    const userId = resolveUserId(req) || 'guest';
    const pagination = parsePageAndSize(req.query, pageSizeDefault, pageSizeMax);
    const filter = validateFeedFilter(req.query.filter);
    try {
      const result = await repo.getFeed(userId, {...pagination, filter});
      res.json(result);
    } catch (error) {
      console.error('[community] feed failed', error);
      res.status(500).json({error: 'failed_to_fetch_feed'});
    }
  });

  router.get('/me/posts', authMiddleware, async (req, res) => {
    const userId = resolveUserId(req);
    const pagination = parsePageAndSize(req.query, pageSizeDefault, pageSizeMax);
    const status = validateStatus(req.query.status);
    try {
      const result = await repo.getMyPosts(userId, {...pagination, status});
      res.json(result);
    } catch (error) {
      console.error('[community] my posts failed', error);
      res.status(500).json({error: 'failed_to_fetch_my_posts'});
    }
  });

  router.post('/drafts', authMiddleware, async (req, res) => {
    const userId = resolveUserId(req);
    const payload = sanitizePostPayload(req.body);
    if (!isNonEmpty(payload.title)) {
      res.status(400).json({error: 'title_required'});
      return;
    }
    try {
      const draft = await repo.createDraft(userId, payload);
      res.status(201).json({item: draft});
    } catch (error) {
      console.error('[community] create draft failed', error);
      res.status(500).json({error: 'failed_to_create_draft'});
    }
  });

  router.put('/drafts/:id', authMiddleware, async (req, res) => {
    const userId = resolveUserId(req);
    const payload = sanitizePostPayload(req.body);
    if (!isNonEmpty(payload.title)) {
      res.status(400).json({error: 'title_required'});
      return;
    }
    try {
      const updated = await repo.updateDraft(userId, req.params.id, payload);
      if (!updated) {
        res.status(404).json({error: 'draft_not_found'});
        return;
      }
      res.json({item: updated});
    } catch (error) {
      console.error('[community] update draft failed', error);
      res.status(500).json({error: 'failed_to_update_draft'});
    }
  });

  router.post('/drafts/:id/publish', authMiddleware, async (req, res) => {
    const userId = resolveUserId(req);
    try {
      const published = await repo.publishDraft(userId, req.params.id);
      if (!published) {
        res.status(404).json({error: 'draft_not_found'});
        return;
      }
      res.json({item: published});
    } catch (error) {
      console.error('[community] publish draft failed', error);
      res.status(500).json({error: 'failed_to_publish_draft'});
    }
  });

  router.post('/posts/:id/like', authMiddleware, async (req, res) => {
    const userId = resolveUserId(req);
    const liked = asBoolean(req.body?.liked, true);
    try {
      const result = await repo.toggleLike(userId, req.params.id, liked);
      if (result?.error === 'not_found') {
        res.status(404).json({error: 'post_not_found'});
        return;
      }
      if (result?.error === 'not_published') {
        res.status(403).json({error: 'post_not_published'});
        return;
      }
      res.json(result);
    } catch (error) {
      console.error('[community] toggle like failed', error);
      res.status(500).json({error: 'failed_to_toggle_like'});
    }
  });

  router.post('/posts/:id/save', authMiddleware, async (req, res) => {
    const userId = resolveUserId(req);
    const saved = asBoolean(req.body?.saved, true);
    try {
      const result = await repo.toggleSave(userId, req.params.id, saved);
      if (result?.error === 'not_found') {
        res.status(404).json({error: 'post_not_found'});
        return;
      }
      if (result?.error === 'not_published') {
        res.status(403).json({error: 'post_not_published'});
        return;
      }
      res.json(result);
    } catch (error) {
      console.error('[community] toggle save failed', error);
      res.status(500).json({error: 'failed_to_toggle_save'});
    }
  });

  router.get('/posts/:id/comments', optionalAuthMiddleware, async (req, res) => {
    const userId = resolveUserId(req) || 'guest';
    const pagination = parsePageAndSize(req.query, pageSizeDefault, pageSizeMax);
    try {
      const result = await repo.getComments(userId, req.params.id, pagination);
      if (result?.error === 'not_found') {
        res.status(404).json({error: 'post_not_found'});
        return;
      }
      res.json(result);
    } catch (error) {
      console.error('[community] get comments failed', error);
      res.status(500).json({error: 'failed_to_fetch_comments'});
    }
  });

  router.post('/posts/:id/comments', authMiddleware, async (req, res) => {
    const userId = resolveUserId(req);
    const payload = sanitizeCommentPayload(req.body);
    if (!isNonEmpty(payload.content)) {
      res.status(400).json({error: 'comment_content_required'});
      return;
    }
    try {
      const result = await repo.createComment(userId, req.params.id, payload);
      if (result?.error === 'not_found') {
        res.status(404).json({error: 'post_not_found'});
        return;
      }
      if (result?.error === 'parent_not_found') {
        res.status(404).json({error: 'parent_comment_not_found'});
        return;
      }
      if (result?.error === 'reply_depth_exceeded') {
        res.status(400).json({error: 'reply_depth_exceeded'});
        return;
      }
      if (result?.error === 'not_published') {
        res.status(403).json({error: 'post_not_published'});
        return;
      }
      res.status(201).json({item: result});
    } catch (error) {
      console.error('[community] create comment failed', error);
      res.status(500).json({error: 'failed_to_create_comment'});
    }
  });

  return router;
};

module.exports = {
  createCommunityRouter,
};
