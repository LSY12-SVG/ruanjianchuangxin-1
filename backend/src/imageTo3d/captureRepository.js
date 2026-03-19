function mapSessionRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    status: row.status,
    targetFrameCount: row.target_frame_count,
    minimumFrameCount: row.minimum_frame_count,
    acceptedFrameCount: row.accepted_frame_count,
    coverFrameId: row.cover_frame_id,
    taskId: row.task_id,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFrameRow(row) {
  if (!row) {
    return null;
  }

  let qualityIssues = [];
  if (row.quality_issues_json) {
    try {
      qualityIssues = JSON.parse(row.quality_issues_json);
    } catch (_error) {
      qualityIssues = [];
    }
  }

  return {
    id: row.id,
    sessionId: row.session_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    width: row.width,
    height: row.height,
    storagePath: row.storage_path,
    angleTag: row.angle_tag,
    qualityScore: row.quality_score,
    qualityIssues,
    accepted: Boolean(row.accepted),
    capturedAt: row.captured_at,
    createdAt: row.created_at,
  };
}

function createCaptureRepository(db) {
  const insertSession = db.prepare(`
    INSERT INTO capture_sessions (
      id,
      status,
      target_frame_count,
      minimum_frame_count,
      accepted_frame_count,
      cover_frame_id,
      task_id,
      last_error_code,
      last_error_message,
      created_at,
      updated_at
    ) VALUES (
      @id,
      @status,
      @targetFrameCount,
      @minimumFrameCount,
      @acceptedFrameCount,
      @coverFrameId,
      @taskId,
      @lastErrorCode,
      @lastErrorMessage,
      @createdAt,
      @updatedAt
    )
  `);

  const updateSession = db.prepare(`
    UPDATE capture_sessions
    SET
      status = @status,
      target_frame_count = @targetFrameCount,
      minimum_frame_count = @minimumFrameCount,
      accepted_frame_count = @acceptedFrameCount,
      cover_frame_id = @coverFrameId,
      task_id = @taskId,
      last_error_code = @lastErrorCode,
      last_error_message = @lastErrorMessage,
      updated_at = @updatedAt
    WHERE id = @id
  `);

  const findSessionById = db.prepare(`
    SELECT *
    FROM capture_sessions
    WHERE id = ?
  `);

  const findSessionByTaskId = db.prepare(`
    SELECT *
    FROM capture_sessions
    WHERE task_id = ?
  `);

  const insertFrame = db.prepare(`
    INSERT INTO capture_frames (
      id,
      session_id,
      file_name,
      mime_type,
      file_size,
      width,
      height,
      storage_path,
      angle_tag,
      quality_score,
      quality_issues_json,
      accepted,
      captured_at,
      created_at
    ) VALUES (
      @id,
      @sessionId,
      @fileName,
      @mimeType,
      @fileSize,
      @width,
      @height,
      @storagePath,
      @angleTag,
      @qualityScore,
      @qualityIssuesJson,
      @accepted,
      @capturedAt,
      @createdAt
    )
  `);

  const findFrameById = db.prepare(`
    SELECT *
    FROM capture_frames
    WHERE session_id = ? AND id = ?
  `);

  const listFramesBySession = db.prepare(`
    SELECT *
    FROM capture_frames
    WHERE session_id = ?
    ORDER BY created_at ASC
  `);

  return {
    insertSession(session) {
      insertSession.run(session);
      return this.getSessionById(session.id);
    },

    updateSession(session) {
      updateSession.run(session);
      return this.getSessionById(session.id);
    },

    getSessionById(sessionId) {
      return mapSessionRow(findSessionById.get(sessionId));
    },

    getSessionByTaskId(taskId) {
      return mapSessionRow(findSessionByTaskId.get(taskId));
    },

    insertFrame(frame) {
      insertFrame.run({
        ...frame,
        qualityIssuesJson: JSON.stringify(frame.qualityIssues || []),
        accepted: frame.accepted ? 1 : 0,
      });

      return this.getFrameById(frame.sessionId, frame.id);
    },

    getFrameById(sessionId, frameId) {
      return mapFrameRow(findFrameById.get(sessionId, frameId));
    },

    listFramesBySession(sessionId) {
      return listFramesBySession.all(sessionId).map(mapFrameRow);
    },
  };
}

module.exports = {
  createCaptureRepository,
};
