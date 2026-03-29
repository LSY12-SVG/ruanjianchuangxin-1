const createAgentRunWorker = ({
  intervalMs = 4000,
  listRunnableRuns = () => [],
  processRun = async () => {},
  onError = () => {},
} = {}) => {
  const pendingRunIds = new Set();
  const backoffByRunId = new Map();
  let timer = null;
  let processing = false;
  let scanCount = 0;
  let dequeueCount = 0;
  let processSuccess = 0;
  let processError = 0;
  let retryBackoffCount = 0;

  const now = () => Date.now();

  const shouldScheduleRun = runId => {
    const state = backoffByRunId.get(runId);
    if (!state) {
      return true;
    }
    return state.nextRetryAt <= now();
  };

  const markRunFailure = runId => {
    const previous = backoffByRunId.get(runId) || {attempts: 0, nextRetryAt: 0};
    const attempts = previous.attempts + 1;
    const delayMs = Math.min(30000, 2000 * 2 ** Math.max(0, attempts - 1));
    backoffByRunId.set(runId, {
      attempts,
      nextRetryAt: now() + delayMs,
    });
    retryBackoffCount += 1;
    return delayMs;
  };

  const clearRunBackoff = runId => {
    backoffByRunId.delete(runId);
  };

  const drainQueue = async () => {
    if (processing) {
      return;
    }
    processing = true;
    try {
      while (pendingRunIds.size > 0) {
        const runId = pendingRunIds.values().next().value;
        pendingRunIds.delete(runId);
        dequeueCount += 1;
        try {
          const changed = await processRun(runId);
          if (changed) {
            processSuccess += 1;
            clearRunBackoff(runId);
          }
        } catch (error) {
          processError += 1;
          const delayMs = markRunFailure(runId);
          onError(error, runId, delayMs);
        }
      }
    } finally {
      processing = false;
    }
  };

  const scan = async () => {
    scanCount += 1;
    const runs = await Promise.resolve(listRunnableRuns());
    for (const record of Array.isArray(runs) ? runs : []) {
      const runId = String(record?.runId || '').trim();
      if (!runId) {
        continue;
      }
      if (!shouldScheduleRun(runId)) {
        continue;
      }
      pendingRunIds.add(runId);
    }
    await drainQueue();
  };

  const start = () => {
    if (timer) {
      return;
    }
    timer = setInterval(() => {
      scan().catch(error => onError(error, 'scan', 0));
    }, Math.max(1500, Number(intervalMs) || 4000));
    if (typeof timer?.unref === 'function') {
      timer.unref();
    }
  };

  const stop = () => {
    if (!timer) {
      return;
    }
    clearInterval(timer);
    timer = null;
  };

  const getSnapshot = () => ({
    queueDepth: pendingRunIds.size,
    processing,
    scanCount,
    dequeueCount,
    processSuccess,
    processError,
    retryBackoffCount,
  });

  return {
    start,
    stop,
    scan,
    getSnapshot,
  };
};

module.exports = {
  createAgentRunWorker,
};
