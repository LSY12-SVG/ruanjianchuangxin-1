const express = require('express');
const multer = require('multer');
const {
  refreshModelHealth,
  getRuntimeSnapshot,
} = require('../colorIntelligence');
const {handleInterpret} = require('../colorIntelligence/services/interpretService');
const {handleAutoGrade} = require('../colorIntelligence/services/autoGradeService');
const {handleSegmentation} = require('../colorIntelligence/services/segmentationService');
const {transcribeWithProvider} = require('../providers');
const {sendError} = require('./errorResponse');

const MODULE_NAME = 'color';
const BASE_PATH = '/v1/modules/color';

const requiredEnv = [
  'MODEL_PROVIDER',
  'MODEL_BASE_URL',
  'MODEL_API_KEY',
  'MODEL_PRIMARY_NAME',
  'MODEL_REFINE_NAME',
];

const readBooleanEnv = (name, fallback) => {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') {
    return true;
  }
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') {
    return false;
  }
  return false;
};

const initialSuggestStrictMode = readBooleanEnv('COLOR_INITIAL_STRICT_MODE', false);
const voiceStrictMode = readBooleanEnv('COLOR_VOICE_STRICT_MODE', false);
const autoGradeStrictMode = readBooleanEnv('COLOR_AUTOGRADE_STRICT_MODE', true);

const readAsrMaxUploadBytes = () => {
  const raw = Number(process.env.ASR_MAX_UPLOAD_BYTES || 8 * 1024 * 1024);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 8 * 1024 * 1024;
};

const mapAsrProviderError = error => {
  const code = String(error?.code || '').toUpperCase();
  if (code === 'TIMEOUT') {
    return {status: 504, code: 'ASR_TIMEOUT'};
  }
  if (code === 'MODEL_UNAVAILABLE') {
    return {status: 503, code: 'ASR_MODEL_UNAVAILABLE'};
  }
  if (code === 'BAD_AUDIO' || code === 'HTTP_400' || code === 'HTTP_422') {
    return {status: 400, code: 'ASR_BAD_AUDIO'};
  }
  if (code === 'MISCONFIG') {
    return {status: 500, code: 'ASR_MISCONFIG'};
  }
  return {status: 502, code: 'ASR_NETWORK_ERROR'};
};

const capabilities = () => ({
  module: MODULE_NAME,
  enabled: true,
  strictMode: initialSuggestStrictMode,
  provider: String(process.env.MODEL_PROVIDER || 'openai_compat'),
  requiredEnv,
  strictFlags: {
    initialSuggest: initialSuggestStrictMode,
    voiceRefine: voiceStrictMode,
    autoGrade: autoGradeStrictMode,
  },
  auth: {
    required: false,
    scopes: [],
  },
  endpoints: [
    'POST /v1/modules/color/initial-suggest',
    'POST /v1/modules/color/voice-refine',
    'POST /v1/modules/color/voice-transcribe',
    'POST /v1/modules/color/pro/auto-grade',
    'POST /v1/modules/color/pro/segment',
    'GET /v1/modules/color/health',
  ],
});

const healthCheck = () => {
  const snapshot = getRuntimeSnapshot();
  return {
    module: MODULE_NAME,
    ok: Boolean(snapshot.refineModelReady),
    strictMode: initialSuggestStrictMode,
    strictFlags: {
      initialSuggest: initialSuggestStrictMode,
      voiceRefine: voiceStrictMode,
      autoGrade: autoGradeStrictMode,
    },
    provider: String(process.env.MODEL_PROVIDER || 'openai_compat'),
    refineModelReady: Boolean(snapshot.refineModelReady),
    missingModelIds: Array.isArray(snapshot.missingModelIds) ? snapshot.missingModelIds : [],
    modelCheckError: snapshot.modelCheckError || '',
    lastCheckedAt: snapshot.lastCheckedAt || null,
  };
};

const createColorModule = () => {
  const router = express.Router();
  const asrMaxUploadBytes = readAsrMaxUploadBytes();
  const handleVoiceUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: asrMaxUploadBytes,
    },
  }).single('audio');

  router.post('/initial-suggest', async (req, res) => {
    const result = await handleInterpret(
      {
        ...req.body,
        mode: 'initial_visual_suggest',
      },
      {
        strictMode: initialSuggestStrictMode,
        responseShape: 'module',
        forceMode: 'initial_visual_suggest',
      },
    );
    if (result.status !== 200) {
      const errorPayload = result.payload?.error || {};
      sendError(
        res,
        result.status,
        errorPayload.code || 'REAL_MODEL_REQUIRED',
        errorPayload.message || 'Strict mode requires real model output.',
        errorPayload.details,
      );
      return;
    }
    res.status(200).json(result.payload);
  });

  router.post('/voice-refine', async (req, res) => {
    const result = await handleInterpret(
      {
        ...req.body,
        mode: 'voice_refine',
      },
      {strictMode: voiceStrictMode, responseShape: 'module', forceMode: 'voice_refine'},
    );
    if (result.status !== 200) {
      const errorPayload = result.payload?.error || {};
      sendError(
        res,
        result.status,
        errorPayload.code || 'REAL_MODEL_REQUIRED',
        errorPayload.message || 'Strict mode requires real model output.',
        errorPayload.details,
      );
      return;
    }
    res.status(200).json(result.payload);
  });

  router.post('/voice-transcribe', (req, res) => {
    handleVoiceUpload(req, res, async uploadError => {
      if (uploadError) {
        if (uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE') {
          sendError(
            res,
            413,
            'ASR_BAD_AUDIO',
            '音频文件过大，请压缩后重试。',
            {maxUploadBytes: asrMaxUploadBytes},
          );
          return;
        }
        sendError(res, 400, 'ASR_BAD_AUDIO', uploadError.message || '音频上传失败。');
        return;
      }

      const file = req.file;
      if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
        sendError(res, 400, 'ASR_BAD_AUDIO', '未检测到有效音频文件。');
        return;
      }

      const requestId = `asr_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
      const startedAt = Date.now();
      try {
        const result = await transcribeWithProvider({
          buffer: file.buffer,
          mimeType: file.mimetype || 'audio/mp4',
          fileName: file.originalname || 'voice.m4a',
          language:
            typeof req.body?.locale === 'string' && req.body.locale.trim()
              ? req.body.locale.trim()
              : 'zh-CN',
        });

        const transcript = String(result?.transcript || '').trim();
        console.log(
          '[voice-transcribe]',
          JSON.stringify({
            requestId,
            ok: true,
            latencyMs: Date.now() - startedAt,
            size: file.size || file.buffer.length,
          }),
        );

        res.status(200).json({
          transcript,
          language: typeof result?.language === 'string' ? result.language : undefined,
          durationMs:
            typeof result?.durationMs === 'number' ? Number(result.durationMs) : undefined,
          requestId,
        });
      } catch (error) {
        const mapped = mapAsrProviderError(error);
        console.warn(
          '[voice-transcribe]',
          JSON.stringify({
            requestId,
            ok: false,
            latencyMs: Date.now() - startedAt,
            code: mapped.code,
            providerCode: String(error?.code || ''),
          }),
        );
        sendError(
          res,
          mapped.status,
          mapped.code,
          String(error?.message || '语音转写失败。'),
          {requestId},
        );
      }
    });
  });

  router.post('/pro/auto-grade', async (req, res) => {
    const result = await handleAutoGrade(req.body, getRuntimeSnapshot(), {
      strictMode: autoGradeStrictMode,
      responseShape: 'module',
    });
    if (result.status !== 200) {
      const errorPayload = result.payload?.error || {};
      sendError(
        res,
        result.status,
        errorPayload.code || 'REAL_MODEL_REQUIRED',
        errorPayload.message || 'Strict mode requires real model output.',
        errorPayload.details,
      );
      return;
    }
    res.status(200).json(result.payload);
  });

  router.post('/pro/segment', (req, res) => {
    const result = handleSegmentation(req.body);
    if (result.status !== 200) {
      sendError(res, result.status, 'SEGMENTATION_FAILED', result.payload?.error || 'segmentation_failed');
      return;
    }
    res.status(200).json(result.payload);
  });

  router.get('/health', (_req, res) => {
    const status = healthCheck();
    res.status(status.ok ? 200 : 503).json(status);
  });

  return {
    module: MODULE_NAME,
    basePath: BASE_PATH,
    router,
    async healthCheck() {
      return healthCheck();
    },
    capabilities,
    async init() {
      await refreshModelHealth();
      const snapshot = getRuntimeSnapshot();
      if (!snapshot.refineModelReady) {
        const reason = snapshot.modelCheckError || 'model_check_failed';
        throw new Error(
          `Color module strict startup check failed: ${reason}${
            Array.isArray(snapshot.missingModelIds) && snapshot.missingModelIds.length
              ? ` (missing: ${snapshot.missingModelIds.join(',')})`
              : ''
          }`,
        );
      }
    },
    close() {},
  };
};

module.exports = {
  createColorModule,
};
