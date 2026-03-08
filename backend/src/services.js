const crypto = require('crypto');
const { ApiError } = require('./errors');
const { mapProviderStatus, pickPreferredFile, toPublicTask } = require('./jobMapper');

function createImageTo3DService({ provider, repository, logger, config }) {
  return {
    async createTask(file) {
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
          sourceImageRef: `${file.originalname}:${file.mimetype}:${file.size}`,
          previewUrl: null,
          downloadUrl: null,
          fileType: null,
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
        throw new ApiError(502, error?.message || 'Failed to submit image-to-3d task.');
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
          const providerResult = await provider.getJob({ providerJobId: task.providerJobId });
          const nextStatus = mapProviderStatus(providerResult.rawStatus);
          const preferredFile = pickPreferredFile(providerResult.files);
          const now = new Date().toISOString();

          task = repository.update({
            ...task,
            status: nextStatus,
            rawStatus: providerResult.rawStatus || task.rawStatus,
            previewUrl: preferredFile?.type === 'GLB' ? preferredFile.url : null,
            downloadUrl: preferredFile?.url || null,
            fileType: preferredFile?.type || null,
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
          throw new ApiError(502, error?.message || 'Failed to query 3D generation task.');
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
          downloadUrl: null,
          updatedAt: new Date().toISOString(),
        });
      }

      return task;
    },

    toPublicTask(task) {
      return toPublicTask(task);
    },
  };
}

module.exports = {
  createImageTo3DService,
};


