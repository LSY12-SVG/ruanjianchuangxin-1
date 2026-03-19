import type {AgentAction, AgentPlanRequest, AgentPlanResponse} from './types';

const hasAny = (text: string, words: string[]): boolean =>
  words.some(word => text.includes(word));

const capabilityKey = (domain: string, operation: string): string => `${domain}::${operation}`;

const canUse = (request: AgentPlanRequest, domain: string, operation: string): boolean => {
  const keys = new Set(
    request.capabilities.map(item => capabilityKey(item.domain, item.operation)),
  );
  return keys.has(capabilityKey(domain, operation));
};

const nextActionId = (prefix: string, index: number): string => `${prefix}_${index + 1}`;

const withDefaults = (actions: AgentAction[], planId: string): AgentAction[] =>
  actions.map((action, index) => ({
    ...action,
    actionId: action.actionId || nextActionId(planId, index),
    id: action.id || nextActionId(planId, index),
  }));

const pushAction = (
  request: AgentPlanRequest,
  actions: AgentAction[],
  action: Omit<AgentAction, 'actionId'>,
): void => {
  if (canUse(request, action.domain, action.operation)) {
    actions.push({
      ...action,
      actionId: '',
    });
  }
};

const resolveSnapshotText = (
  snapshot: Record<string, unknown>,
  key: string,
): string => {
  const direct = snapshot[key];
  if (typeof direct === 'string' && direct.trim()) {
    return direct;
  }
  for (const value of Object.values(snapshot)) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const nested = (value as Record<string, unknown>)[key];
    if (typeof nested === 'string' && nested.trim()) {
      return nested;
    }
  }
  return '';
};

const resolveSnapshotCreateRoute = (
  snapshot: Record<string, unknown>,
): 'hub' | 'editor' | undefined => {
  const raw = resolveSnapshotText(snapshot, 'currentCreateRoute') || resolveSnapshotText(snapshot, 'currentHomeRoute');
  if (raw === 'hub') {
    return 'hub';
  }
  if (raw === 'editor' || raw === 'grading') {
    return 'editor';
  }
  return undefined;
};

export const buildLocalAgentPlan = (request: AgentPlanRequest): AgentPlanResponse => {
  const goal = request.intent.goal.trim();
  const lowered = goal.toLowerCase();
  const actions: AgentAction[] = [];
  const planId = `local_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const pageSnapshot = request.pageSnapshot || {};

  if (hasAny(lowered, ['调色', 'color', '照片', '电影感', '肤色'])) {
    pushAction(request, actions, {
      domain: 'navigation',
      operation: 'navigate_tab',
      args: {tab: 'create', route: 'editor'},
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotent: true,
      requiredScopes: ['app:navigate'],
      skillName: 'agent-tool-router',
    });
    pushAction(request, actions, {
      domain: 'grading',
      operation: 'apply_visual_suggest',
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotent: false,
      requiredScopes: ['grading:write'],
      skillName: 'agent-task-planner',
    });
  }

  if (hasAny(lowered, ['2d', '3d', '建模', '模型', '重建'])) {
    pushAction(request, actions, {
      domain: 'navigation',
      operation: 'navigate_tab',
      args: {tab: 'works', action: 'modeling'},
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotent: true,
      requiredScopes: ['app:navigate'],
      skillName: 'agent-tool-router',
    });
    pushAction(request, actions, {
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

  if (hasAny(lowered, ['社区', '发布', '分享', '帖子'])) {
    const draftTitleFromSnapshot = resolveSnapshotText(
      pageSnapshot,
      'community.lastDraftTitle',
    );
    const communityDraftTitle = draftTitleFromSnapshot || `${goal} · AI草稿`;
    pushAction(request, actions, {
      domain: 'navigation',
      operation: 'navigate_tab',
      args: {tab: 'works', action: 'community'},
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotent: true,
      requiredScopes: ['app:navigate'],
      skillName: 'agent-tool-router',
    });
    pushAction(request, actions, {
      domain: 'community',
      operation: 'create_draft',
      args: {title: communityDraftTitle},
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotent: false,
      requiredScopes: ['community:write'],
      skillName: 'agent-task-planner',
    });
    pushAction(request, actions, {
      domain: 'community',
      operation: 'publish_draft',
      riskLevel: 'high',
      requiresConfirmation: true,
      idempotent: false,
      requiredScopes: ['community:publish'],
      skillName: 'agent-permission-gate',
    });
  }

  if (hasAny(lowered, ['设置', '性能', '权限', '缓存', '省电'])) {
    pushAction(request, actions, {
      domain: 'navigation',
      operation: 'navigate_tab',
      args: {tab: 'works', action: 'settings'},
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotent: true,
      requiredScopes: ['app:navigate'],
      skillName: 'agent-tool-router',
    });
    pushAction(request, actions, {
      domain: 'settings',
      operation: 'apply_patch',
      args: {
        syncOnWifi: true,
        communityNotify: true,
      },
      riskLevel: 'medium',
      requiresConfirmation: true,
      idempotent: true,
      requiredScopes: ['settings:write'],
      skillName: 'agent-permission-gate',
    });
  }

  if (actions.length === 0) {
    const currentCreateRoute =
      request.currentTab === 'create' ? resolveSnapshotCreateRoute(pageSnapshot) : undefined;
    pushAction(request, actions, {
      domain: 'navigation',
      operation: 'navigate_tab',
      args:
        request.currentTab === 'create'
          ? {tab: request.currentTab, route: currentCreateRoute}
          : {tab: request.currentTab},
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotent: true,
      requiredScopes: ['app:navigate'],
      skillName: 'agent-tool-router',
    });
    pushAction(request, actions, {
      domain: 'app',
      operation: 'summarize_current_page',
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotent: true,
      requiredScopes: ['app:read'],
      skillName: 'agent-task-planner',
    });
  }

  const normalized = withDefaults(actions, planId);
  return {
    planId,
    actions: normalized,
    reasoningSummary: '本地规划器基于目标、能力清单与页面快照生成可执行计划。',
    estimatedSteps: normalized.length,
    undoPlan: ['支持回滚最近一次自动执行动作。'],
    plannerSource: 'local',
  };
};
