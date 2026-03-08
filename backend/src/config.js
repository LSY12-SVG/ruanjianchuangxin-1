const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(__dirname, '..', '.env'));
loadEnvFile(path.join(__dirname, '..', '.env.example'));

function readIntEnv(name, fallbackValue) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallbackValue;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  return Number.isNaN(parsedValue) ? fallbackValue : parsedValue;
}

module.exports = {
  port: readIntEnv('IMAGE_TO_3D_PORT', 3001),
  providerName: process.env.IMAGE_TO_3D_PROVIDER || 'mock',
  databasePath:
    process.env.IMAGE_TO_3D_DB_PATH || path.join(__dirname, '..', 'data', 'image-to-3d.db'),
  maxUploadBytes: readIntEnv('IMAGE_TO_3D_MAX_UPLOAD_BYTES', 6 * 1024 * 1024),
  pollAfterMs: readIntEnv('IMAGE_TO_3D_POLL_AFTER_MS', 5000),
  maxPollingWindowMs: readIntEnv('IMAGE_TO_3D_MAX_POLL_MS', 10 * 60 * 1000),
  resultTtlMs: readIntEnv('IMAGE_TO_3D_RESULT_TTL_MS', 24 * 60 * 60 * 1000),
  rateLimitWindowMs: readIntEnv('IMAGE_TO_3D_RATE_LIMIT_WINDOW_MS', 60 * 1000),
  rateLimitMaxRequests: readIntEnv('IMAGE_TO_3D_RATE_LIMIT_MAX', 20),
  tencentRegion: process.env.TENCENT_REGION || 'ap-guangzhou',
  tencentModel: process.env.TENCENT_HUNYUAN_3D_MODEL || '3.0',
  tencentSecretId: process.env.TENCENT_SECRET_ID || '',
  tencentSecretKey: process.env.TENCENT_SECRET_KEY || '',
  mockResultUrl:
    process.env.MOCK_3D_MODEL_URL || 'https://modelviewer.dev/shared-assets/models/Astronaut.glb',
};
