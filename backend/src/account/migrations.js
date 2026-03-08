const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations-account');

const ensureMigrationTable = async db => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS account_schema_migrations (
      version TEXT PRIMARY KEY,
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

const runAccountMigrations = async db => {
  await ensureMigrationTable(db);
  const files = listMigrationFiles();

  for (const file of files) {
    const existing = await db.query(
      'SELECT version FROM account_schema_migrations WHERE version = ? LIMIT 1',
      [file],
    );
    if (Array.isArray(existing) && existing.length > 0) {
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await db.withTransaction(async client => {
      await client.exec(sql);
      await client.query(
        'INSERT INTO account_schema_migrations(version) VALUES (?)',
        [file],
      );
    });
  }
};

module.exports = {
  runAccountMigrations,
};
