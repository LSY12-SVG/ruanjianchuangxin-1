describe('modeling strict configuration', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {...ORIGINAL_ENV};
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('fails when provider is not tripo', async () => {
    process.env.IMAGE_TO_3D_PROVIDER = 'mock';
    const {createModelingModule} = require('../../backend/src/modules/modelingModule');
    await expect(createModelingModule()).rejects.toThrow(
      'IMAGE_TO_3D_PROVIDER must be set to tripo in strict mode.',
    );
  });

  it('fails when tripo secret key is missing', async () => {
    process.env.IMAGE_TO_3D_PROVIDER = 'tripo';
    process.env.TRIPO_BASE_URL = 'https://api.tripo3d.ai/v2/openapi';
    process.env.TRIPO_SECRET_KEY = '';
    process.env.TRIPO_API_KEY = '';
    const {createModelingModule} = require('../../backend/src/modules/modelingModule');
    await expect(createModelingModule()).rejects.toThrow('TRIPO_SECRET_KEY is required.');
  });
});
