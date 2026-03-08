const { createMockProvider } = require('./mockProvider');
const { createTencentAi3dProvider } = require('./tencentAi3dProvider');

function createProvider(config) {
  if (config.providerName === 'tencent') {
    return createTencentAi3dProvider({
      secretId: config.tencentSecretId,
      secretKey: config.tencentSecretKey,
      region: config.tencentRegion,
      model: config.tencentModel,
      variant: config.tencentVariant,
    });
  }

  return createMockProvider({
    resultUrl: config.mockResultUrl,
  });
}

module.exports = {
  createProvider,
};