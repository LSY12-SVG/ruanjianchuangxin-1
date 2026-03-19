const { createMockProvider } = require('./mockProvider');
const { createTencentAi3dProvider } = require('./tencentAi3dProvider');
const { createTripoProvider } = require('./tripoProvider');
const { assertProviderContract } = require('./providerContract');

function createProvider(config) {
  if (config.providerName === 'tencent') {
    return assertProviderContract(
      createTencentAi3dProvider({
        secretId: config.tencentSecretId,
        secretKey: config.tencentSecretKey,
        region: config.tencentRegion,
        model: config.tencentModel,
        variant: config.tencentVariant,
      }),
    );
  }

  if (config.providerName === 'tripo') {
    return assertProviderContract(
      createTripoProvider({
        apiKey: config.tripoApiKey,
        baseUrl: config.tripoBaseUrl,
        modelVersion: config.tripoModelVersion,
        outputFormat: config.tripoOutputFormat,
        texture: config.tripoTexture,
        pbr: config.tripoPbr,
      }),
    );
  }

  return assertProviderContract(
    createMockProvider({
      resultUrl: config.mockResultUrl,
    }),
  );
}

module.exports = {
  createProvider,
};
