const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const {DatabaseSync} = require('node:sqlite');

const isSelectLike = text => /^\s*(select|pragma|with)\b/i.test(String(text || ''));

const createMysqlCommunityDb = ({databaseUrl, dbSsl}) => {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required when DB_CLIENT=mysql');
  }

  const pool = mysql.createPool({
    uri: databaseUrl,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true,
    ssl: dbSsl ? {rejectUnauthorized: false} : undefined,
  });

  const query = async (text, params = []) => {
    const [rows] = await pool.query(text, params);
    return rows;
  };

  const withTransaction = async executor => {
    const connection = await pool.getConnection();
    const client = {
      query: async (text, params = []) => {
        const [rows] = await connection.query(text, params);
        return rows;
      },
      exec: async text => {
        await connection.query(text);
      },
    };
    try {
      await connection.beginTransaction();
      const result = await executor(client);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  };

  return {
    dialect: 'mysql',
    pool,
    query,
    withTransaction,
    close: async () => {
      await pool.end();
    },
  };
};

const createSqliteCommunityDb = ({sqlitePath}) => {
  if (!sqlitePath) {
    throw new Error('SQLITE_PATH is required when DB_CLIENT=sqlite');
  }

  const dataDir = path.dirname(sqlitePath);
  fs.mkdirSync(dataDir, {recursive: true});
  const sqlite = new DatabaseSync(sqlitePath);
  sqlite.exec('PRAGMA foreign_keys = ON;');

  const executeSqlite = (text, params = []) => {
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

  const query = async (text, params = []) => executeSqlite(text, params);

  const withTransaction = async executor => {
    sqlite.exec('BEGIN');
    const client = {
      query: async (text, params = []) => executeSqlite(text, params),
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
    dialect: 'sqlite',
    pool: null,
    query,
    withTransaction,
    close: async () => {
      sqlite.close();
    },
  };
};

const createCommunityDb = config => {
  if (config.databaseClient === 'mysql') {
    return createMysqlCommunityDb(config);
  }
  return createSqliteCommunityDb(config);
};

module.exports = {
  createCommunityDb,
};
