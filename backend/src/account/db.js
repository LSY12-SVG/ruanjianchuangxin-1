const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const {DatabaseSync} = require('node:sqlite');

const isSelectLike = text => /^\s*(select|pragma|with)\b/i.test(String(text || ''));

const createMysqlAccountDb = async ({databaseUrl, dbSsl, mysql: mysqlConfig}) => {
  if (!databaseUrl) {
    throw new Error('ACCOUNT_DATABASE_URL is required when ACCOUNT_DB_CLIENT=mysql');
  }
  if (!mysqlConfig?.host || !mysqlConfig?.database || !mysqlConfig?.user) {
    throw new Error('ACCOUNT_DB_HOST, ACCOUNT_DB_NAME and ACCOUNT_DB_USER are required');
  }

  const bootstrapConnection = await mysql.createConnection({
    host: mysqlConfig.host,
    port: mysqlConfig.port,
    user: mysqlConfig.user,
    password: mysqlConfig.password,
    ssl: dbSsl ? {rejectUnauthorized: false} : undefined,
    multipleStatements: true,
  });
  try {
    await bootstrapConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${mysqlConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await bootstrapConnection.end();
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
    query,
    withTransaction,
    close: async () => {
      await pool.end();
    },
  };
};

const createSqliteAccountDb = sqlitePath => {
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
    dialect: 'sqlite',
    query,
    withTransaction,
    close: async () => {
      sqlite.close();
    },
  };
};

const createAccountDb = async config => {
  if (config?.databaseClient === 'mysql') {
    return createMysqlAccountDb(config);
  }
  return createSqliteAccountDb(config?.sqlitePath);
};

module.exports = {
  createAccountDb,
};
