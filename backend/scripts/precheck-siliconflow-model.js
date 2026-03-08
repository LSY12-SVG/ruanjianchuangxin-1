/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.resolve(__dirname, '../.env');

const CANDIDATES = [
  'Qwen/Qwen3-VL-32B-Instruct',
  'Qwen/Qwen2.5-VL-32B-Instruct',
  'Qwen/Qwen3-VL-8B-Instruct',
];

const parseEnv = content => {
  const map = new Map();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    map.set(key, value);
  }
  return map;
};

const upsertEnvValue = (content, key, value) => {
  const lines = content.split(/\r?\n/);
  const targetPrefix = `${key}=`;
  const index = lines.findIndex(line => line.startsWith(targetPrefix));
  if (index >= 0) {
    lines[index] = `${key}=${value}`;
  } else {
    lines.push(`${key}=${value}`);
  }
  return lines.join('\n');
};

const fetchModelIds = async ({baseUrl, apiKey}) => {
  const response = await fetch(`${baseUrl}/models`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!response.ok) {
    throw new Error(`models_http_${response.status}`);
  }
  const json = await response.json();
  const data = Array.isArray(json?.data) ? json.data : [];
  return data
    .map(item => (typeof item?.id === 'string' ? item.id : ''))
    .filter(Boolean);
};

const main = async () => {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error('.env_not_found');
  }
  let content = fs.readFileSync(ENV_PATH, 'utf8');
  const env = parseEnv(content);

  const baseUrl = env.get('MODEL_BASE_URL') || 'https://api.siliconflow.cn/v1';
  const apiKey = env.get('MODEL_API_KEY') || '';
  if (!apiKey || apiKey === 'replace_me') {
    throw new Error('missing_model_api_key');
  }

  const modelIds = await fetchModelIds({baseUrl, apiKey});
  const selectedPrimary =
    CANDIDATES.find(model => modelIds.includes(model)) || 'Qwen/Qwen3-VL-8B-Instruct';

  content = upsertEnvValue(content, 'MODEL_PROVIDER', 'openai_compat');
  content = upsertEnvValue(content, 'MODEL_BASE_URL', baseUrl);
  content = upsertEnvValue(content, 'MODEL_PRIMARY_NAME', selectedPrimary);
  content = upsertEnvValue(content, 'MODEL_FALLBACK_NAME', 'Qwen/Qwen3-VL-8B-Instruct');
  content = upsertEnvValue(content, 'MODEL_TIMEOUT_MS', '12000');
  fs.writeFileSync(ENV_PATH, content, 'utf8');

  console.log(
    JSON.stringify(
      {
        ok: true,
        primary: selectedPrimary,
        fallback: 'Qwen/Qwen3-VL-8B-Instruct',
        availableCandidates: CANDIDATES.filter(model => modelIds.includes(model)),
      },
      null,
      2,
    ),
  );
};

main().catch(error => {
  console.error('precheck_failed:', error.message || String(error));
  process.exit(1);
});
