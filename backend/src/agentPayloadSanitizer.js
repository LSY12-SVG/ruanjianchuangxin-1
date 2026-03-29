const crypto = require('node:crypto');

const DEFAULT_BASE64_CHAR_LIMIT = 4096;
const BASE64_FIELD_PATTERN = /(base64|datauri|data_url|image_data|binary|blob)/i;
const BASE64_BODY_PATTERN = /^[A-Za-z0-9+/=\r\n]+$/;

const normalizeLimit = value => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 256) {
    return DEFAULT_BASE64_CHAR_LIMIT;
  }
  return Math.floor(parsed);
};

const splitDataUri = value => {
  const raw = String(value || '');
  const marker = ';base64,';
  const markerIndex = raw.indexOf(marker);
  if (markerIndex <= 0) {
    return null;
  }
  const header = raw.slice(0, markerIndex + marker.length);
  const payload = raw.slice(markerIndex + marker.length);
  return {
    header,
    payload,
  };
};

const summarizeBase64 = payload => {
  const normalized = String(payload || '').replace(/\s+/g, '');
  const digest = crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 12);
  const tail = normalized.slice(-24);
  return `[base64_omitted len=${normalized.length} sha1=${digest} tail=${tail}]`;
};

const shouldTrimAsBase64 = ({key, value, limit}) => {
  if (typeof value !== 'string') {
    return false;
  }
  const candidate = value.trim();
  if (!candidate) {
    return false;
  }
  const split = splitDataUri(candidate);
  if (split) {
    return split.payload.replace(/\s+/g, '').length > limit;
  }
  if (BASE64_FIELD_PATTERN.test(String(key || ''))) {
    return candidate.length > limit;
  }
  if (candidate.length <= limit * 2) {
    return false;
  }
  return BASE64_BODY_PATTERN.test(candidate);
};

const trimStringValue = ({key, value, limit}) => {
  if (!shouldTrimAsBase64({key, value, limit})) {
    return value;
  }
  const candidate = String(value || '').trim();
  const split = splitDataUri(candidate);
  if (split) {
    return `${split.header}${summarizeBase64(split.payload)}`;
  }
  return summarizeBase64(candidate);
};

const sanitizePayloadValue = ({value, key, limit}) => {
  if (typeof value === 'string') {
    return trimStringValue({key, value, limit});
  }
  if (Array.isArray(value)) {
    return value.map(item => sanitizePayloadValue({value: item, key, limit}));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const next = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    next[entryKey] = sanitizePayloadValue({
      value: entryValue,
      key: entryKey,
      limit,
    });
  }
  return next;
};

const sanitizeAgentPayloadForTransport = (payload, options = {}) => {
  const limit = normalizeLimit(
    options.base64CharLimit || process.env.AGENT_RESPONSE_BASE64_CHAR_LIMIT,
  );
  return sanitizePayloadValue({value: payload, key: '', limit});
};

module.exports = {
  sanitizeAgentPayloadForTransport,
  DEFAULT_BASE64_CHAR_LIMIT,
};
