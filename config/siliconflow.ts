export const SILICONFLOW_API_KEY = '';

export const SILICONFLOW_MODEL = 'Qwen/Qwen2.5-7B-Instruct';

export const SILICONFLOW_CONFIG = {
  apiUrl: 'https://api.siliconflow.cn/v1/chat/completions',
  temperature: 0.7,
  maxTokens: 512,
  timeout: 30000,
};

export const SILICONFLOW_MODELS = [
  {
    id: 'Qwen/Qwen2.5-7B-Instruct',
    name: 'Qwen2.5-7B',
    description: 'Lightweight model for realtime color analysis.',
    free: true,
  },
  {
    id: 'Qwen/Qwen2.5-14B-Instruct',
    name: 'Qwen2.5-14B',
    description: 'Mid-size model for more complex style analysis.',
    free: true,
  },
  {
    id: 'Qwen/Qwen2.5-72B-Instruct',
    name: 'Qwen2.5-72B',
    description: 'Large model for deeper style analysis.',
    free: true,
  },
];
