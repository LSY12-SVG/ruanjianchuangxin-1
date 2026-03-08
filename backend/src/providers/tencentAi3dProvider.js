const { ai3d } = require('tencentcloud-sdk-nodejs');
const { ApiError } = require('../errors');

function createTencentAi3dProvider({ secretId, secretKey, region, model }) {
  if (!secretId || !secretKey) {
    throw new ApiError(500, 'Tencent provider is selected but credentials are missing.');
  }

  const client = new ai3d.v20250513.Client({
    credential: {
      secretId,
      secretKey,
    },
    region,
    profile: {
      httpProfile: {
        endpoint: 'ai3d.tencentcloudapi.com',
      },
    },
  });

  return {
    name: 'tencent-ai3d',
    async submitJob({ imageBuffer }) {
      const response = await client.SubmitHunyuanTo3DProJob({
        Model: model,
        ImageBase64: imageBuffer.toString('base64'),
      });

      if (!response?.JobId) {
        throw new ApiError(502, 'Tencent AI3D did not return a job id.');
      }

      return { providerJobId: response.JobId };
    },
    async getJob({ providerJobId }) {
      const response = await client.QueryHunyuanTo3DProJob({
        JobId: providerJobId,
      });

      return {
        rawStatus: response?.Status,
        errorCode: response?.ErrorCode,
        errorMessage: response?.ErrorMessage,
        files: response?.ResultFile3Ds || [],
      };
    },
  };
}

module.exports = {
  createTencentAi3dProvider,
};
