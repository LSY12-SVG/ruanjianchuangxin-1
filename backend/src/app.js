const fs = require('fs');
const express = require('express');
const multer = require('multer');
const defaultConfig = require('./config');
const {createDatabase} = require('./db');
const {createTaskRepository} = require('./taskRepository');
const {createCaptureRepository} = require('./captureRepository');
const {createProvider} = require('./providers');
const {createImageTo3DService} = require('./services');
const {createCaptureSessionService} = require('./captureSessionService');
const {createLogger} = require('./logger');
const {createRateLimiter} = require('./rateLimiter');
const {validateImageUpload} = require('./imageValidation');
const {ApiError} = require('./errors');

function setAssetCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
}

function pickContentType(asset, upstreamResponse) {
  return (
    upstreamResponse.headers.get('content-type') ||
    (asset?.type === 'GLB' ? 'model/gltf-binary' : null) ||
    'application/octet-stream'
  );
}

function absolutizeUrl(req, url) {
  if (!url || !url.startsWith('/')) {
    return url;
  }

  return new URL(url, `${req.protocol}://${req.get('host')}`).toString();
}

function absolutizePublicTask(req, task) {
  return {
    ...task,
    previewUrl: absolutizeUrl(req, task.previewUrl),
    previewImageUrl: absolutizeUrl(req, task.previewImageUrl),
    downloadUrl: absolutizeUrl(req, task.downloadUrl),
    viewerFiles: (task.viewerFiles || []).map(file => ({
      ...file,
      url: absolutizeUrl(req, file.url),
      previewImageUrl: absolutizeUrl(req, file.previewImageUrl),
    })),
  };
}

function absolutizePublicSession(req, session) {
  return {
    ...session,
    frames: (session.frames || []).map(frame => ({
      ...frame,
      imageUrl: absolutizeUrl(req, frame.imageUrl),
    })),
  };
}

function absolutizePublicModel(req, model) {
  return {
    ...model,
    glbUrl: absolutizeUrl(req, model.glbUrl),
    thumbnailUrl: absolutizeUrl(req, model.thumbnailUrl),
    viewerFiles: (model.viewerFiles || []).map(file => ({
      ...file,
      url: absolutizeUrl(req, file.url),
      previewImageUrl: absolutizeUrl(req, file.previewImageUrl),
    })),
  };
}

async function proxyRemoteAsset(res, asset) {
  const upstreamResponse = await fetch(asset.url);
  if (!upstreamResponse.ok) {
    throw new ApiError(502, `Failed to load generated asset (${upstreamResponse.status}).`);
  }

  const bodyBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
  setAssetCorsHeaders(res);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', pickContentType(asset, upstreamResponse));

  const contentLength = upstreamResponse.headers.get('content-length');
  if (contentLength) {
    res.setHeader('Content-Length', contentLength);
  }

  res.status(200).send(bodyBuffer);
}

function sendLocalAsset(res, frame) {
  if (!fs.existsSync(frame.storagePath)) {
    throw new ApiError(404, 'Captured frame asset not found.');
  }

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', frame.mimeType || 'image/jpeg');
  res.status(200).send(fs.readFileSync(frame.storagePath));
}

function createApp(overrides = {}) {
  const config = {...defaultConfig, ...(overrides.config || {})};
  const logger = overrides.logger || createLogger();
  const db = overrides.db || createDatabase(config.databasePath);
  const repository = createTaskRepository(db);
  const captureRepository = createCaptureRepository(db);
  const provider = overrides.provider || createProvider(config);
  const service = createImageTo3DService({provider, repository, logger, config});
  const captureService = createCaptureSessionService({
    captureRepository,
    imageService: service,
    logger,
    config,
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {fileSize: config.maxUploadBytes},
  });
  const rateLimiter = createRateLimiter({
    windowMs: config.rateLimitWindowMs,
    maxRequests: config.rateLimitMaxRequests,
  });

  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ok: true, provider: provider.name});
  });

  app.post('/api/v1/image-to-3d/jobs', rateLimiter, upload.single('image'), async (req, res, next) => {
    try {
      const validationError = validateImageUpload(req.file, config.maxUploadBytes);
      if (validationError) {
        throw new ApiError(400, validationError);
      }

      const task = await service.createTask(req.file);
      res.status(202).json({
        taskId: task.taskId,
        status: 'queued',
        pollAfterMs: config.pollAfterMs,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/image-to-3d/jobs/:taskId', async (req, res, next) => {
    try {
      const task = await service.getTask(req.params.taskId);

      if (!task) {
        throw new ApiError(404, 'Task not found.');
      }

      res.json(absolutizePublicTask(req, service.toPublicTask(task)));
    } catch (error) {
      next(error);
    }
  });

  app.options('/api/v1/image-to-3d/jobs/:taskId/assets/:assetIndex', (_req, res) => {
    setAssetCorsHeaders(res);
    res.status(204).end();
  });

  app.get('/api/v1/image-to-3d/jobs/:taskId/assets/:assetIndex', async (req, res, next) => {
    try {
      const task = await service.getTask(req.params.taskId);

      if (!task) {
        throw new ApiError(404, 'Task not found.');
      }

      const asset = service.getTaskAsset(task, req.params.assetIndex);
      if (!asset?.url) {
        throw new ApiError(404, 'Asset not found.');
      }

      await proxyRemoteAsset(res, asset);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/capture-sessions', async (_req, res, next) => {
    try {
      const session = captureService.createSession();
      res.status(201).json(absolutizePublicSession(res.req, session));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/capture-sessions/:sessionId', async (req, res, next) => {
    try {
      const session = captureService.getPublicSession(req.params.sessionId);
      if (!session) {
        throw new ApiError(404, 'Capture session not found.');
      }

      res.json(absolutizePublicSession(req, session));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/capture-sessions/:sessionId/frames', rateLimiter, upload.single('image'), async (req, res, next) => {
    try {
      const validationError = validateImageUpload(req.file, config.maxUploadBytes);
      if (validationError) {
        throw new ApiError(400, validationError);
      }

      const result = captureService.addFrame(req.params.sessionId, req.file, {
        angleTag: req.body.angleTag,
        width: req.body.width,
        height: req.body.height,
        fileSize: req.body.fileSize,
      });

      res.status(201).json({
        session: absolutizePublicSession(req, result.session),
        frame: {
          ...result.frame,
          imageUrl: absolutizeUrl(req, result.frame.imageUrl),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/capture-sessions/:sessionId/frames/:frameId/asset', async (req, res, next) => {
    try {
      const frame = captureService.getFrameAsset(req.params.sessionId, req.params.frameId);
      if (!frame) {
        throw new ApiError(404, 'Captured frame not found.');
      }

      sendLocalAsset(res, frame);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/capture-sessions/:sessionId/generate', async (req, res, next) => {
    try {
      const result = await captureService.generateFromSession(req.params.sessionId);
      res.status(202).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/reconstruction-tasks/:taskId', async (req, res, next) => {
    try {
      const task = await service.getTask(req.params.taskId);
      if (!task) {
        throw new ApiError(404, 'Task not found.');
      }

      const publicTask = absolutizePublicTask(req, service.toPublicTask(task));
      const session = captureService.syncSessionTask(task);

      res.json({
        ...publicTask,
        sessionId: session?.id || null,
        modelId: task.status === 'succeeded' ? task.taskId : null,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/models/:modelId', async (req, res, next) => {
    try {
      const model = await captureService.getPublicModelAsset(req.params.modelId);
      if (!model) {
        throw new ApiError(404, 'Model not found.');
      }

      res.json(absolutizePublicModel(req, model));
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          error: {
            code: 'FILE_TOO_LARGE',
            message: 'The uploaded image is too large.',
          },
        });
        return;
      }
    }

    const statusCode = error.statusCode || 500;
    const code = statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
    res.status(statusCode).json({
      error: {
        code,
        message: error.message || 'Unexpected server error.',
      },
    });
  });

  return {
    app,
    dependencies: {
      db,
      repository,
      captureRepository,
      provider,
      service,
      captureService,
      config,
    },
  };
}

module.exports = {
  createApp,
};
