function mapRow(row) {
  if (!row) {
    return null;
  }

  return {
    taskId: row.task_id,
    provider: row.provider,
    providerJobId: row.provider_job_id,
    status: row.status,
    rawStatus: row.raw_status,
    sourceImageRef: row.source_image_ref,
    previewUrl: row.preview_url,
    downloadUrl: row.download_url,
    fileType: row.file_type,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

function createTaskRepository(db) {
  const insertTask = db.prepare(`
    INSERT INTO image_to_3d_tasks (
      task_id,
      provider,
      provider_job_id,
      status,
      raw_status,
      source_image_ref,
      preview_url,
      download_url,
      file_type,
      error_code,
      error_message,
      created_at,
      updated_at,
      expires_at
    ) VALUES (
      @taskId,
      @provider,
      @providerJobId,
      @status,
      @rawStatus,
      @sourceImageRef,
      @previewUrl,
      @downloadUrl,
      @fileType,
      @errorCode,
      @errorMessage,
      @createdAt,
      @updatedAt,
      @expiresAt
    )
  `);

  const updateTask = db.prepare(`
    UPDATE image_to_3d_tasks
    SET
      status = @status,
      raw_status = @rawStatus,
      preview_url = @previewUrl,
      download_url = @downloadUrl,
      file_type = @fileType,
      error_code = @errorCode,
      error_message = @errorMessage,
      updated_at = @updatedAt,
      expires_at = @expiresAt
    WHERE task_id = @taskId
  `);

  const findTaskById = db.prepare(`
    SELECT *
    FROM image_to_3d_tasks
    WHERE task_id = ?
  `);

  return {
    insert(task) {
      insertTask.run(task);
      return task;
    },
    update(task) {
      updateTask.run(task);
      return this.getById(task.taskId);
    },
    getById(taskId) {
      return mapRow(findTaskById.get(taskId));
    },
  };
}

module.exports = {
  createTaskRepository,
};
