describe('modules contract', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('modeling module exposes strict capabilities contract', async () => {
    jest.doMock('../../backend/src/imageTo3d/providers/tripoPrecheck', () => ({
      runTripoPrecheck: jest.fn(async () => ({ok: true, status: 404})),
    }));
    jest.doMock('../../backend/src/imageTo3d/module', () => {
      return {
        createImageTo3DModule: jest.fn(() => ({
          provider: {name: 'tripo'},
          config: {databasePath: 'db.sqlite', pollAfterMs: 5000},
          imageTo3DRouter: (_req, _res, next) => next(),
          captureRouter: (_req, _res, next) => next(),
          close: jest.fn(),
          handleError: jest.fn(),
        })),
      };
    });

    process.env.IMAGE_TO_3D_PROVIDER = 'tripo';
    process.env.TRIPO_BASE_URL = 'https://api.tripo3d.ai/v2/openapi';
    process.env.TRIPO_SECRET_KEY = 'fake';

    const {createModelingModule} = require('../../backend/src/modules/modelingModule');
    const moduleInstance = await createModelingModule();
    const capability = moduleInstance.capabilities();

    expect(capability).toMatchObject({
      module: 'modeling',
      enabled: true,
      strictMode: true,
      provider: 'tripo',
      auth: {
        required: false,
      },
    });
    expect(capability.endpoints).toEqual(
      expect.arrayContaining([
        'POST /v1/modules/modeling/jobs',
        'GET /v1/modules/modeling/jobs/:taskId',
        'GET /v1/modules/modeling/jobs/:taskId/assets/:assetIndex',
        'POST /v1/modules/modeling/capture-sessions',
        'GET /v1/modules/modeling/models/:modelId',
        'GET /v1/modules/modeling/health',
      ]),
    );
  });
});
