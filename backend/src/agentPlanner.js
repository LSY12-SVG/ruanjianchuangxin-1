const hasAny = (text, words) => words.some(word => text.includes(word));

const capabilityKey = (domain, operation) => `${domain}::${operation}`;

const toCapabilitySet = capabilities =>
  new Set(
    (Array.isArray(capabilities) ? capabilities : [])
      .filter(item => item && typeof item.domain === 'string' && typeof item.operation === 'string')
      .map(item => capabilityKey(item.domain, item.operation)),
  );

const pushIfCapable = (set, actions, action) => {
  if (set.has(capabilityKey(action.domain, action.operation))) {
    actions.push(action);
  }
};

const normalizePlanAction = (planId, action, index) => ({
  ...action,
  actionId: action.actionId || `${planId}_${index + 1}`,
  id: action.id || `${planId}_${index + 1}`,
});

const planAgentActions = request => {
  const goal = String(request?.intent?.goal || '').trim();
  const lowered = goal.toLowerCase();
  const actions = [];
  const capSet = toCapabilitySet(request?.capabilities);
  const planId = `plan_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

  if (hasAny(lowered, ['调色', 'color', '电影感', '照片'])) {
    pushIfCapable(capSet, actions, {
      domain: 'navigation',
      operation: 'navigate_tab',
      args: {tab: 'home', route: 'grading'},
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotent: true,
      requiredScopes: ['app:navigate'],
      skillName: 'agent-tool-router',
    });
    pushIfCapable(capSet, actions, {
      domain: 'grading',
      operation: 'apply_visual_suggest',
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotent: false,
      requiredScopes: ['grading:write'],
      skillName: 'agent-task-planner',
    });
  }

  if (hasAny(lowered, ['2d', '3d', '建模', '重建', 'mesh'])) {
    pushIfCapable(capSet, actions, {
      domain: 'navigation',
      operation: 'navigate_tab',
      args: {tab: 'home', route: 'modeling'},
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotent: true,
      requiredScopes: ['app:navigate'],
      skillName: 'agent-tool-router',
    });
    pushIfCapable(capSet, actions, {
      domain: 'convert',
      operation: 'start_task',
      args: {level: 'balanced'},
      riskLevel: 'medium',
      requiresConfirmation: true,
      idempotent: false,
      requiredScopes: ['convert:write'],
      skillName: 'agent-permission-gate',
    });
  }

  if (hasAny(lowered, ['社区', '分享', '发布', '帖子'])) {
    pushIfCapable(capSet, actions, {
      domain: 'navigation',
      operation: 'navigate_tab',
      args: {tab: 'community'},
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotent: true,
      requiredScopes: ['app:navigate'],
      skillName: 'agent-tool-router',
    });
    pushIfCapable(capSet, actions, {
      domain: 'community',
      operation: 'create_draft',
      args: {
        title: `${goal} · AI草稿`,
        tags: ['AI助手', '自动生成'],
      },
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotent: false,
      requiredScopes: ['community:write'],
      skillName: 'agent-task-planner',
    });
    pushIfCapable(capSet, actions, {
      domain: 'community',
      operation: 'publish_draft',
      riskLevel: 'high',
      requiresConfirmation: true,
      idempotent: false,
      requiredScopes: ['community:publish'],
      skillName: 'agent-permission-gate',
    });
  }

  if (hasAny(lowered, ['设置', '性能', '缓存', '权限'])) {
    pushIfCapable(capSet, actions, {
      domain: 'navigation',
      operation: 'navigate_tab',
      args: {tab: 'profile'},
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotent: true,
      requiredScopes: ['app:navigate'],
      skillName: 'agent-tool-router',
    });
    pushIfCapable(capSet, actions, {
      domain: 'settings',
      operation: 'apply_patch',
      args: {syncOnWifi: true, communityNotify: true, voiceAutoApply: true},
      riskLevel: 'medium',
      requiresConfirmation: true,
      idempotent: true,
      requiredScopes: ['settings:write'],
      skillName: 'agent-permission-gate',
    });
  }

  if (actions.length === 0) {
    pushIfCapable(capSet, actions, {
      domain: 'navigation',
      operation: 'navigate_tab',
      args: {tab: request.currentTab || 'agent'},
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotent: true,
      requiredScopes: ['app:navigate'],
      skillName: 'agent-tool-router',
    });
    pushIfCapable(capSet, actions, {
      domain: 'app',
      operation: 'summarize_current_page',
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotent: true,
      requiredScopes: ['app:read'],
      skillName: 'agent-task-planner',
    });
  }

  return {
    planId,
    plannerSource: 'cloud',
    actions: actions.map((action, index) => normalizePlanAction(planId, action, index)),
    reasoningSummary: '根据目标、风险等级和能力清单生成可执行计划。',
    estimatedSteps: actions.length,
    undoPlan: ['可撤销最近一次自动执行', '高风险操作默认进入确认队列'],
  };
};

module.exports = {
  planAgentActions,
};
