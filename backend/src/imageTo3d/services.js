const crypto = require('crypto');
const {ApiError} = require('./errors');
const {mapProviderStatus, buildViewerPayload, toPublicTask} = require('./jobMapper');

function buildAssetUrl(basePath, taskId, assetIndex) {
  return `${basePath}/jobs/${taskId}/assets/${assetIndex}`;
}

function getAssetIndex(task, targetUrl) {
  if (!targetUrl) {
    return -1;
  }

  return (task.viewerFiles || []).findIndex(file => file?.url === targetUrl);
}

function buildPublicTask(task, jobsBasePath) {
  const publicTask = toPublicTask(task);
  const viewerFiles = (task.viewerFiles || []).map((file, index) => ({
    ...file,
    url: buildAssetUrl(jobsBasePath, task.taskId, index),
  }));

  const previewIndex = getAssetIndex(task, task.previewUrl);
  const downloadIndex = getAssetIndex(task, task.downloadUrl);

  return {
    ...publicTask,
    previewUrl:
      previewIndex >= 0
        ? buildAssetUrl(jobsBasePath, task.taskId, previewIndex)
        : publicTask.previewUrl,
    downloadUrl:
      downloadIndex >= 0
        ? buildAssetUrl(jobsBasePath, task.taskId, downloadIndex)
        : publicTask.downloadUrl,
    viewerFiles,
  };
}

function createImageTo3DService({
  provider,
  repository,
  logger,
  config,
  jobsBasePath = '/api/v1/image-to-3d',
}) {
  return {
    async createTask(file, options = {}) {
      const now = new Date().toISOString();
      const taskId = crypto.randomUUID();

      try {
        const submission = await provider.submitJob({
          imageBuffer: file.buffer,
          mimeType: file.mimetype,
          fileName: file.originalname,
        });

        const task = {
          taskId,
          provider: provider.name,
          providerJobId: submission.providerJobId,
          status: 'queued',
          rawStatus: 'WAIT',
          sourceImageRef:
            options.sourceImageRef || `${file.originalname}:${file.mimetype}:${file.size}`,
          previewUrl: null,
          previewImageUrl: null,
          downloadUrl: null,
          fileType: null,
          viewerFormat: null,
          viewerFiles: [],
          errorCode: null,
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
          expiresAt: null,
        };

        repository.insert(task);
        logger.info('Created image-to-3d task', {
          taskId,
          provider: task.provider,
          providerJobId: task.providerJobId,
        });

        return task;
      } catch (error) {
        logger.error('Failed to submit image-to-3d task', {
          taskId,
          message: error?.message,
        });
        throw new ApiError(
          502,
          'PROVIDER_SUBMIT_FAILED',
          error?.message || 'Failed to submit image-to-3d task.',
        );
      }
    },

    async getTask(taskId) {
      let task = repository.getById(taskId);

      if (!task) {
        return null;
      }

      task = this.markExpiredIfNeeded(task);

      if (task.status === 'queued' || task.status === 'processing') {
        try {
          const providerResult = await provider.getJob({providerJobId: task.providerJobId});
          const nextStatus = mapProviderStatus(providerResult.rawStatus);
          const viewerPayload = buildViewerPayload(providerResult.files);
          const now = new Date().toISOString();

          task = repository.update({
            ...task,
            status: nextStatus,
            rawStatus: providerResult.rawStatus || task.rawStatus,
            previewUrl: viewerPayload.previewUrl,
            previewImageUrl: viewerPayload.previewImageUrl,
            downloadUrl: viewerPayload.downloadUrl,
            fileType: viewerPayload.fileType,
            viewerFormat: viewerPayload.viewerFormat,
            viewerFiles: viewerPayload.viewerFiles,
            errorCode: providerResult.errorCode || null,
            errorMessage: providerResult.errorMessage || null,
            updatedAt: now,
            expiresAt:
              nextStatus === 'succeeded'
                ? new Date(Date.now() + config.resultTtlMs).toISOString()
                : task.expiresAt,
          });

          logger.info('Refreshed image-to-3d task', {
            taskId,
            providerJobId: task.providerJobId,
            status: task.status,
          });
        } catch (error) {
          logger.error('Failed to refresh image-to-3d task', {
            taskId,
            providerJobId: task.providerJobId,
            message: error?.message,
          });
          throw new ApiError(
            502,
            'PROVIDER_STATUS_FAILED',
            error?.message || 'Failed to query 3D generation task.',
          );
        }
      }

      return this.markExpiredIfNeeded(task);
    },

    markExpiredIfNeeded(task) {
      if (
        task.status === 'succeeded' &&
        task.expiresAt &&
        new Date(task.expiresAt).getTime() <= Date.now()
      ) {
        return repository.update({
          ...task,
          status: 'expired',
          previewUrl: null,
          previewImageUrl: null,
          downloadUrl: null,
          viewerFormat: null,
          viewerFiles: [],
          updatedAt: new Date().toISOString(),
        });
      }

      return task;
    },

    getTaskAsset(task, assetIndex) {
      const parsedIndex = Number.parseInt(String(assetIndex), 10);
      if (!Number.isInteger(parsedIndex) || parsedIndex < 0) {
        return null;
      }

      return (task.viewerFiles || [])[parsedIndex] || null;
    },

    toPublicTask(task) {
      return buildPublicTask(task, jobsBasePath);
    },
  };
}

module.exports = {
  createImageTo3DService,
};
