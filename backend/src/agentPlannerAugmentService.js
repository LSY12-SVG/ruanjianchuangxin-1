const {ACTION_TOOL_META_MAP} = require('./agentToolRefs');

const DEFAULT_TIMEOUT_MS = Number(process.env.AGENT_PLANNER_TIMEOUT_MS || 1200);
const HARD_TIMEOUT_CAP_MS = 1500;

const STRATEGY_PROFILE = Object.freeze({
  fast: {temperature: 0.1, timeoutScale: 0.8},
  quality: {temperature: 0.22, timeoutScale: 1.2},
  cost: {temperature: 0.05, timeoutScale: 0.7},
});

const normalizeStrategy = value => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return raw === 'fast' || raw === 'quality' || raw === 'cost' ? raw : 'quality';
};

const isObject = value => typeof value === 'object' && value !== null;

const cleanText = value => String(value || '').replace(/\s+/g, ' ').trim();

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

const readPlannerConfig = () => {
  const model = cleanText(process.env.AGENT_PLANNER_MODEL);
  const baseUrl = cleanText(process.env.AGENT_PLANNER_BASE_URL);
  const apiKey = cleanText(process.env.AGENT_PLANNER_API_KEY);
  if (!model || !baseUrl || !apiKey) {
    return null;
  }
  return {
    model,
    baseUrl,
    apiKey,
    timeoutMs: Math.max(600, Math.min(HARD_TIMEOUT_CAP_MS, Number.isFinite(DEFAULT_TIMEOUT_MS) ? DEFAULT_TIMEOUT_MS : HARD_TIMEOUT_CAP_MS)),
  };
};

const buildPromptPayload = input => ({
  goal: cleanText(input.goal),
  currentTab: cleanText(input.currentTab),
  actions: (Array.isArray(input.actions) ? input.actions : []).map(action => ({
    actionId: action.actionId,
    domain: action.domain,
    operation: action.operation,
    stage: action.stage || '',
    args: isObject(action.args) ? action.args : {},
    preconditions: Array.isArray(action.preconditions) ? action.preconditions : [],
    dependsOn: Array.isArray(action.dependsOn) ? action.dependsOn : [],
    toolMeta: ACTION_TOOL_META_MAP[`${action.domain}::${action.operation}`] || null,
  })),
  historyContext: isObject(input.historyContext) ? input.historyContext : {},
  knownMissingContexts: Array.isArray(input.knownMissingContexts) ? input.knownMissingContexts : [],
  executionStrategy: normalizeStrategy(input.executionStrategy),
  selectedSkillPack: cleanText(input.selectedSkillPack),
  userMemory: isObject(input.userMemory) ? input.userMemory : {},
});

const normalizePlannerPatch = value => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const raw = value.trim();
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    const parsed = JSON.parse(candidate);
    if (!isObject(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const normalizeActionOrder = (candidate, actions) => {
  if (!Array.isArray(candidate)) {
    return [];
  }
  const validIds = new Set((Array.isArray(actions) ? actions : []).map(action => String(action?.actionId || '')));
  const order = candidate
    .map(item => String(item || '').trim())
    .filter(item => item && validIds.has(item));
  return order.length === validIds.size ? order : [];
};

const normalizeArgPatch = patch => {
  if (!Array.isArray(patch)) {
    return [];
  }
  return patch
    .map(item => {
      if (!isObject(item)) {
        return null;
      }
      const actionId = cleanText(item.actionId);
      const args = isObject(item.args) ? item.args : null;
      if (!actionId || !args) {
        return null;
      }
      return {actionId, args};
    })
    .filter(Boolean);
};

const normalizePreconditionPatch = patch => {
  if (!Array.isArray(patch)) {
    return [];
  }
  return patch
    .map(item => {
      if (!isObject(item)) {
        return null;
      }
      const actionId = cleanText(item.actionId);
      const preconditions = Array.isArray(item.preconditions)
        ? item.preconditions
            .map(value => cleanText(value))
            .filter(Boolean)
        : [];
      if (!actionId || !preconditions.length) {
        return null;
      }
      return {actionId, preconditions};
    })
    .filter(Boolean);
};

const applyPlannerPatch = ({actions, patch}) => {
  const safeActions = Array.isArray(actions) ? actions : [];
  if (!patch || !safeActions.length) {
    return safeActions;
  }

  const byActionId = new Map(safeActions.map(action => [String(action.actionId), {...action}]));
  for (const item of normalizeArgPatch(patch.actionArgPatches)) {
    const current = byActionId.get(item.actionId);
    if (!current) {
      continue;
    }
    byActionId.set(item.actionId, {
      ...current,
      args: {
        ...(isObject(current.args) ? current.args : {}),
        ...item.args,
      },
    });
  }

  for (const item of normalizePreconditionPatch(patch.preconditionPatches)) {
    const current = byActionId.get(item.actionId);
    if (!current) {
      continue;
    }
    const merged = new Set([...(Array.isArray(current.preconditions) ? current.preconditions : []), ...item.preconditions]);
    byActionId.set(item.actionId, {
      ...current,
      preconditions: Array.from(merged),
    });
  }

  const requestedOrder = normalizeActionOrder(patch.actionOrder, safeActions);
  if (requestedOrder.length) {
    return requestedOrder.map(actionId => byActionId.get(actionId)).filter(Boolean);
  }
  return safeActions.map(action => byActionId.get(String(action.actionId)) || action);
};

const augmentPlanActions = async input => {
  const config = readPlannerConfig();
  if (!config) {
    return {
      actions: Array.isArray(input.actions) ? input.actions : [],
      plannerModelUsed: null,
      plannerAugmented: false,
    };
  }

  const strategy = normalizeStrategy(input.executionStrategy);
  const profile = STRATEGY_PROFILE[strategy] || STRATEGY_PROFILE.quality;

  const systemPrompt = [
    '你是移动端 AI Agent 的规划补参器。',
    '你的职责是基于已有动作骨架做安全增强，不能新增未注册动作，也不能越权提高权限。',
    '只输出 JSON，不要输出 markdown。',
    '允许字段：actionOrder, actionArgPatches, preconditionPatches。',
    'actionArgPatches 只允许补充现有动作 args，如社区草稿标题、tags、content，或建模/调色推荐参数。',
    'preconditionPatches 只允许补充更准确的前置条件。',
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
        temperature: profile.temperature,
        messages: [
          {role: 'system', content: systemPrompt},
          {role: 'user', content: JSON.stringify(buildPromptPayload(input))},
        ],
      }),
    },
    Math.max(600, Math.min(HARD_TIMEOUT_CAP_MS, Math.round(config.timeoutMs * profile.timeoutScale))),
  );

  if (!response.ok) {
    throw new Error(`planner_http_${response.status}`);
  }
  const payload = await response.json().catch(() => ({}));
  const patch = normalizePlannerPatch(extractMessageContent(payload));
  if (!patch) {
    return {
      actions: Array.isArray(input.actions) ? input.actions : [],
      plannerModelUsed: config.model,
      plannerAugmented: false,
    };
  }
  return {
    actions: applyPlannerPatch({
      actions: input.actions,
      patch,
    }),
    plannerModelUsed: config.model,
    plannerAugmented: true,
  };
};

module.exports = {
  augmentPlanActions,
};
