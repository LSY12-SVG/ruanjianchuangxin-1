const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

const ensureDir = filePath => {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, {recursive: true});
};

const clone = value => JSON.parse(JSON.stringify(value));

const createAgentRunStore = ({filePath, ttlMs = DEFAULT_TTL_MS} = {}) => {
  const resolvedPath = filePath || path.resolve(__dirname, '../data/agent-runs.json');
  ensureDir(resolvedPath);

  let state = {
    runs: {},
  };

  if (fs.existsSync(resolvedPath)) {
    try {
      const raw = fs.readFileSync(resolvedPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.runs && typeof parsed.runs === 'object') {
        state = {
          runs: parsed.runs,
        };
      }
    } catch {
      state = {runs: {}};
    }
  }

  const save = () => {
    fs.writeFileSync(resolvedPath, JSON.stringify(state, null, 2), 'utf8');
  };

  const cleanupExpired = () => {
    const now = Date.now();
    let dirty = false;
    for (const [runId, record] of Object.entries(state.runs)) {
      const updatedAtMs = Date.parse(record?.updatedAt || '') || 0;
      if (!updatedAtMs || updatedAtMs + ttlMs <= now) {
        delete state.runs[runId];
        dirty = true;
      }
    }
    if (dirty) {
      save();
    }
  };

  const normalizeHistoryEntry = entry => {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    const createdAt =
      typeof entry.createdAt === 'string' && entry.createdAt.trim()
        ? entry.createdAt.trim()
        : new Date().toISOString();
    return {
      id:
        typeof entry.id === 'string' && entry.id.trim()
          ? entry.id.trim()
          : `evt_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      type: typeof entry.type === 'string' && entry.type.trim() ? entry.type.trim() : 'updated',
      status: typeof entry.status === 'string' && entry.status.trim() ? entry.status.trim() : '',
      message: typeof entry.message === 'string' ? entry.message : '',
      details:
        entry.details && typeof entry.details === 'object' ? clone(entry.details) : undefined,
      createdAt,
    };
  };

  const upsert = (record, options = {}) => {
    cleanupExpired();
    const runId = String(record?.runId || '').trim();
    if (!runId) {
      throw new Error('runId_required');
    }
    const now = new Date().toISOString();
    const previous = state.runs[runId];
    const previousHistory = Array.isArray(previous?.history) ? previous.history.map(clone) : [];
    const nextEvent = normalizeHistoryEntry(options.event);
    state.runs[runId] = {
      ...clone(record),
      createdAt: previous?.createdAt || now,
      updatedAt: now,
      history: nextEvent ? [...previousHistory, nextEvent] : previousHistory,
    };
    save();
    return clone(state.runs[runId]);
  };

  const get = runId => {
    cleanupExpired();
    const normalizedRunId = String(runId || '').trim();
    if (!normalizedRunId || !state.runs[normalizedRunId]) {
      return null;
    }
    return clone(state.runs[normalizedRunId]);
  };

  const remove = runId => {
    const normalizedRunId = String(runId || '').trim();
    if (!normalizedRunId || !state.runs[normalizedRunId]) {
      return false;
    }
    delete state.runs[normalizedRunId];
    save();
    return true;
  };

  const getHistory = runId => {
    const record = get(runId);
    return Array.isArray(record?.history) ? record.history : [];
  };

  const listByStatuses = statuses => {
    cleanupExpired();
    const normalizedStatuses = new Set(
      (Array.isArray(statuses) ? statuses : [])
        .map(item => String(item || '').trim())
        .filter(Boolean),
    );
    return Object.values(state.runs)
      .filter(record => {
        if (normalizedStatuses.size === 0) {
          return true;
        }
        const status = String(record?.latestExecuteResult?.workflowRun?.status || '').trim();
        return normalizedStatuses.has(status);
      })
      .map(clone);
  };

  return {
    upsert,
    get,
    getHistory,
    listByStatuses,
    remove,
    cleanupExpired,
  };
};

module.exports = {
  createAgentRunStore,
};
