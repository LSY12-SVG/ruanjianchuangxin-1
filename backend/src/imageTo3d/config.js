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

loadEnvFile(path.join(__dirname, '..', '..', '.env'));
loadEnvFile(path.join(__dirname, '..', '..', '.env.example'));

function readIntEnv(name, fallbackValue) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallbackValue;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  return Number.isNaN(parsedValue) ? fallbackValue : parsedValue;
}

function readStringEnv(name, fallbackValue) {
  const rawValue = process.env[name];
  if (rawValue == null || rawValue === '') {
    return fallbackValue;
  }

  return rawValue;
}

function readBooleanEnv(name, fallbackValue) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallbackValue;
  }

  if (rawValue === '1' || rawValue.toLowerCase() === 'true') {
    return true;
  }

  if (rawValue === '0' || rawValue.toLowerCase() === 'false') {
    return false;
  }

  return fallbackValue;
}

function normalizeBaseUrl(value) {
  if (!value) {
    return null;
  }

  return String(value).replace(/\/+$/, '');
}

module.exports = {
  host: readStringEnv('IMAGE_TO_3D_HOST', '0.0.0.0'),
  port: readIntEnv('IMAGE_TO_3D_PORT', 3001),
  publicBaseUrl: normalizeBaseUrl(process.env.IMAGE_TO_3D_PUBLIC_BASE_URL || ''),
  providerName: process.env.IMAGE_TO_3D_PROVIDER || 'mock',
  databasePath:
    process.env.IMAGE_TO_3D_DB_PATH ||
    path.join(__dirname, '..', '..', 'data', 'image-to-3d.db'),
  captureFramesDir:
    process.env.IMAGE_TO_3D_CAPTURE_DIR ||
    path.join(__dirname, '..', '..', 'data', 'capture-frames'),
  maxUploadBytes: readIntEnv('IMAGE_TO_3D_MAX_UPLOAD_BYTES', 10 * 1024 * 1024),
  pollAfterMs: readIntEnv('IMAGE_TO_3D_POLL_AFTER_MS', 5000),
  maxPollingWindowMs: readIntEnv('IMAGE_TO_3D_MAX_POLL_MS', 10 * 60 * 1000),
  resultTtlMs: readIntEnv('IMAGE_TO_3D_RESULT_TTL_MS', 24 * 60 * 60 * 1000),
  rateLimitWindowMs: readIntEnv('IMAGE_TO_3D_RATE_LIMIT_WINDOW_MS', 60 * 1000),
  rateLimitMaxRequests: readIntEnv('IMAGE_TO_3D_RATE_LIMIT_MAX', 20),
  tencentRegion: process.env.TENCENT_REGION || 'ap-guangzhou',
  tencentModel: process.env.TENCENT_HUNYUAN_3D_MODEL || '3.0',
  tencentVariant: (process.env.TENCENT_HUNYUAN_3D_VARIANT || 'rapid').toLowerCase(),
  tencentSecretId: process.env.TENCENT_SECRET_ID || '',
  tencentSecretKey: process.env.TENCENT_SECRET_KEY || '',
  tripoBaseUrl: process.env.TRIPO_BASE_URL || 'https://api.tripo3d.ai/v2/openapi',
  tripoApiKey: process.env.TRIPO_SECRET_KEY || process.env.TRIPO_API_KEY || '',
  tripoModelVersion: process.env.TRIPO_MODEL_VERSION || 'v3.0-20250812',
  tripoOutputFormat: (process.env.TRIPO_OUTPUT_FORMAT || 'glb').toLowerCase(),
  tripoTexture: readBooleanEnv('TRIPO_TEXTURE', true),
  tripoPbr: readBooleanEnv('TRIPO_PBR', false),
  mockResultUrl:
    process.env.MOCK_3D_MODEL_URL || 'https://modelviewer.dev/shared-assets/models/Astronaut.glb',
};
