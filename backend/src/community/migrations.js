const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

const ensureMigrationTable = async db => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

const listMigrationFiles = () => {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort();
};

const runCommunityMigrations = async db => {
  await ensureMigrationTable(db);
  const files = listMigrationFiles();

  for (const file of files) {
    const existing = await db.query(
      'SELECT version FROM schema_migrations WHERE version = ? LIMIT 1',
      [file],
    );
    if (Array.isArray(existing) && existing.length > 0) {
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await db.withTransaction(async client => {
      await client.exec(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES (?)', [file]);
    });
  }
};

module.exports = {
  runCommunityMigrations,
};
