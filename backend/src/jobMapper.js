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

function findPreviewImageUrl(files) {
  const normalizedFiles = (files || []).map(normalizeFile);
  const previewFile = normalizedFiles.find(file => file.previewImageUrl);
  return previewFile?.previewImageUrl || null;
}

function buildViewerPayload(files) {
  const normalizedFiles = (files || []).map(normalizeFile).filter(file => file.url);
  const previewImageUrl = findPreviewImageUrl(files);
  const glbFile = normalizedFiles.find(file => file.type === 'GLB');
  if (glbFile) {
    return {
      previewUrl: glbFile.url,
      previewImageUrl,
      downloadUrl: glbFile.url,
      fileType: glbFile.type,
      viewerFormat: 'glb',
      viewerFiles: [glbFile],
    };
  }

  const gltfFile = normalizedFiles.find(file => file.type === 'GLTF');
  if (gltfFile) {
    return {
      previewUrl: gltfFile.url,
      previewImageUrl,
      downloadUrl: gltfFile.url,
      fileType: gltfFile.type,
      viewerFormat: 'gltf',
      viewerFiles: [gltfFile],
    };
  }

  const objFile = normalizedFiles.find(file => file.type === 'OBJ');
  if (objFile) {
    const mtlFile = normalizedFiles.find(file => file.type === 'MTL') || null;
    return {
      previewUrl: objFile.url,
      previewImageUrl,
      downloadUrl: objFile.url,
      fileType: objFile.type,
      viewerFormat: 'obj',
      viewerFiles: mtlFile ? [objFile, mtlFile] : [objFile],
    };
  }

  const fbxFile = normalizedFiles.find(file => file.type === 'FBX');
  if (fbxFile) {
    return {
      previewUrl: fbxFile.url,
      previewImageUrl,
      downloadUrl: fbxFile.url,
      fileType: fbxFile.type,
      viewerFormat: 'fbx',
      viewerFiles: [fbxFile],
    };
  }

  const firstFile = normalizedFiles[0] || null;
  return {
    previewUrl: firstFile?.url || null,
    previewImageUrl,
    downloadUrl: firstFile?.url || null,
    fileType: firstFile?.type || null,
    viewerFormat: null,
    viewerFiles: [],
  };
}

function pickPreferredFile(files) {
  const payload = buildViewerPayload(files);
  if (!payload.previewUrl || !payload.fileType) {
    return null;
  }

  return {
    type: payload.fileType,
    url: payload.previewUrl,
    previewImageUrl: payload.previewImageUrl,
  };
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
    previewImageUrl: task.previewImageUrl || null,
    downloadUrl: task.downloadUrl || null,
    fileType: task.fileType || null,
    viewerFormat: task.viewerFormat || null,
    viewerFiles: task.viewerFiles || [],
    expiresAt: task.expiresAt || null,
  };
}

module.exports = {
  mapProviderStatus,
  buildViewerPayload,
  pickPreferredFile,
  toPublicTask,
};