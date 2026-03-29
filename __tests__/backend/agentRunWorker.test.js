const {createAgentRunWorker} = require('../../backend/src/agentRunWorker');

describe('agent run worker', () => {
  test('deduplicates queued run ids and processes once per scan', async () => {
    const listRunnableRuns = jest.fn(() => [{runId: 'run-1'}, {runId: 'run-1'}]);
    const processRun = jest.fn(async () => true);
    const worker = createAgentRunWorker({
      intervalMs: 10000,
      listRunnableRuns,
      processRun,
    });

    await worker.scan();

    expect(listRunnableRuns).toHaveBeenCalledTimes(1);
    expect(processRun).toHaveBeenCalledTimes(1);
    expect(processRun).toHaveBeenCalledWith('run-1');
  });

  test('applies retry backoff on process error', async () => {
    const listRunnableRuns = jest.fn(() => [{runId: 'run-1'}]);
    const processRun = jest.fn(async () => {
      throw new Error('boom');
    });
    const onError = jest.fn();
    const worker = createAgentRunWorker({
      intervalMs: 10000,
      listRunnableRuns,
      processRun,
      onError,
    });

    await worker.scan();

    const snapshot = worker.getSnapshot();
    expect(snapshot.processError).toBe(1);
    expect(snapshot.retryBackoffCount).toBe(1);
    expect(onError).toHaveBeenCalled();
  });

  test('start/stop manage timer lifecycle', () => {
    jest.useFakeTimers();
    try {
      const worker = createAgentRunWorker({
        listRunnableRuns: () => [],
        processRun: async () => true,
      });
      worker.start();
      jest.advanceTimersByTime(1600);
      worker.stop();
      const snapshot = worker.getSnapshot();
      expect(snapshot.processing).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
