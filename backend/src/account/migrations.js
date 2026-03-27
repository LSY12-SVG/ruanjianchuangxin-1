const fs = require('fs');
const path = require('path');

const MIGRATIONS_ROOT = path.resolve(__dirname, '../../migrations-account');

const ensureMigrationTable = async db => {
  const sql =
    db?.dialect === 'mysql'
      ? `
        CREATE TABLE IF NOT EXISTS account_schema_migrations (
          version VARCHAR(255) PRIMARY KEY,
          applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `
      : `
        CREATE TABLE IF NOT EXISTS account_schema_migrations (
          version TEXT PRIMARY KEY,
          applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `;
  await db.query(sql);
};

const resolveMigrationsDir = db => {
  const dialectDir = path.join(MIGRATIONS_ROOT, String(db?.dialect || 'sqlite'));
  if (fs.existsSync(dialectDir)) {
    return dialectDir;
  }
  return MIGRATIONS_ROOT;
};

const listMigrationFiles = dirPath => {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs
    .readdirSync(dirPath)
    .filter(file => file.endsWith('.sql'))
    .sort();
};

const runAccountMigrations = async db => {
  await ensureMigrationTable(db);
  const migrationsDir = resolveMigrationsDir(db);
  const files = listMigrationFiles(migrationsDir);

  for (const file of files) {
    const existing = await db.query(
      'SELECT version FROM account_schema_migrations WHERE version = ? LIMIT 1',
      [file],
    );
    if (Array.isArray(existing) && existing.length > 0) {
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
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
