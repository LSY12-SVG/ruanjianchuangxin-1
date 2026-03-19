const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function addColumnIfMissing(db, tableName, columnName, definition) {
  const existingColumns = db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .map(column => column.name);

  if (!existingColumns.includes(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function createDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), {recursive: true});

  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS image_to_3d_tasks (
      task_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_job_id TEXT NOT NULL,
      status TEXT NOT NULL,
      raw_status TEXT,
      source_image_ref TEXT,
      preview_url TEXT,
      preview_image_url TEXT,
      download_url TEXT,
      file_type TEXT,
      viewer_format TEXT,
      viewer_files_json TEXT,
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT
    )
  `);

  addColumnIfMissing(db, 'image_to_3d_tasks', 'preview_image_url', 'TEXT');
  addColumnIfMissing(db, 'image_to_3d_tasks', 'viewer_format', 'TEXT');
  addColumnIfMissing(db, 'image_to_3d_tasks', 'viewer_files_json', 'TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS capture_sessions (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      target_frame_count INTEGER NOT NULL,
      minimum_frame_count INTEGER NOT NULL,
      accepted_frame_count INTEGER NOT NULL DEFAULT 0,
      cover_frame_id TEXT,
      task_id TEXT,
      last_error_code TEXT,
      last_error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  addColumnIfMissing(db, 'capture_sessions', 'minimum_frame_count', 'INTEGER NOT NULL DEFAULT 8');
  addColumnIfMissing(db, 'capture_sessions', 'accepted_frame_count', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'capture_sessions', 'cover_frame_id', 'TEXT');
  addColumnIfMissing(db, 'capture_sessions', 'task_id', 'TEXT');
  addColumnIfMissing(db, 'capture_sessions', 'last_error_code', 'TEXT');
  addColumnIfMissing(db, 'capture_sessions', 'last_error_message', 'TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS capture_frames (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER,
      width INTEGER,
      height INTEGER,
      storage_path TEXT NOT NULL,
      angle_tag TEXT NOT NULL,
      quality_score REAL NOT NULL,
      quality_issues_json TEXT,
      accepted INTEGER NOT NULL DEFAULT 0,
      captured_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  addColumnIfMissing(db, 'capture_frames', 'width', 'INTEGER');
  addColumnIfMissing(db, 'capture_frames', 'height', 'INTEGER');
  addColumnIfMissing(db, 'capture_frames', 'quality_score', 'REAL NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'capture_frames', 'quality_issues_json', 'TEXT');
  addColumnIfMissing(db, 'capture_frames', 'accepted', 'INTEGER NOT NULL DEFAULT 0');

  return db;
}

module.exports = {
  createDatabase,
};
