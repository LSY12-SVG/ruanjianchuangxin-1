const path = require('path');

const asPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const normalizeDbClient = value => {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'mysql' ? 'mysql' : 'sqlite';
};

const isDbSslEnabled = value => String(value || '').toLowerCase() === 'true';

const readMysqlSettings = () => {
  const host = process.env.ACCOUNT_DB_HOST || process.env.DB_HOST || process.env.MYSQL_HOST;
  const database =
    process.env.ACCOUNT_DB_NAME || process.env.DB_NAME || process.env.MYSQL_DATABASE;
  const user = process.env.ACCOUNT_DB_USER || process.env.DB_USER || process.env.MYSQL_USER;
  const password =
    process.env.ACCOUNT_DB_PASSWORD ||
    process.env.DB_PASSWORD ||
    process.env.MYSQL_PASSWORD ||
    '';
  const port = asPositiveInt(
    process.env.ACCOUNT_DB_PORT || process.env.DB_PORT || process.env.MYSQL_PORT,
    3306,
  );

  return {
    host: String(host || '').trim(),
    database: String(database || '').trim(),
    user: String(user || '').trim(),
    password: String(password),
    port,
  };
};

const buildMysqlUrl = settings => {
  if (!settings.host || !settings.database || !settings.user) {
    return '';
  }

  return `mysql://${encodeURIComponent(settings.user)}:${encodeURIComponent(settings.password)}@${settings.host}:${settings.port}/${settings.database}`;
};

const readAccountConfig = () => {
  const jwtSecret = String(process.env.JWT_SECRET || 'dev-jwt-secret-change-me').trim();
  const jwtExpiresIn = String(process.env.JWT_EXPIRES_IN || '7d').trim();
  const sqlitePath =
    process.env.SQLITE_DB_PATH || path.resolve(__dirname, '../../data/app.db');
  const mysql = readMysqlSettings();
  const requestedClient =
    process.env.ACCOUNT_DB_CLIENT ||
    (process.env.ACCOUNT_DATABASE_URL || mysql.host || mysql.database || mysql.user ? 'mysql' : '');
  const databaseClient = normalizeDbClient(requestedClient);
  const databaseUrl =
    process.env.ACCOUNT_DATABASE_URL || (databaseClient === 'mysql' ? buildMysqlUrl(mysql) : '');

  return {
    enabled: true,
    jwtSecret,
    jwtExpiresIn,
    databaseClient,
    databaseUrl,
    dbSsl: isDbSslEnabled(process.env.ACCOUNT_DB_SSL || process.env.DB_SSL),
    mysql,
    sqlitePath,
  };
};

module.exports = {
  readAccountConfig,
};
