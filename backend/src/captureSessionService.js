const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {ApiError} = require('./errors');
const {
  TARGET_FRAME_COUNT,
  MINIMUM_FRAME_COUNT,
  getMissingAngleTags,
} = require('./captureGuidance');

function clampScore(value) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function buildFrameAssetUrl(sessionId, frameId) {
  return `/api/capture-sessions/${sessionId}/frames/${frameId}/asset`;
}

function getCriticalIssues(qualityIssues) {
  return new Set(['duplicate_angle']);
}

function assessFrameQuality({existingFrames, angleTag, width, height, fileSize}) {
  const issues = [];
  let score = 0.92;

  if ((existingFrames || []).some(frame => frame.accepted && frame.angleTag === angleTag)) {
    issues.push('duplicate_angle');
    score -= 0.5;
  }

  const normalizedWidth = Number(width) || 0;
  const normalizedHeight = Number(height) || 0;
  const normalizedSize = Number(fileSize) || 0;

  if (normalizedWidth > 0 && normalizedHeight > 0) {
    const shortestEdge = Math.min(normalizedWidth, normalizedHeight);
    if (shortestEdge < 720) {
      issues.push('subject_too_small');
      score -= 0.18;
    }

    const aspectRatio = normalizedWidth / normalizedHeight;
    if (aspectRatio < 0.65 || aspectRatio > 1.7) {
      issues.push('off_center');
      score -= 0.06;
    }

    const bytesPerPixel =
      normalizedSize > 0 ? normalizedSize / (normalizedWidth * normalizedHeight) : 0;
    if (bytesPerPixel > 0 && bytesPerPixel < 0.03) {
      issues.push('blurry_risk');
      score -= 0.12;
    }
  }

  if (normalizedSize > 0 && normalizedSize < 120000) {
    issues.push('exposure_risk');
    score -= 0.1;
  }

  const accepted = !issues.some(issue => getCriticalIssues().has(issue)) && score >= 0.3;

  return {
    qualityScore: clampScore(score),
    qualityIssues: [...new Set(issues)],
    accepted,
  };
}

function ensureFrameDirectory(rootDir, sessionId) {
  const sessionDir = path.join(rootDir, sessionId);
  fs.mkdirSync(sessionDir, {recursive: true});
  return sessionDir;
}

function buildPublicFrame(frame) {
  return {
    id: frame.id,
    sessionId: frame.sessionId,
    imageUrl: buildFrameAssetUrl(frame.sessionId, frame.id),
    angleTag: frame.angleTag,
    qualityScore: frame.qualityScore,
    qualityIssues: frame.qualityIssues,
    accepted: frame.accepted,
    width: frame.width || null,
    height: frame.height || null,
    capturedAt: frame.capturedAt,
  };
}

function chooseCoverFrame(frames) {
  return [...frames].sort((left, right) => right.qualityScore - left.qualityScore)[0] || null;
}

function buildCaptureHints(session, frames) {
  const missingAngleTags = getMissingAngleTags(frames);
  const suggestedAngleTag = missingAngleTags[0] || null;
  const remainingCount = missingAngleTags.length;

  return {
    missingAngleTags,
    suggestedAngleTag,
    remainingCount,
    statusHint:
      session.acceptedFrameCount >= session.targetFrameCount
        ? '视角覆盖已经完整，可以直接生成 3D 结果。'
        : session.acceptedFrameCount >= session.minimumFrameCount
          ? '当前覆盖已经足够生成。你也可以继续自由补拍其它角度。'
          : '点击任意角度开始拍摄；当前质量提示只做参考，不再强制固定顺序。',
  };
}

function buildPublicSession(session, frames) {
  const captureHints = buildCaptureHints(session, frames);

  return {
    id: session.id,
    status: session.status,
    targetFrameCount: session.targetFrameCount,
    minimumFrameCount: session.minimumFrameCount,
    acceptedFrameCount: session.acceptedFrameCount,
    coverFrameId: session.coverFrameId,
    taskId: session.taskId || null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastErrorCode: session.lastErrorCode || null,
    lastErrorMessage: session.lastErrorMessage || null,
    frames: frames.map(buildPublicFrame),
    ...captureHints,
  };
}

function buildPublicModelAsset(task, session) {
  return {
    id: task.taskId,
    sessionId: session.id,
    glbUrl: task.downloadUrl,
    thumbnailUrl: task.previewImageUrl,
    boundingBox: {
      x: 1,
      y: 1,
      z: 1,
    },
    defaultCamera: {
      position: {x: 2.2, y: 1.6, z: 2.2},
      target: {x: 0, y: 0, z: 0},
      fov: 45,
    },
    autoRotateSpeed: 0.85,
    viewerFormat: task.viewerFormat,
    viewerFiles: task.viewerFiles || [],
    createdAt: task.createdAt || session.updatedAt,
  };
}

function createCaptureSessionService({captureRepository, imageService, logger, config}) {
  return {
    createSession() {
      const now = new Date().toISOString();
      const session = captureRepository.insertSession({
        id: crypto.randomUUID(),
        status: 'collecting',
        targetFrameCount: TARGET_FRAME_COUNT,
        minimumFrameCount: MINIMUM_FRAME_COUNT,
        acceptedFrameCount: 0,
        coverFrameId: null,
        taskId: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        createdAt: now,
        updatedAt: now,
      });

      logger.info('Created capture session', {sessionId: session.id});
      return this.getPublicSession(session.id);
    },

    getSession(sessionId) {
      const session = captureRepository.getSessionById(sessionId);
      if (!session) {
        return null;
      }

      return {
        session,
        frames: captureRepository.listFramesBySession(sessionId),
      };
    },

    getPublicSession(sessionId) {
      const payload = this.getSession(sessionId);
      if (!payload) {
        return null;
      }

      return buildPublicSession(payload.session, payload.frames);
    },

    getFrameAsset(sessionId, frameId) {
      return captureRepository.getFrameById(sessionId, frameId);
    },

    addFrame(sessionId, file, metadata = {}) {
      const payload = this.getSession(sessionId);
      if (!payload) {
        throw new ApiError(404, 'Capture session not found.');
      }

      if (payload.session.status === 'generating') {
        throw new ApiError(409, 'The session is already generating a 3D result.');
      }

      const angleTag = String(metadata.angleTag || '').trim();
      if (!angleTag) {
        throw new ApiError(400, 'angleTag is required.');
      }

      const now = new Date().toISOString();
      const quality = assessFrameQuality({
        existingFrames: payload.frames,
        angleTag,
        width: metadata.width,
        height: metadata.height,
        fileSize: metadata.fileSize || file.size,
      });

      const extension = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      const frameId = crypto.randomUUID();
      const sessionDir = ensureFrameDirectory(config.captureFramesDir, sessionId);
      const storagePath = path.join(sessionDir, `${frameId}${extension}`);
      fs.writeFileSync(storagePath, file.buffer);

      const frame = captureRepository.insertFrame({
        id: frameId,
        sessionId,
        fileName: file.originalname || `${frameId}${extension}`,
        mimeType: file.mimetype,
        fileSize: Number(metadata.fileSize) || file.size || null,
        width: Number(metadata.width) || null,
        height: Number(metadata.height) || null,
        storagePath,
        angleTag,
        qualityScore: quality.qualityScore,
        qualityIssues: quality.qualityIssues,
        accepted: quality.accepted,
        capturedAt: now,
        createdAt: now,
      });

      const nextFrames = [...payload.frames, frame];
      const acceptedFrames = nextFrames.filter(item => item.accepted);
      const coverFrame = chooseCoverFrame(acceptedFrames);
      const session = captureRepository.updateSession({
        ...payload.session,
        status:
          acceptedFrames.length >= payload.session.minimumFrameCount ? 'ready' : 'collecting',
        acceptedFrameCount: acceptedFrames.length,
        coverFrameId: coverFrame?.id || null,
        updatedAt: now,
        lastErrorCode: null,
        lastErrorMessage: null,
      });

      return {
        session: buildPublicSession(session, nextFrames),
        frame: buildPublicFrame(frame),
      };
    },

    async generateFromSession(sessionId) {
      const payload = this.getSession(sessionId);
      if (!payload) {
        throw new ApiError(404, 'Capture session not found.');
      }

      const acceptedFrames = payload.frames.filter(frame => frame.accepted);
      if (acceptedFrames.length < payload.session.minimumFrameCount) {
        throw new ApiError(
          400,
          `Capture at least ${payload.session.minimumFrameCount} accepted views before generating.`,
        );
      }

      const coverFrame = chooseCoverFrame(acceptedFrames);
      if (!coverFrame) {
        throw new ApiError(400, 'No accepted capture frames are available.');
      }

      const fileBuffer = fs.readFileSync(coverFrame.storagePath);
      const task = await imageService.createTask(
        {
          buffer: fileBuffer,
          mimetype: coverFrame.mimeType,
          originalname: coverFrame.fileName,
          size: coverFrame.fileSize || fileBuffer.length,
        },
        {
          sourceImageRef: `capture-session:${sessionId}:accepted:${acceptedFrames.length}`,
        },
      );

      const now = new Date().toISOString();
      const session = captureRepository.updateSession({
        ...payload.session,
        status: 'generating',
        taskId: task.taskId,
        updatedAt: now,
        lastErrorCode: null,
        lastErrorMessage: null,
      });

      logger.info('Started reconstruction from capture session', {
        sessionId,
        taskId: task.taskId,
        acceptedFrameCount: acceptedFrames.length,
      });

      return {
        taskId: task.taskId,
        modelId: task.taskId,
        sessionId: session.id,
        status: task.status,
        pollAfterMs: config.pollAfterMs,
      };
    },

    syncSessionTask(task) {
      const session = captureRepository.getSessionByTaskId(task.taskId);
      if (!session) {
        return null;
      }

      let nextStatus = session.status;
      if (task.status === 'queued' || task.status === 'processing') {
        nextStatus = 'generating';
      } else if (task.status === 'succeeded') {
        nextStatus = 'ready_to_view';
      } else if (task.status === 'failed' || task.status === 'expired') {
        nextStatus = 'failed';
      }

      return captureRepository.updateSession({
        ...session,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
        lastErrorCode: task.errorCode || null,
        lastErrorMessage: task.errorMessage || null,
      });
    },

    async getPublicModelAsset(modelId) {
      const task = await imageService.getTask(modelId);
      if (!task) {
        return null;
      }

      const session = captureRepository.getSessionByTaskId(task.taskId);
      if (!session) {
        return null;
      }

      if (task.status !== 'succeeded') {
        throw new ApiError(409, 'The 3D model is not ready yet.');
      }

      return buildPublicModelAsset(imageService.toPublicTask(task), session);
    },
  };
}

module.exports = {
  createCaptureSessionService,
  buildPublicSession,
  buildPublicModelAsset,
};
