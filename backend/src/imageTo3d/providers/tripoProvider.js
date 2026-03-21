const path = require('path');
const {fetch: undiciFetch, ProxyAgent} = require('undici');
const { ApiError } = require('../errors');

const toNonEmptyString = value => {
  const text = String(value || '').trim();
  return text.length > 0 ? text : '';
};

const resolveTripoProxyUrl = () =>
  toNonEmptyString(
    process.env.TRIPO_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY,
  );

const tripoProxyUrl = resolveTripoProxyUrl();
const tripoDispatcher = tripoProxyUrl ? new ProxyAgent(tripoProxyUrl) : undefined;

function parseJsonSafely(rawBody) {
  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody);
  } catch (_error) {
    return null;
  }
}

function extractTripoMessage(payload, fallbackMessage) {
  const directCandidates = [
    payload?.message,
    payload?.error?.message,
    payload?.suggestion,
    payload?.data?.message,
    payload?.data?.error,
    payload?.data?.fail_reason,
    payload?.data?.reason,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }

  return fallbackMessage;
}

async function requestTripo({ baseUrl, apiKey, pathname, method = 'GET', body, isMultipart = false }) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
  };

  if (!isMultipart) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await undiciFetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body == null ? undefined : isMultipart ? body : JSON.stringify(body),
    dispatcher: tripoDispatcher,
  });

  const rawBody = await response.text();
  const payload = parseJsonSafely(rawBody);

  if (!response.ok) {
    throw new ApiError(502, extractTripoMessage(payload, rawBody || 'Tripo request failed.'));
  }

  if (!payload || payload.code !== 0) {
    throw new ApiError(502, extractTripoMessage(payload, 'Tripo request failed.'));
  }

  return payload.data;
}

function getImageType(mimeType, fileName) {
  if (mimeType) {
    const [, subtype] = mimeType.split('/');
    if (subtype) {
      if (subtype === 'jpeg') {
        return 'jpg';
      }
      return subtype.toLowerCase();
    }
  }

  if (fileName) {
    const extension = path.extname(fileName).replace('.', '').toLowerCase();
    if (extension) {
      return extension;
    }
  }

  return 'png';
}

function inferFileTypeFromUrl(url, fallbackType) {
  if (!url) {
    return fallbackType;
  }

  try {
    const parsedUrl = new URL(url);
    const extension = path.extname(parsedUrl.pathname).replace('.', '').toUpperCase();
    return extension || fallbackType;
  } catch (_error) {
    const extension = path.extname(url.split('?')[0]).replace('.', '').toUpperCase();
    return extension || fallbackType;
  }
}

function normalizeTripoOutput(output, preferredType) {
  const previewImageUrl = output?.rendered_image || null;
  const seenUrls = new Set();
  const candidates = [output?.model, output?.pbr_model, output?.base_model];
  const files = [];

  for (const candidateUrl of candidates) {
    if (!candidateUrl || seenUrls.has(candidateUrl)) {
      continue;
    }

    seenUrls.add(candidateUrl);
    files.push({
      Type: inferFileTypeFromUrl(candidateUrl, preferredType),
      Url: candidateUrl,
      PreviewImageUrl: previewImageUrl,
    });
  }

  return files;
}

function normalizeTripoStatus(status) {
  switch ((status || '').toLowerCase()) {
    case 'success':
      return 'SUCCESS';
    case 'failed':
    case 'failure':
      return 'FAILED';
    case 'queued':
    case 'pending':
      return 'PENDING';
    case 'running':
    case 'processing':
    case 'in_progress':
      return 'RUNNING';
    default:
      return String(status || '').toUpperCase();
  }
}

function createTripoProvider({
  apiKey,
  baseUrl,
  modelVersion,
  outputFormat = 'glb',
  texture = true,
  pbr = false,
}) {
  if (!apiKey) {
    throw new ApiError(500, 'Tripo provider is selected but the API key is missing.');
  }

  return {
    name: 'tripo',
    async submitJob({ imageBuffer, mimeType, fileName }) {
      const formData = new FormData();
      const blob = new Blob([imageBuffer], {
        type: mimeType || 'application/octet-stream',
      });

      formData.append('file', blob, fileName || `upload.${getImageType(mimeType, fileName)}`);

      const uploadData = await requestTripo({
        baseUrl,
        apiKey,
        pathname: '/upload',
        method: 'POST',
        body: formData,
        isMultipart: true,
      });

      if (!uploadData?.image_token) {
        throw new ApiError(502, 'Tripo did not return an uploaded image token.');
      }

      const taskPayload = {
        type: 'image_to_model',
        file: {
          type: getImageType(mimeType, fileName),
          file_token: uploadData.image_token,
        },
        model_version: modelVersion,
        texture,
        pbr,
        out_format: outputFormat,
      };

      const taskData = await requestTripo({
        baseUrl,
        apiKey,
        pathname: '/task',
        method: 'POST',
        body: taskPayload,
      });

      if (!taskData?.task_id) {
        throw new ApiError(502, 'Tripo did not return a task id.');
      }

      return { providerJobId: taskData.task_id };
    },
    async getJob({ providerJobId }) {
      const taskData = await requestTripo({
        baseUrl,
        apiKey,
        pathname: `/task/${providerJobId}`,
      });

      return {
        rawStatus: normalizeTripoStatus(taskData?.status),
        errorCode: taskData?.status === 'failed' ? 'TRIPO_TASK_FAILED' : null,
        errorMessage:
          taskData?.status === 'failed'
            ? extractTripoMessage(taskData, 'Tripo task failed.')
            : null,
        files: normalizeTripoOutput(taskData?.output, outputFormat.toUpperCase()),
      };
    },
  };
}

module.exports = {
  createTripoProvider,
  extractTripoMessage,
  normalizeTripoStatus,
  normalizeTripoOutput,
  getImageType,
};
