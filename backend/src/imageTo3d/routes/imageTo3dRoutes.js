const express = require('express');
const { Buffer } = require('node:buffer');
const { ApiError } = require('../errors');
const { validateImageUpload } = require('../imageValidation');
const { serializeModel, serializeTask } = require('../serializers');

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

async function proxyRemoteAsset(res, asset) {
  const upstreamResponse = await fetch(asset.url);
  if (!upstreamResponse.ok) {
    throw new ApiError(
      502,
      'ASSET_PROXY_FAILED',
      `Failed to load generated asset (${upstreamResponse.status}).`,
      {
        assetUrl: asset.url,
        upstreamStatus: upstreamResponse.status,
      },
    );
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

function createImageTo3DRouter({
  config,
  service,
  captureService,
  rateLimiter,
  upload,
  basePath = '/api/v1/image-to-3d',
  modelPath = '/api/models',
}) {
  const router = express.Router();

  router.post(`${basePath}/jobs`, rateLimiter, upload.single('image'), async (req, res, next) => {
    try {
      const validationError = validateImageUpload(req.file, config.maxUploadBytes);
      if (validationError) {
        throw new ApiError(400, validationError.code, validationError.message, validationError.details);
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

  router.get(`${basePath}/jobs/:taskId`, async (req, res, next) => {
    try {
      const task = await service.getTask(req.params.taskId);

      if (!task) {
        throw new ApiError(404, 'TASK_NOT_FOUND', 'Task not found.');
      }

      res.json(serializeTask(req, config, service.toPublicTask(task)));
    } catch (error) {
      next(error);
    }
  });

  router.options(`${basePath}/jobs/:taskId/assets/:assetIndex`, (_req, res) => {
    setAssetCorsHeaders(res);
    res.status(204).end();
  });

  router.get(`${basePath}/jobs/:taskId/assets/:assetIndex`, async (req, res, next) => {
    try {
      const task = await service.getTask(req.params.taskId);

      if (!task) {
        throw new ApiError(404, 'TASK_NOT_FOUND', 'Task not found.');
      }

      const asset = service.getTaskAsset(task, req.params.assetIndex);
      if (!asset?.url) {
        throw new ApiError(404, 'TASK_ASSET_NOT_FOUND', 'Asset not found.');
      }

      await proxyRemoteAsset(res, asset);
    } catch (error) {
      next(error);
    }
  });

  router.get(`${modelPath}/:modelId`, async (req, res, next) => {
    try {
      const model = await captureService.getPublicModelAsset(req.params.modelId);
      if (!model) {
        throw new ApiError(404, 'MODEL_NOT_FOUND', 'Model not found.');
      }

      res.json(serializeModel(req, config, model));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = {
  createImageTo3DRouter,
};
