const path = require('path');

const readAccountConfig = () => {
  const jwtSecret = String(process.env.JWT_SECRET || 'dev-jwt-secret-change-me').trim();
  const jwtExpiresIn = String(process.env.JWT_EXPIRES_IN || '7d').trim();
  const sqlitePath =
    process.env.SQLITE_DB_PATH || path.resolve(__dirname, '../../data/app.db');

  return {
    enabled: true,
    jwtSecret,
    jwtExpiresIn,
    sqlitePath,
  };
};

module.exports = {
  readAccountConfig,
};
