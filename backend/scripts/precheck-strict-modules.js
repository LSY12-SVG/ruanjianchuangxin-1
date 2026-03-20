/* eslint-disable no-console */
const path = require('path');
require('dotenv').config({path: path.resolve(__dirname, '../.env')});

const {fetchProviderModelIds} = require('../src/providers');
const {getAutoGradeModelConfig} = require('../src/autoGrade');
const {runTripoPrecheck} = require('../src/imageTo3d/providers/tripoPrecheck');

const ensure = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const main = async () => {
  ensure(String(process.env.MODEL_PROVIDER || '').trim(), 'MODEL_PROVIDER is required');
  ensure(String(process.env.MODEL_BASE_URL || '').trim(), 'MODEL_BASE_URL is required');
  ensure(String(process.env.MODEL_API_KEY || '').trim(), 'MODEL_API_KEY is required');

  const modelProbe = await fetchProviderModelIds({
    timeoutMs: Number(process.env.MODEL_LIST_TIMEOUT_MS || 6000),
  });
  ensure(modelProbe.ok, `MODEL_LIST_PROBE_FAILED:${modelProbe.error || 'unknown'}`);
  const remoteSet = new Set(modelProbe.modelIds || []);
  const modelConfig = getAutoGradeModelConfig();
  const requiredModels = [
    ...(Array.isArray(modelConfig.fastModelChain) ? modelConfig.fastModelChain : []),
    ...(Array.isArray(modelConfig.refineModelChain) ? modelConfig.refineModelChain : []),
  ]
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index);
  const missingModels = requiredModels.filter(modelId => !remoteSet.has(modelId));
  ensure(
    missingModels.length === 0,
    `MISSING_MODELS:${missingModels.join(',')}`,
  );

  const providerName = String(process.env.IMAGE_TO_3D_PROVIDER || '').trim().toLowerCase();
  ensure(providerName === 'tripo', 'IMAGE_TO_3D_PROVIDER must be tripo');

  const tripoCheck = await runTripoPrecheck({
    baseUrl: process.env.TRIPO_BASE_URL,
    apiKey: process.env.TRIPO_SECRET_KEY || process.env.TRIPO_API_KEY,
    timeoutMs: Number(process.env.TRIPO_PRECHECK_TIMEOUT_MS || 8000),
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        requiredModels,
        tripo: tripoCheck,
      },
      null,
      2,
    ),
  );
};

main().catch(error => {
  console.error('precheck_strict_failed:', error?.message || String(error));
  process.exit(1);
});
