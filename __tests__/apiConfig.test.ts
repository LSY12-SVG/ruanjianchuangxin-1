describe('apiConfig', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('prefers an explicit api base url override', () => {
    jest.isolateModules(() => {
      const apiConfig = require('../apiConfig');
      apiConfig.setApiBaseUrlOverride('http://192.168.0.10:3001/');

      expect(apiConfig.getApiBaseUrl()).toBe('http://192.168.0.10:3001');

      apiConfig.resetApiBaseUrlOverride();
    });
  });

  it('derives the backend host from the Metro script url when available', () => {
    jest.isolateModules(() => {
      const apiConfig = require('../apiConfig');
      expect(
        apiConfig.getApiBaseUrl({
          scriptURL:
            'http://192.168.31.5:8081/index.bundle?platform=android&dev=true&minify=false',
        }),
      ).toBe('http://192.168.31.5:3001');
    });
  });

  it('falls back to localhost when no override or Metro host is available', () => {
    jest.isolateModules(() => {
      const apiConfig = require('../apiConfig');
      expect(apiConfig.getApiBaseUrl({scriptURL: ''})).toBe('http://127.0.0.1:3001');
    });
  });
});
