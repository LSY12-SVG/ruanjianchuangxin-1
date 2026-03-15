const fs = require('fs');
const express = require('express');
const { ApiError } = require('../errors');
const { validateImageUpload } = require('../imageValidation');
const { serializeFrame, serializeSession } = require('../serializers');

function sendLocalAsset(res, frame) {
  if (!fs.existsSync(frame.storagePath)) {
    throw new ApiError(404, 'CAPTURED_FRAME_NOT_FOUND', 'Captured frame asset not found.');
  }

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', frame.mimeType || 'image/jpeg');
  res.status(200).send(fs.readFileSync(frame.storagePath));
}

function createCaptureRouter({ config, captureService, rateLimiter, upload }) {
  const router = express.Router();

  router.post('/api/capture-sessions', async (req, res, next) => {
    try {
      const session = captureService.createSession();
      res.status(201).json(serializeSession(req, config, session));
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/capture-sessions/:sessionId', async (req, res, next) => {
    try {
      const session = captureService.getPublicSession(req.params.sessionId);
      if (!session) {
        throw new ApiError(404, 'CAPTURE_SESSION_NOT_FOUND', 'Capture session not found.');
      }

      res.json(serializeSession(req, config, session));
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/capture-sessions/:sessionId/frames', rateLimiter, upload.single('image'), async (req, res, next) => {
    try {
      const validationError = validateImageUpload(req.file, config.maxUploadBytes);
      if (validationError) {
        throw new ApiError(400, validationError.code, validationError.message, validationError.details);
      }

      const result = captureService.addFrame(req.params.sessionId, req.file, {
        angleTag: req.body.angleTag,
        width: req.body.width,
        height: req.body.height,
        fileSize: req.body.fileSize,
      });

      res.status(201).json({
        session: serializeSession(req, config, result.session),
        frame: serializeFrame(req, config, result.frame),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/capture-sessions/:sessionId/frames/:frameId/asset', async (req, res, next) => {
    try {
      const frame = captureService.getFrameAsset(req.params.sessionId, req.params.frameId);
      if (!frame) {
        throw new ApiError(404, 'CAPTURED_FRAME_NOT_FOUND', 'Captured frame not found.');
      }

      sendLocalAsset(res, frame);
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/capture-sessions/:sessionId/generate', async (req, res, next) => {
    try {
      const result = await captureService.generateFromSession(req.params.sessionId);
      res.status(202).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = {
  createCaptureRouter,
};
