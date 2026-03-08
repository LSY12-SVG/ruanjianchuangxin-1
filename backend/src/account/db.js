const fs = require('fs');
const path = require('path');
const {DatabaseSync} = require('node:sqlite');

const isSelectLike = text => /^\s*(select|pragma|with)\b/i.test(String(text || ''));

const createAccountDb = sqlitePath => {
  if (!sqlitePath) {
    throw new Error('SQLITE_DB_PATH is required');
  }
  const resolvedPath = path.resolve(sqlitePath);
  fs.mkdirSync(path.dirname(resolvedPath), {recursive: true});

  const sqlite = new DatabaseSync(resolvedPath);
  sqlite.exec('PRAGMA foreign_keys = ON;');

  const query = async (text, params = []) => {
    const statement = sqlite.prepare(text);
    if (isSelectLike(text)) {
      return statement.all(...params);
    }
    const result = statement.run(...params);
    return {
      insertId: Number(result.lastInsertRowid || 0),
      affectedRows: Number(result.changes || 0),
    };
  };

  const withTransaction = async executor => {
    sqlite.exec('BEGIN');
    const client = {
      query: async (text, params = []) => query(text, params),
      exec: async text => {
        sqlite.exec(text);
      },
    };
    try {
      const result = await executor(client);
      sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  };

  return {
    query,
    withTransaction,
    close: async () => {
      sqlite.close();
    },
  };
};

module.exports = {
  createAccountDb,
};
