export const SILICONFLOW_API_KEY = 'kpisk-gqeojjxbtsxmfgebkooysjlkymfzhxhdqsizhskmrgjqvmgg';

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
    description: '轻量级模型，响应速度快，适合实时调色建议',
    free: true,
  },
  {
    id: 'Qwen/Qwen2.5-14B-Instruct',
    name: 'Qwen2.5-14B',
    description: '中等规模模型，理解能力强，适合复杂风格分析',
    free: true,
  },
  {
    id: 'Qwen/Qwen2.5-72B-Instruct',
    name: 'Qwen2.5-72B',
    description: '大规模模型，理解能力最强，适合深度风格分析',
    free: true,
  },
];
