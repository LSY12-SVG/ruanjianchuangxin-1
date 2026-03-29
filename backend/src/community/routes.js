const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
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
const sendRouteError = (res, status, code, message) =>
  res.status(status).json({
    error: {
      code,
      message: message || code,
    },
  });

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const MIME_EXTENSION_MAP = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

const normalizeExtension = file => {
  const rawExt = path.extname(file?.originalname || '').trim().toLowerCase();
  if (rawExt && Object.values(MIME_EXTENSION_MAP).includes(rawExt)) {
    return rawExt;
  }
  return MIME_EXTENSION_MAP[file?.mimetype] || '.jpg';
};

const createImageUpload = ({uploadDir, uploadMaxBytes}) => {
  fs.mkdirSync(uploadDir, {recursive: true});
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadDir),
      filename: (_req, file, cb) => {
        const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        cb(null, `${stamp}${normalizeExtension(file)}`);
      },
    }),
    limits: {
      fileSize: uploadMaxBytes,
    },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
        cb(new Error('unsupported_image_type'));
        return;
      }
      cb(null, true);
    },
  });
};

const createCommunityRouter = ({
  repo,
  authMiddleware,
  optionalAuthMiddleware,
  pageSizeDefault,
  pageSizeMax,
  uploadDir,
  uploadMaxBytes,
}) => {
  const router = express.Router();
  const imageUpload = createImageUpload({uploadDir, uploadMaxBytes});

  router.use('/uploads', express.static(uploadDir));

  router.get('/feed', optionalAuthMiddleware, async (req, res) => {
    const userId = resolveUserId(req) || 'guest';
    const pagination = parsePageAndSize(req.query, pageSizeDefault, pageSizeMax);
    const filter = validateFeedFilter(req.query.filter);
    try {
      const result = await repo.getFeed(userId, {...pagination, filter});
      res.json(result);
    } catch (error) {
      console.error('[community] feed failed', error);
      sendRouteError(res, 500, 'failed_to_fetch_feed');
    }
  });

  router.get('/posts/:id', optionalAuthMiddleware, async (req, res) => {
    const userId = resolveUserId(req) || 'guest';
    try {
      const post = await repo.getPostById(userId, req.params.id);
      if (!post) {
        sendRouteError(res, 404, 'post_not_found');
        return;
      }
      res.json(post);
    } catch (error) {
      console.error('[community] post detail failed', error);
      sendRouteError(res, 500, 'failed_to_fetch_post');
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
      sendRouteError(res, 500, 'failed_to_fetch_my_posts');
    }
  });

  router.get('/me/liked', authMiddleware, async (req, res) => {
    const userId = resolveUserId(req);
    const pagination = parsePageAndSize(req.query, pageSizeDefault, pageSizeMax);
    try {
      const result = await repo.getLikedPosts(userId, pagination);
      res.json(result);
    } catch (error) {
      console.error('[community] liked posts failed', error);
      sendRouteError(res, 500, 'failed_to_fetch_liked_posts');
    }
  });

  router.get('/me/saved', authMiddleware, async (req, res) => {
    const userId = resolveUserId(req);
    const pagination = parsePageAndSize(req.query, pageSizeDefault, pageSizeMax);
    try {
      const result = await repo.getSavedPosts(userId, pagination);
      res.json(result);
    } catch (error) {
      console.error('[community] saved posts failed', error);
      sendRouteError(res, 500, 'failed_to_fetch_saved_posts');
    }
  });

  router.post('/uploads/images', authMiddleware, (req, res) => {
    imageUpload.single('image')(req, res, error => {
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        sendRouteError(res, 400, 'image_too_large');
        return;
      }
      if (error && error.message === 'unsupported_image_type') {
        sendRouteError(res, 400, 'unsupported_image_type');
        return;
      }
      if (error) {
        sendRouteError(res, 400, 'image_upload_failed', error.message || 'image_upload_failed');
        return;
      }
      if (!req.file?.filename) {
        sendRouteError(res, 400, 'image_required');
        return;
      }
      const publicPath = `/v1/modules/community/uploads/${encodeURIComponent(req.file.filename)}`;
      res.status(201).json({
        url: `${req.protocol}://${req.get('host')}${publicPath}`,
      });
    });
  });

  router.post('/drafts', authMiddleware, async (req, res) => {
    const userId = resolveUserId(req);
    const payload = sanitizePostPayload(req.body);
    if (!isNonEmpty(payload.title)) {
      sendRouteError(res, 400, 'title_required');
      return;
    }
    try {
      const draft = await repo.createDraft(userId, payload);
      res.status(201).json({item: draft});
    } catch (error) {
      console.error('[community] create draft failed', error);
      sendRouteError(res, 500, 'failed_to_create_draft');
    }
  });

  router.put('/drafts/:id', authMiddleware, async (req, res) => {
    const userId = resolveUserId(req);
    const payload = sanitizePostPayload(req.body);
    if (!isNonEmpty(payload.title)) {
      sendRouteError(res, 400, 'title_required');
      return;
    }
    try {
      const updated = await repo.updateDraft(userId, req.params.id, payload);
      if (!updated) {
        sendRouteError(res, 404, 'draft_not_found');
        return;
      }
      res.json({item: updated});
    } catch (error) {
      console.error('[community] update draft failed', error);
      sendRouteError(res, 500, 'failed_to_update_draft');
    }
  });

  router.post('/drafts/:id/publish', authMiddleware, async (req, res) => {
    const userId = resolveUserId(req);
    try {
      const published = await repo.publishDraft(userId, req.params.id);
      if (!published) {
        sendRouteError(res, 404, 'draft_not_found');
        return;
      }
      res.json({item: published});
    } catch (error) {
      console.error('[community] publish draft failed', error);
      sendRouteError(res, 500, 'failed_to_publish_draft');
    }
  });

  router.post('/posts/:id/like', authMiddleware, async (req, res) => {
    const userId = resolveUserId(req);
    const liked = asBoolean(req.body?.liked, true);
    try {
      const result = await repo.toggleLike(userId, req.params.id, liked);
      if (result?.error === 'not_found') {
        sendRouteError(res, 404, 'post_not_found');
        return;
      }
      if (result?.error === 'not_published') {
        sendRouteError(res, 403, 'post_not_published');
        return;
      }
      res.json(result);
    } catch (error) {
      console.error('[community] toggle like failed', error);
      sendRouteError(res, 500, 'failed_to_toggle_like');
    }
  });

  router.post('/posts/:id/save', authMiddleware, async (req, res) => {
    const userId = resolveUserId(req);
    const saved = asBoolean(req.body?.saved, true);
    try {
      const result = await repo.toggleSave(userId, req.params.id, saved);
      if (result?.error === 'not_found') {
        sendRouteError(res, 404, 'post_not_found');
        return;
      }
      if (result?.error === 'not_published') {
        sendRouteError(res, 403, 'post_not_published');
        return;
      }
      res.json(result);
    } catch (error) {
      console.error('[community] toggle save failed', error);
      sendRouteError(res, 500, 'failed_to_toggle_save');
    }
  });

  router.delete('/posts/:id', authMiddleware, async (req, res) => {
    const userId = resolveUserId(req);
    try {
      const result = await repo.deletePost(userId, req.params.id);
      if (result?.error === 'not_found') {
        sendRouteError(res, 404, 'post_not_found');
        return;
      }
      if (result?.error === 'forbidden') {
        sendRouteError(res, 403, 'post_delete_forbidden');
        return;
      }
      res.json(result);
    } catch (error) {
      console.error('[community] delete post failed', error);
      sendRouteError(res, 500, 'failed_to_delete_post');
    }
  });

  router.get('/posts/:id/comments', optionalAuthMiddleware, async (req, res) => {
    const userId = resolveUserId(req) || 'guest';
    const pagination = parsePageAndSize(req.query, pageSizeDefault, pageSizeMax);
    try {
      const result = await repo.getComments(userId, req.params.id, pagination);
      if (result?.error === 'not_found') {
        sendRouteError(res, 404, 'post_not_found');
        return;
      }
      res.json(result);
    } catch (error) {
      console.error('[community] get comments failed', error);
      sendRouteError(res, 500, 'failed_to_fetch_comments');
    }
  });

  router.post('/posts/:id/comments', authMiddleware, async (req, res) => {
    const userId = resolveUserId(req);
    const payload = sanitizeCommentPayload(req.body);
    if (!isNonEmpty(payload.content)) {
      sendRouteError(res, 400, 'comment_content_required');
      return;
    }
    try {
      const result = await repo.createComment(userId, req.params.id, payload);
      if (result?.error === 'not_found') {
        sendRouteError(res, 404, 'post_not_found');
        return;
      }
      if (result?.error === 'parent_not_found') {
        sendRouteError(res, 404, 'parent_comment_not_found');
        return;
      }
      if (result?.error === 'reply_depth_exceeded') {
        sendRouteError(res, 400, 'reply_depth_exceeded');
        return;
      }
      if (result?.error === 'not_published') {
        sendRouteError(res, 403, 'post_not_published');
        return;
      }
      res.status(201).json({item: result});
    } catch (error) {
      console.error('[community] create comment failed', error);
      sendRouteError(res, 500, 'failed_to_create_comment');
    }
  });

  return router;
};

module.exports = {
  createCommunityRouter,
};
