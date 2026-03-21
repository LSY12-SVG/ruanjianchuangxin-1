const {fetch: undiciFetch, ProxyAgent} = require('undici');

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

const requestWithTimeout = async (url, init, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await undiciFetch(url, {
      ...init,
      signal: controller.signal,
      dispatcher: tripoDispatcher,
    });
  } finally {
    clearTimeout(timer);
  }
};

const runTripoPrecheck = async ({
  baseUrl,
  apiKey,
  timeoutMs = 8000,
}) => {
  const normalizedBaseUrl = String(baseUrl || '').replace(/\/+$/, '');
  const normalizedApiKey = toNonEmptyString(apiKey);
  if (!normalizedBaseUrl) {
    throw new Error('TRIPO_BASE_URL is required.');
  }
  if (!normalizedApiKey || normalizedApiKey.includes('replace-with-your-tripo-secret-key')) {
    throw new Error('TRIPO_SECRET_KEY is required.');
  }

  let response;
  try {
    response = await requestWithTimeout(
      `${normalizedBaseUrl}/task/non-existent-precheck-id`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${normalizedApiKey}`,
        },
      },
      timeoutMs,
    );
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('TRIPO_PRECHECK_TIMEOUT');
    }
    throw new Error(`TRIPO_PRECHECK_NETWORK_ERROR:${String(error?.message || 'unknown')}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(`TRIPO_PRECHECK_AUTH_ERROR:${response.status}`);
  }
  if (response.status >= 500) {
    throw new Error(`TRIPO_PRECHECK_SERVER_ERROR:${response.status}`);
  }

  return {
    ok: true,
    status: response.status,
    endpoint: `${normalizedBaseUrl}/task/non-existent-precheck-id`,
  };
};

module.exports = {
  runTripoPrecheck,
};
