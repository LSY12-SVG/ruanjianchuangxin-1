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
  const textPayload = {
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
      },
    });
  }
  try {
    response = await requestWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          response_format: {type: 'json_object'},
          messages: [
            {
              role: 'system',
              content: SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: userContent,
            },
          ],
        }),
      },
      timeoutMs,
    );
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw createProviderError('provider request timeout', 'TIMEOUT');
    }
    throw createProviderError('provider network failure', 'NETWORK');
  }

  if (!response.ok) {
    throw createProviderError(
      `provider status ${response.status}`,
      `HTTP_${response.status}`,
      response.status,
    );
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw createProviderError('provider response missing message content', 'BAD_PAYLOAD');
  }

  try {
    return parseJsonSafe(content);
  } catch {
    throw createProviderError('provider response is not valid JSON', 'INVALID_JSON');
  }
};

module.exports = {
  interpretWithOpenAICompat,
};
