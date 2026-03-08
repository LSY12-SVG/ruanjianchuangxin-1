const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function createDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

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

  const existingColumns = db
    .prepare('PRAGMA table_info(image_to_3d_tasks)')
    .all()
    .map(column => column.name);

  const addColumnIfMissing = (columnName, definition) => {
    if (!existingColumns.includes(columnName)) {
      db.exec(`ALTER TABLE image_to_3d_tasks ADD COLUMN ${columnName} ${definition}`);
    }
  };

  addColumnIfMissing('preview_image_url', 'TEXT');
  addColumnIfMissing('viewer_format', 'TEXT');
  addColumnIfMissing('viewer_files_json', 'TEXT');

  return db;
}

module.exports = {
  createDatabase,
};