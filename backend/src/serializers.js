function resolveBaseUrl(req, config) {
  if (config.publicBaseUrl) {
    return config.publicBaseUrl;
  }

  return `${req.protocol}://${req.get('host')}`;
}

function absolutizeUrl(req, config, url) {
  if (!url || !url.startsWith('/')) {
    return url;
  }

  return new URL(url, `${resolveBaseUrl(req, config)}/`).toString();
}

function serializeViewerFile(req, config, file) {
  return {
    ...file,
    url: absolutizeUrl(req, config, file.url),
    previewImageUrl: absolutizeUrl(req, config, file.previewImageUrl),
  };
}

function serializeTask(req, config, task) {
  return {
    ...task,
    previewUrl: absolutizeUrl(req, config, task.previewUrl),
    previewImageUrl: absolutizeUrl(req, config, task.previewImageUrl),
    downloadUrl: absolutizeUrl(req, config, task.downloadUrl),
    viewerFiles: (task.viewerFiles || []).map(file => serializeViewerFile(req, config, file)),
  };
}

function serializeFrame(req, config, frame) {
  return {
    ...frame,
    imageUrl: absolutizeUrl(req, config, frame.imageUrl),
  };
}

function serializeSession(req, config, session) {
  return {
    ...session,
    frames: (session.frames || []).map(frame => serializeFrame(req, config, frame)),
  };
}

function serializeModel(req, config, model) {
  return {
    ...model,
    glbUrl: absolutizeUrl(req, config, model.glbUrl),
    thumbnailUrl: absolutizeUrl(req, config, model.thumbnailUrl),
    viewerFiles: (model.viewerFiles || []).map(file => serializeViewerFile(req, config, file)),
  };
}

module.exports = {
  absolutizeUrl,
  serializeFrame,
  serializeModel,
  serializeSession,
  serializeTask,
};
