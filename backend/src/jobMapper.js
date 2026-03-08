function mapProviderStatus(rawStatus) {
  switch (rawStatus) {
    case 'WAIT':
      return 'queued';
    case 'RUN':
      return 'processing';
    case 'DONE':
      return 'succeeded';
    case 'FAIL':
      return 'failed';
    default:
      return 'processing';
  }
}

function normalizeFile(file) {
  return {
    type: String(file?.Type || '').toUpperCase(),
    url: file?.Url || null,
    previewImageUrl: file?.PreviewImageUrl || null,
  };
}

function pickPreferredFile(files) {
  const normalizedFiles = (files || []).map(normalizeFile).filter(file => file.url);
  const glbFile = normalizedFiles.find(file => file.type === 'GLB');

  return glbFile || normalizedFiles[0] || null;
}

function buildTaskMessage(task) {
  switch (task.status) {
    case 'queued':
      return 'Image received. Waiting for 3D generation to start.';
    case 'processing':
      return '3D model is being generated.';
    case 'succeeded':
      return '3D model is ready.';
    case 'failed':
      return task.errorMessage || '3D generation failed.';
    case 'expired':
      return 'The generated model link has expired. Please generate again.';
    default:
      return 'Task created.';
  }
}

function toPublicTask(task) {
  return {
    taskId: task.taskId,
    status: task.status,
    message: buildTaskMessage(task),
    previewUrl: task.previewUrl || null,
    downloadUrl: task.downloadUrl || null,
    fileType: task.fileType || null,
    expiresAt: task.expiresAt || null,
  };
}

module.exports = {
  mapProviderStatus,
  pickPreferredFile,
  toPublicTask,
};
