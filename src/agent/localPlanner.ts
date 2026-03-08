import type {AgentAction, AgentAppTab, AgentPlanRequest, AgentPlanResponse} from './types';

const hasAny = (text: string, words: string[]): boolean =>
  words.some(word => text.includes(word));

const withDefaults = (actions: AgentAction[]): AgentAction[] =>
  actions.map((action, index) => ({
    ...action,
    id: action.id || `local_${index + 1}`,
  }));

export const buildLocalAgentPlan = (request: AgentPlanRequest): AgentPlanResponse => {
  const goal = request.intent.goal.trim();
  const lowered = goal.toLowerCase();
  const actions: AgentAction[] = [];

  if (hasAny(lowered, ['调色', 'color', '照片', '电影感', '肤色'])) {
    actions.push({
      domain: 'navigation',
      operation: 'navigate_tab',
      args: {tab: 'grading'},
      riskLevel: 'low',
      requiresConfirmation: false,
    });
    actions.push({
      domain: 'grading',
      operation: 'apply_visual_suggest',
      riskLevel: 'low',
      requiresConfirmation: false,
    });
  }

  if (hasAny(lowered, ['2d', '3d', '建模', '模型', '重建'])) {
    actions.push({
      domain: 'navigation',
      operation: 'navigate_tab',
      args: {tab: 'convert'},
      riskLevel: 'low',
      requiresConfirmation: false,
    });
    actions.push({
      domain: 'convert',
      operation: 'start_task',
      args: {level: 'balanced'},
      riskLevel: 'medium',
      requiresConfirmation: true,
    });
  }

  if (hasAny(lowered, ['社区', '发布', '分享', '帖子'])) {
    actions.push({
      domain: 'navigation',
      operation: 'navigate_tab',
      args: {tab: 'community'},
      riskLevel: 'low',
      requiresConfirmation: false,
    });
    actions.push({
      domain: 'community',
      operation: 'create_draft',
      args: {title: `${goal} · AI草稿`},
      riskLevel: 'low',
      requiresConfirmation: false,
    });
    actions.push({
      domain: 'community',
      operation: 'publish_draft',
      riskLevel: 'high',
      requiresConfirmation: true,
    });
  }

  if (hasAny(lowered, ['设置', '性能', '权限', '缓存', '省电'])) {
    actions.push({
      domain: 'navigation',
      operation: 'navigate_tab',
      args: {tab: 'profile'},
      riskLevel: 'low',
      requiresConfirmation: false,
    });
    actions.push({
      domain: 'settings',
      operation: 'apply_patch',
      args: {
        syncOnWifi: true,
        communityNotify: true,
      },
      riskLevel: 'medium',
      requiresConfirmation: true,
    });
  }

  if (actions.length === 0) {
    const tab: AgentAppTab = request.currentTab;
    actions.push({
      domain: 'navigation',
      operation: 'navigate_tab',
      args: {tab},
      riskLevel: 'low',
      requiresConfirmation: false,
    });
    actions.push({
      domain: 'app',
      operation: 'summarize_current_page',
      riskLevel: 'low',
      requiresConfirmation: false,
    });
  }

  const normalized = withDefaults(actions);
  return {
    actions: normalized,
    reasoningSummary: '本地规划器已根据页面和目标生成执行动作。',
    estimatedSteps: normalized.length,
    undoPlan: ['支持回滚最近一次自动执行动作。'],
  };
};
