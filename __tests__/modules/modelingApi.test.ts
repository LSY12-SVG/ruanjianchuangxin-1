import {modelingApi} from '../../src/modules/api/modeling';

jest.mock('../../src/modules/api/http', () => ({
  requestApi: jest.fn(async () => ({})),
}));

const {requestApi} = jest.requireMock('../../src/modules/api/http') as {
  requestApi: jest.Mock;
};

describe('modelingApi timeout policy', () => {
  beforeEach(() => {
    requestApi.mockClear();
    requestApi.mockResolvedValue({});
  });

  it('uses long timeout for submit endpoints', async () => {
    await modelingApi.createJob({uri: 'file:///tmp/job.jpg'});
    expect(requestApi).toHaveBeenCalledWith(
      '/v1/modules/modeling/jobs',
      expect.objectContaining({
        method: 'POST',
        timeoutMs: 180000,
      }),
    );

    await modelingApi.uploadCaptureFrame('session-1', {
      uri: 'file:///tmp/frame.jpg',
      angleTag: 'front',
    });
    expect(requestApi).toHaveBeenCalledWith(
      '/v1/modules/modeling/capture-sessions/session-1/frames',
      expect.objectContaining({
        method: 'POST',
        timeoutMs: 180000,
      }),
    );

    await modelingApi.generateCapture('session-1');
    expect(requestApi).toHaveBeenCalledWith(
      '/v1/modules/modeling/capture-sessions/session-1/generate',
      expect.objectContaining({
        method: 'POST',
        timeoutMs: 180000,
      }),
    );
  });

  it('uses medium timeout for query endpoints', async () => {
    await modelingApi.getJob('task-1');
    expect(requestApi).toHaveBeenCalledWith(
      '/v1/modules/modeling/jobs/task-1',
      expect.objectContaining({
        timeoutMs: 30000,
      }),
    );

    await modelingApi.createCaptureSession();
    expect(requestApi).toHaveBeenCalledWith(
      '/v1/modules/modeling/capture-sessions',
      expect.objectContaining({
        method: 'POST',
        timeoutMs: 30000,
      }),
    );

    await modelingApi.getCaptureSession('session-1');
    expect(requestApi).toHaveBeenCalledWith(
      '/v1/modules/modeling/capture-sessions/session-1',
      expect.objectContaining({
        timeoutMs: 30000,
      }),
    );

    await modelingApi.getModelAsset('model-1');
    expect(requestApi).toHaveBeenCalledWith(
      '/v1/modules/modeling/models/model-1',
      expect.objectContaining({
        timeoutMs: 30000,
      }),
    );
  });
});
