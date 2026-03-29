const {readFile} = require('node:fs/promises');
const {Buffer} = require('node:buffer');

const SYSTEM_PROMPT = [
  '你是移动端图片智能调色解析器。',
  '任务：基于图片和语音需求输出调色动作 JSON，不能输出任何额外文本。',
  'mode=initial_visual_suggest 时：不依赖 transcript，从图像内容直接给出首轮建议。',
  'mode=voice_refine 时：基于 currentParams 和 transcript 做增量修改。',
  '只允许动作 action: set_param | adjust_param | apply_style | reset。',
  '只允许 target: exposure | brightness | contrast | highlights | shadows | whites | blacks | temperature | tint | vibrance | saturation | redBalance | greenBalance | blueBalance | curve_master | curve_r | curve_g | curve_b | wheel_shadows | wheel_midtones | wheel_highlights | style。',
  'apply_style 时必须提供 style，候选 style: cinematic_cool | cinematic_warm | portrait_clean | vintage_fade | moody_dark | fresh_bright。',
  '范围要求：exposure 在 -2 到 2；基础参数在 -100 到 100；curve_* 在 -100 到 100（用于曲线强度）；wheel_* 在 -100 到 100（用于该段色轮强度）。',
  '你必须先诊断图像问题（过曝、欠曝、偏色、灰雾、肤色风险等）再给动作。',
  '人像时避免过饱和和过强偏色，保护肤色自然。',
  '必须输出合法 JSON，禁止输出解释性文本或 markdown。',
  '若目标参数超范围，必须裁剪后再输出。',
  'set_param 用 value，adjust_param 用 delta。',
  '返回字段必须包含: actions, confidence, reasoning_summary, fallback_used, needsConfirmation, message, source, analysis_summary, applied_profile。',
  '并尽量补充: scene_profile, scene_confidence, quality_risk_flags(数组), recommended_intensity(soft|normal|strong)。',
].join('\n');

const INITIAL_VISUAL_PROMPT = [
  'Analyze this photo for first-pass mobile color grading.',
  'Return JSON only with keys: scene, style, intensity, confidence, analysis, risks, adjustments.',
  'style: cinematic_cool|cinematic_warm|portrait_clean|vintage_fade|moody_dark|fresh_bright.',
  'intensity: soft|normal|strong.',
  'adjustments: object with numeric deltas using only exposure, brightness, contrast, highlights, shadows, whites, blacks, temperature, tint, vibrance, saturation.',
  'Keep adjustments safe and concise. Keep portrait skin natural. No markdown.',
].join('\n');

const requestWithTimeout = async (url, options, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const parseJsonSafe = text => {
  try {
    return JSON.parse(text);
  } catch (error) {
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    }
    throw error;
  }
};

const createProviderError = (message, code, status) => {
  const error = new Error(message);
  error.code = code;
  if (typeof status === 'number') {
    error.status = status;
  }
  return error;
};

const extractErrorMessage = payload => {
  const direct = payload?.error?.message;
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }
  if (typeof payload?.message === 'string' && payload.message.trim()) {
    return payload.message.trim();
  }
  return '';
};

const classifyBadRequestCode = message => {
  const lowered = String(message || '').toLowerCase();
  if (
    lowered.includes('model') &&
    (lowered.includes('not found') ||
      lowered.includes('does not exist') ||
      lowered.includes('invalid'))
  ) {
    return 'MODEL_UNAVAILABLE';
  }
  if (
    lowered.includes('response_format') ||
    lowered.includes('json_object') ||
    lowered.includes('json mode')
  ) {
    return 'UNSUPPORTED_RESPONSE_FORMAT';
  }
  return 'HTTP_400';
};

const pickDefined = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
};

const normalizeInterpretPayload = (payload, mode) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  const normalized = {
    ...payload,
    fallback_used: false,
    needsConfirmation:
      typeof payload.needsConfirmation === 'boolean' ? payload.needsConfirmation : false,
    source: payload.source === 'fallback' ? 'fallback' : 'cloud',
  };

  const inferredRiskFlags = Array.isArray(payload.quality_risk_flags)
    ? payload.quality_risk_flags
    : Array.isArray(payload.qualityRiskFlags)
      ? payload.qualityRiskFlags
      : Array.isArray(payload.risks)
        ? payload.risks
        : typeof payload.risks === 'string' && payload.risks.trim()
          ? payload.risks
              .split(/[;,，。]/)
              .map(item => item.trim())
              .filter(Boolean)
        : [];
  if (!normalized.quality_risk_flags && inferredRiskFlags.length > 0) {
    normalized.quality_risk_flags = inferredRiskFlags;
  }

  const inferredProfile = pickDefined(
    payload.applied_profile,
    payload.appliedProfile,
    payload.style,
    payload.scene_profile,
    payload.sceneProfile,
  );
  if (!normalized.applied_profile && typeof inferredProfile === 'string') {
    normalized.applied_profile = inferredProfile;
  }

  const inferredSceneProfile = pickDefined(payload.scene_profile, payload.sceneProfile, payload.scene);
  if (!normalized.scene_profile && typeof inferredSceneProfile === 'string') {
    normalized.scene_profile = inferredSceneProfile;
  }

  const inferredSceneConfidence = pickDefined(
    payload.scene_confidence,
    payload.sceneConfidence,
    payload.confidence,
  );
  if (
    normalized.scene_confidence === undefined &&
    typeof inferredSceneConfidence === 'number' &&
    Number.isFinite(inferredSceneConfidence)
  ) {
    normalized.scene_confidence = inferredSceneConfidence;
  }

  const inferredAnalysisSummary = pickDefined(
    payload.analysis_summary,
    payload.analysisSummary,
    payload.analysis,
  );
  if (!normalized.analysis_summary && typeof inferredAnalysisSummary === 'string') {
    normalized.analysis_summary = inferredAnalysisSummary;
  }

  const inferredReasoningSummary = pickDefined(
    payload.reasoning_summary,
    payload.reasoningSummary,
    payload.reasoning,
  );
  if (!normalized.reasoning_summary && typeof inferredReasoningSummary === 'string') {
    normalized.reasoning_summary = inferredReasoningSummary;
  }

  const inferredMessage = pickDefined(payload.message, payload.summary);
  if (!normalized.message && typeof inferredMessage === 'string') {
    normalized.message = inferredMessage;
  }

  if (
    mode === 'initial_visual_suggest' &&
    !Array.isArray(normalized.actions) &&
    Array.isArray(payload.suggestions)
  ) {
    normalized.actions = payload.suggestions;
  }

  if (
    mode === 'initial_visual_suggest' &&
    !Array.isArray(normalized.actions) &&
    payload.adjustments &&
    typeof payload.adjustments === 'object' &&
    !Array.isArray(payload.adjustments)
  ) {
    const adjustmentActions = Object.entries(payload.adjustments)
      .map(([target, delta]) => {
        const numericDelta = Number(delta);
        if (!Number.isFinite(numericDelta) || numericDelta === 0) {
          return null;
        }
        return {
          action: 'adjust_param',
          target,
          delta: numericDelta,
        };
      })
      .filter(Boolean);

    normalized.actions = adjustmentActions;
  }

  if (
    mode === 'initial_visual_suggest' &&
    typeof payload.style === 'string' &&
    payload.style.trim()
  ) {
    const styleAction = {
      action: 'apply_style',
      target: 'style',
      style: payload.style.trim(),
      strength: 1,
    };
    normalized.actions = Array.isArray(normalized.actions)
      ? [styleAction, ...normalized.actions]
      : [styleAction];
  }

  if (
    mode === 'initial_visual_suggest' &&
    !normalized.message &&
    typeof normalized.analysis_summary === 'string' &&
    normalized.analysis_summary.trim()
  ) {
      normalized.message = '已获得云端首轮调色建议';
  }

  if (mode === 'initial_visual_suggest') {
    const inferredIntensity = pickDefined(
      payload.recommended_intensity,
      payload.recommendedIntensity,
      payload.intensity,
    );
    if (!normalized.recommended_intensity && typeof inferredIntensity === 'string') {
      normalized.recommended_intensity = inferredIntensity;
    }
  }

  return normalized;
};

const interpretWithOpenAICompat = async (request, options = {}) => {
  const apiKey = process.env.MODEL_API_KEY;
  const baseUrl = process.env.MODEL_BASE_URL;
  const model = options.model || process.env.MODEL_NAME;
  const timeoutMs = Number(options.timeoutMs || process.env.MODEL_TIMEOUT_MS || 8000);

  if (!apiKey || !baseUrl || !model) {
    throw createProviderError(
      'MODEL_API_KEY/MODEL_BASE_URL/model is required',
      'MISCONFIG',
    );
  }

  let response;
  const mode =
    request.mode === 'initial_visual_suggest' || request.mode === 'voice_refine'
      ? request.mode
      : 'voice_refine';
  const isInitialMode = mode === 'initial_visual_suggest';
  const textPayload = isInitialMode
    ? {
        mode,
        locale: request.locale,
        imageStats: request.imageStats || null,
        sceneHints: Array.isArray(request.sceneHints) ? request.sceneHints.slice(0, 4) : [],
      }
    : {
        mode,
        transcript: request.transcript || '',
        locale: request.locale,
        sceneHints: request.sceneHints || [],
        imageStats: request.imageStats || null,
        currentParams: request.currentParams,
      };
  const userContent = [
    {
      type: 'text',
      text: JSON.stringify(textPayload),
    },
  ];
  if (request.image && request.image.base64 && request.image.mimeType) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: `data:${request.image.mimeType};base64,${request.image.base64}`,
        ...(isInitialMode ? {detail: 'low'} : {}),
      },
    });
  }
  const requestBodyBase = {
    model,
    temperature: 0.1,
    max_tokens: isInitialMode ? 500 : 900,
    messages: [
      {
        role: 'system',
        content: isInitialMode ? INITIAL_VISUAL_PROMPT : SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: userContent,
      },
    ],
  };

  const sendRequest = async body =>
    requestWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      },
      timeoutMs,
    );

  try {
    response = await sendRequest({
      ...requestBodyBase,
      response_format: {type: 'json_object'},
    });
    if (!response.ok && response.status === 400) {
      const firstPayload = await response.json().catch(() => ({}));
      const firstMessage = extractErrorMessage(firstPayload);
      const firstCode = classifyBadRequestCode(firstMessage);
      if (firstCode === 'UNSUPPORTED_RESPONSE_FORMAT') {
        response = await sendRequest(requestBodyBase);
      } else {
        throw createProviderError(
          firstMessage || 'provider bad request',
          firstCode,
          400,
        );
      }
    }
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw createProviderError('provider request timeout', 'TIMEOUT');
    }
    if (error && typeof error.code === 'string') {
      throw error;
    }
    throw createProviderError('provider network failure', 'NETWORK');
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = extractErrorMessage(payload) || `provider status ${response.status}`;
    const code =
      response.status === 400
        ? classifyBadRequestCode(message)
        : `HTTP_${response.status}`;
    throw createProviderError(message, code, response.status);
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw createProviderError('provider response missing message content', 'BAD_PAYLOAD');
  }

  try {
    return normalizeInterpretPayload(parseJsonSafe(content), mode);
  } catch {
    throw createProviderError('provider response is not valid JSON', 'INVALID_JSON');
  }
};

const classifyAsrBadRequestCode = message => {
  const lowered = String(message || '').toLowerCase();
  if (
    lowered.includes('model') &&
    (lowered.includes('not found') || lowered.includes('does not exist') || lowered.includes('invalid'))
  ) {
    return 'MODEL_UNAVAILABLE';
  }
  if (
    lowered.includes('audio') ||
    lowered.includes('file') ||
    lowered.includes('format') ||
    lowered.includes('decode') ||
    lowered.includes('duration')
  ) {
    return 'BAD_AUDIO';
  }
  return 'HTTP_400';
};

const transcribeWithOpenAICompat = async (request, options = {}) => {
  const apiKey = String(options.apiKey || process.env.ASR_API_KEY || '').trim();
  const baseUrl = String(options.baseUrl || process.env.ASR_BASE_URL || '').trim();
  const model = String(options.model || process.env.ASR_MODEL || '').trim();
  const timeoutMs = Number(options.timeoutMs || process.env.ASR_TIMEOUT_MS || 30000);

  if (!apiKey || !baseUrl || !model) {
    throw createProviderError(
      'ASR_API_KEY/ASR_BASE_URL/ASR_MODEL is required',
      'MISCONFIG',
    );
  }

  const hasBuffer = request?.buffer && Buffer.isBuffer(request.buffer);
  const hasFilePath = typeof request?.filePath === 'string' && request.filePath.trim();
  if (!hasBuffer && !hasFilePath) {
    throw createProviderError('audio buffer is required', 'BAD_AUDIO', 400);
  }

  const audioBuffer = hasBuffer ? request.buffer : await readFile(request.filePath);
  if (!audioBuffer || !audioBuffer.length) {
    throw createProviderError('audio payload is empty', 'BAD_AUDIO', 400);
  }

  const form = new FormData();
  const mimeType = String(request?.mimeType || 'audio/mp4');
  const fileName = String(request?.fileName || `voice-${Date.now()}.m4a`);
  const blob = new Blob([audioBuffer], {type: mimeType});
  form.append('file', blob, fileName);
  form.append('model', model);

  if (typeof request?.language === 'string' && request.language.trim()) {
    const normalizedLanguage = request.language.trim().toLowerCase().replace('_', '-');
    const shortLanguage = normalizedLanguage.split('-')[0];
    form.append('language', shortLanguage || normalizedLanguage);
  }

  let response;
  try {
    response = await requestWithTimeout(
      `${baseUrl.replace(/\/$/, '')}/audio/transcriptions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form,
      },
      timeoutMs,
    );
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw createProviderError('asr request timeout', 'TIMEOUT');
    }
    throw createProviderError('asr network failure', 'NETWORK');
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = extractErrorMessage(payload) || `asr provider status ${response.status}`;
    const code =
      response.status === 400
        ? classifyAsrBadRequestCode(message)
        : `HTTP_${response.status}`;
    throw createProviderError(message, code, response.status);
  }

  const json = await response.json().catch(() => ({}));
  const transcript =
    typeof json?.text === 'string'
      ? json.text.trim()
      : typeof json?.transcript === 'string'
        ? json.transcript.trim()
        : '';

  return {
    transcript,
    language: typeof json?.language === 'string' ? json.language : undefined,
    durationMs:
      typeof json?.duration === 'number' && Number.isFinite(json.duration)
        ? Number(json.duration) * 1000
        : undefined,
  };
};

module.exports = {
  interpretWithOpenAICompat,
  transcribeWithOpenAICompat,
};
