const { ai3d } = require('tencentcloud-sdk-nodejs');
const { ApiError } = require('../errors');

function getTencentMethodName(variant, phase) {
  if (variant === 'pro') {
    return phase === 'submit' ? 'SubmitHunyuanTo3DProJob' : 'QueryHunyuanTo3DProJob';
  }

  return phase === 'submit' ? 'SubmitHunyuanTo3DRapidJob' : 'QueryHunyuanTo3DRapidJob';
}

function buildSubmitPayload(variant, model, imageBuffer) {
  const payload = {
    ImageBase64: imageBuffer.toString('base64'),
  };

  if (variant === 'pro') {
    payload.Model = model;
  }

  return payload;
}

function createTencentAi3dProvider({ secretId, secretKey, region, model, variant = 'rapid' }) {
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

  const submitMethodName = getTencentMethodName(variant, 'submit');
  const queryMethodName = getTencentMethodName(variant, 'query');
  const submitMethod = client[submitMethodName];
  const queryMethod = client[queryMethodName];

  if (typeof submitMethod !== 'function' || typeof queryMethod !== 'function') {
    throw new ApiError(500, `Tencent AI3D SDK does not support the "${variant}" variant.`);
  }

  return {
    name: `tencent-ai3d-${variant}`,
    async submitJob({ imageBuffer }) {
      const response = await submitMethod.call(client, buildSubmitPayload(variant, model, imageBuffer));

      if (!response?.JobId) {
        throw new ApiError(502, 'Tencent AI3D did not return a job id.');
      }

      return { providerJobId: response.JobId };
    },
    async getJob({ providerJobId }) {
      const response = await queryMethod.call(client, {
        JobId: providerJobId,
      });

      return {
        rawStatus: response?.Status,
        errorCode: response?.ErrorCode,
        errorMessage: response?.ErrorMessage,
        files: response?.ResultFile3Ds || response?.ResultFiles || [],
      };
    },
  };
}

module.exports = {
  createTencentAi3dProvider,
  getTencentMethodName,
  buildSubmitPayload,
};
