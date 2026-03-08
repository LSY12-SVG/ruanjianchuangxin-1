const path = require('path');

const asPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const isDbSslEnabled = () => String(process.env.DB_SSL || '').toLowerCase() === 'true';
const normalizeDbClient = value => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'mysql') {
    return 'mysql';
  }
  return 'sqlite';
};

const buildDatabaseUrlFromParts = () => {
  const host = process.env.DB_HOST || process.env.MYSQL_HOST;
  const dbName = process.env.DB_NAME || process.env.MYSQL_DATABASE;
  const user = process.env.DB_USER || process.env.MYSQL_USER;
  const password = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '';
  const portRaw = process.env.DB_PORT || process.env.MYSQL_PORT || '3306';
  const port = Number(portRaw);

  if (!host || !dbName || !user || !Number.isFinite(port) || port <= 0) {
    return '';
  }

  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${Math.floor(port)}/${dbName}`;
};

const readCommunityConfig = () => {
  const pageSizeDefault = asPositiveInt(process.env.COMMUNITY_PAGE_SIZE_DEFAULT, 10);
  const pageSizeMax = asPositiveInt(process.env.COMMUNITY_PAGE_SIZE_MAX, 30);
  const databaseClient = normalizeDbClient(process.env.DB_CLIENT);
  const sqlitePathRaw = process.env.SQLITE_PATH || './data/community.sqlite';
  const sqlitePath = path.isAbsolute(sqlitePathRaw)
    ? sqlitePathRaw
    : path.resolve(__dirname, '../../', sqlitePathRaw);
  const databaseUrl =
    process.env.DATABASE_URL ||
    (databaseClient === 'mysql'
      ? buildDatabaseUrlFromParts()
      : `sqlite://${sqlitePath}`);
  return {
    databaseClient,
    databaseUrl,
    sqlitePath,
    dbSsl: isDbSslEnabled(),
    enabled: String(process.env.COMMUNITY_ENABLE || 'true').toLowerCase() !== 'false',
    pageSizeDefault: Math.min(pageSizeDefault, pageSizeMax),
    pageSizeMax,
  };
};

module.exports = {
  readCommunityConfig,
};
