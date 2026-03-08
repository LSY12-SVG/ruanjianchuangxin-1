const express = require('express');
const multer = require('multer');
const defaultConfig = require('./config');
const { createDatabase } = require('./db');
const { createTaskRepository } = require('./taskRepository');
const { createProvider } = require('./providers');
const { createImageTo3DService } = require('./services');
const { createLogger } = require('./logger');
const { createRateLimiter } = require('./rateLimiter');
const { validateImageUpload } = require('./imageValidation');
const { ApiError } = require('./errors');

function createApp(overrides = {}) {
  const config = { ...defaultConfig, ...(overrides.config || {}) };
  const logger = overrides.logger || createLogger();
  const db = overrides.db || createDatabase(config.databasePath);
  const repository = createTaskRepository(db);
  const provider = overrides.provider || createProvider(config);
  const service = createImageTo3DService({ provider, repository, logger, config });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes },
  });
  const rateLimiter = createRateLimiter({
    windowMs: config.rateLimitWindowMs,
    maxRequests: config.rateLimitMaxRequests,
  });

  const app = express();

  app.get('/health', (_req, res) => {
    res.json({ ok: true, provider: provider.name });
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

      res.json(service.toPublicTask(task));
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
      provider,
      service,
      config,
    },
  };
}

module.exports = {
  createApp,
};
