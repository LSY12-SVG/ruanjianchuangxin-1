const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

const makeRecordKey = ({userId, namespace, key}) => `${userId}::${namespace}::${key}`;

const ensureDir = filePath => {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, {recursive: true});
};

const createAgentMemoryStore = ({filePath}) => {
  const resolvedPath = filePath || path.resolve(__dirname, '../data/agent-memory.json');
  ensureDir(resolvedPath);

  let state = {
    records: {},
  };

  if (fs.existsSync(resolvedPath)) {
    try {
      const raw = fs.readFileSync(resolvedPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.records && typeof parsed.records === 'object') {
        state = {
          records: parsed.records,
        };
      }
    } catch {
      state = {records: {}};
    }
  }

  const save = () => {
    fs.writeFileSync(resolvedPath, JSON.stringify(state, null, 2), 'utf8');
  };

  const cleanupExpired = () => {
    const now = Date.now();
    let dirty = false;
    for (const [recordKey, record] of Object.entries(state.records)) {
      if (record && typeof record.expiresAt === 'string' && Date.parse(record.expiresAt) <= now) {
        delete state.records[recordKey];
        dirty = true;
      }
    }
    if (dirty) {
      save();
    }
  };

  const upsert = ({userId, namespace, key, value, ttlSeconds}) => {
    cleanupExpired();
    const recordKey = makeRecordKey({userId, namespace, key});
    const now = new Date();
    const previous = state.records[recordKey];
    const version = Number(previous?.version || 0) + 1;
    const expiresAt = new Date(
      now.getTime() + Math.max(1, Number(ttlSeconds || DEFAULT_TTL_SECONDS)) * 1000,
    ).toISOString();
    state.records[recordKey] = {
      value,
      version,
      updatedAt: now.toISOString(),
      expiresAt,
    };
    save();
    return {
      key,
      version,
      updatedAt: state.records[recordKey].updatedAt,
    };
  };

  const query = ({userId, namespace, key}) => {
    cleanupExpired();
    const recordKey = makeRecordKey({userId, namespace, key});
    const record = state.records[recordKey];
    if (!record) {
      return {
        key,
        value: null,
        version: 0,
        updatedAt: null,
      };
    }
    return {
      key,
      value: record.value,
      version: Number(record.version || 0),
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
    };
  };

  return {
    upsert,
    query,
    cleanupExpired,
  };
};

module.exports = {
  createAgentMemoryStore,
};
