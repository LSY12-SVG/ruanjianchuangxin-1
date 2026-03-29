const PLAN_SUMMARY_TIMEOUT_MS = Number(process.env.AGENT_PLAN_SUMMARY_TIMEOUT_MS || 1200);
const HARD_SUMMARY_TIMEOUT_CAP_MS = 1200;

const isObject = value => typeof value === 'object' && value !== null;

const ACTION_LABELS = {
  'navigation.navigate_tab': '页面跳转',
  'grading.apply_visual_suggest': '执行首轮智能调色',
  'convert.start_task': '启动 2D 转 3D 建模',
  'community.create_draft': '创建社区草稿',
  'community.publish_draft': '发布社区内容',
  'settings.apply_patch': '应用设置变更',
  'app.summarize_current_page': '总结当前页面',
};

const CONTEXT_LABELS = {
  'context.color.image': '调色图片',
  'context.modeling.image': '建模图片',
  'context.community.draftId': '社区草稿',
};

const cleanText = value => String(value || '').replace(/\s+/g, ' ').trim();

const hasChineseChar = value => /[\u4e00-\u9fa5]/.test(String(value || ''));

const toActionLabel = action => {
  const key = `${action.domain}.${action.operation}`;
  const fallback = `${action.domain}.${action.operation}`;
  return ACTION_LABELS[key] || fallback;
};

const toContextLabel = contextKey => CONTEXT_LABELS[contextKey] || contextKey;

const collectMissingContexts = actions => {
  const set = new Set();
  for (const action of Array.isArray(actions) ? actions : []) {
    if (!Array.isArray(action.preconditions)) {
      continue;
    }
    for (const item of action.preconditions) {
      if (typeof item === 'string' && item.trim()) {
        set.add(item.trim());
      }
    }
  }
  return Array.from(set);
};

const normalizeModelSummary = value => {
  const text = cleanText(value);
  if (!text || !hasChineseChar(text)) {
    return '';
  }
  const pieces = text
    .split(/(?<=[。！？])/)
    .map(item => cleanText(item))
    .filter(Boolean);
  if (pieces.length === 0) {
    return '';
  }
  const truncated = pieces.slice(0, 4).join('');
  return truncated || '';
};

const buildRuleSummary = input => {
  const actions = Array.isArray(input.actions) ? input.actions : [];
  const firstActionsText = actions.slice(0, 3).map(toActionLabel).join('、') || '页面总结';
  const missingContexts = collectMissingContexts(actions);
  const confirmCount = actions.filter(
    action => action.requiresConfirmation === true || action.riskLevel === 'medium' || action.riskLevel === 'high',
  ).length;
  const sentences = [
    `我将按你的目标“${cleanText(input.goal)}”推进执行，当前规划包含 ${actions.length} 个步骤。`,
    `优先动作是：${firstActionsText}。`,
  ];
  if (missingContexts.length > 0) {
    sentences.push(
      `继续执行前需要补齐：${missingContexts.map(toContextLabel).join('、')}，补齐后会自动续跑后续工作流。`,
    );
  } else {
    sentences.push('如果当前上下文已齐备，我会直接执行可落地步骤。');
  }
  if (confirmCount > 0) {
    sentences.push(`其中 ${confirmCount} 个中高风险动作会先向你确认，不会越权自动执行。`);
  }
  return sentences.slice(0, 4).join('');
};

const readModelConfig = () => {
  const apiKey = String(process.env.MODEL_API_KEY || '').trim();
  const baseUrl = String(process.env.MODEL_BASE_URL || '').trim();
  const model = String(process.env.AGENT_PLAN_SUMMARY_MODEL || process.env.MODEL_NAME || '').trim();
  if (!apiKey || !baseUrl || !model) {
    return null;
  }
  return {
    apiKey,
    baseUrl,
    model,
  };
};

const extractMessageContent = payload => {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    const textPart = content.find(item => item?.type === 'text' && typeof item?.text === 'string');
    return typeof textPart?.text === 'string' ? textPart.text : '';
  }
  return '';
};

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

const buildModelPrompt = input => {
  const actions = (Array.isArray(input.actions) ? input.actions : []).map(action => ({
    domain: action.domain,
    operation: action.operation,
    stage: action.stage || '',
    requiresConfirmation: Boolean(action.requiresConfirmation),
    preconditions: Array.isArray(action.preconditions) ? action.preconditions : [],
  }));
  return {
    goal: cleanText(input.goal),
    currentTab: cleanText(input.currentTab),
    inputSource: cleanText(input.inputSource),
    workflowMode: cleanText(input.workflowMode),
    compilerReasoning: cleanText(input.compilerReasoning),
    actions,
  };
};

const generateSummaryWithModel = async input => {
  const config = readModelConfig();
  if (!config) {
    return '';
  }

  const systemPrompt = [
    '你是移动端 AI Agent 的任务规划摘要助手。',
    '请根据输入规划信息输出 2-4 句简洁中文，不要使用列表或 markdown。',
    '必须包含：目标、当前可执行进度、下一步所需上下文、确认门禁提示（若存在）。',
    '只输出摘要正文，不要输出任何前后缀说明。',
  ].join('\n');

  const response = await requestWithTimeout(
    `${config.baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: JSON.stringify(buildModelPrompt(input)),
          },
        ],
      }),
    },
    Math.max(500, Math.min(HARD_SUMMARY_TIMEOUT_CAP_MS, PLAN_SUMMARY_TIMEOUT_MS)),
  );

  if (!response.ok) {
    throw new Error(`summary_http_${response.status}`);
  }
  const payload = await response.json().catch(() => ({}));
  const content = extractMessageContent(payload);
  return normalizeModelSummary(content);
};

const createPlanningSummary = async input => {
  const fallbackSummary = buildRuleSummary(input);
  try {
    const summary = await generateSummaryWithModel(input);
    if (!summary) {
      return {
        reasoningSummary: fallbackSummary,
        summarySource: 'rule',
      };
    }
    return {
      reasoningSummary: summary,
      summarySource: 'model',
    };
  } catch (error) {
    if (isObject(error) && error.name === 'AbortError') {
      return {
        reasoningSummary: fallbackSummary,
        summarySource: 'rule',
      };
    }
    return {
      reasoningSummary: fallbackSummary,
      summarySource: 'rule',
    };
  }
};

module.exports = {
  createPlanningSummary,
  buildRuleSummary,
};

