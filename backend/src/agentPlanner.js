const {buildWorkflowActions} = require('./agentIntentCompiler');

const capabilityKey = (domain, operation) => `${domain}::${operation}`;

const toCapabilitySet = capabilities =>
  new Set(
    (Array.isArray(capabilities) ? capabilities : [])
      .filter(item => item && typeof item.domain === 'string' && typeof item.operation === 'string')
      .map(item => capabilityKey(item.domain, item.operation)),
  );

const planAgentActions = request => {
  const goal = String(request?.intent?.goal || '').trim();
  const capSet = toCapabilitySet(request?.capabilities);
  const planId = `plan_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const compiled = buildWorkflowActions({
    goal,
    currentTab: request.currentTab || 'agent',
    planId,
    capSet,
  });
  const actions = Array.isArray(compiled.actions) ? compiled.actions : [];
  const inputSource = request?.inputSource === 'voice' ? 'voice' : 'text';

  return {
    planId,
    plannerSource: 'cloud',
    actions,
    reasoningSummary: `Hybrid意图编译(${inputSource})：${compiled.reasoning}`,
    estimatedSteps: actions.length,
    undoPlan: [
      '可撤销最近一次自动执行',
      '高风险操作默认进入确认队列',
      '支持缺失上下文补齐后继续执行',
    ],
  };
};

module.exports = {
  planAgentActions,
};
