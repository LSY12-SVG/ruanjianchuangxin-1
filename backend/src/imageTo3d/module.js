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
const {toErrorResponse} = require('./errors');
const {createCaptureRouter} = require('./routes/captureRoutes');
const {createImageTo3DRouter} = require('./routes/imageTo3dRoutes');

function createImageTo3DModule(overrides = {}) {
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

  const imageTo3DRouter = createImageTo3DRouter({
    config,
    service,
    captureService,
    rateLimiter,
    upload,
  });
  const captureRouter = createCaptureRouter({
    config,
    captureService,
    rateLimiter,
    upload,
  });

  const handleError = (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json(
        toErrorResponse({
          statusCode: 400,
          code: 'FILE_TOO_LARGE',
          message: 'The uploaded image is too large.',
          details: {
            maxUploadBytes: config.maxUploadBytes,
          },
        }),
      );
      return;
    }

    const statusCode = error?.statusCode || 500;
    res.status(statusCode).json(toErrorResponse(error));
  };

  const close = () => {
    if (db?.close) {
      db.close();
    }
  };

  return {
    config,
    provider,
    db,
    imageTo3DRouter,
    captureRouter,
    handleError,
    close,
  };
}

module.exports = {
  createImageTo3DModule,
};
