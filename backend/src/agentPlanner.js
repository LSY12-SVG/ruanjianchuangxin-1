const hasAny = (text, words) => words.some(word => text.includes(word));

const planAgentActions = request => {
  const goal = String(request?.intent?.goal || '').trim();
  const lowered = goal.toLowerCase();
  const actions = [];

  if (hasAny(lowered, ['调色', 'color', '电影感', '照片'])) {
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

  if (hasAny(lowered, ['2d', '3d', '建模', '重建', 'mesh'])) {
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

  if (hasAny(lowered, ['社区', '分享', '发布', '帖子'])) {
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
      args: {
        title: `${goal} · AI草稿`,
        tags: ['AI助手', '自动生成'],
      },
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

  if (hasAny(lowered, ['设置', '性能', '缓存', '权限'])) {
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
      args: {syncOnWifi: true, communityNotify: true, voiceAutoApply: true},
      riskLevel: 'medium',
      requiresConfirmation: true,
    });
  }

  if (actions.length === 0) {
    actions.push({
      domain: 'navigation',
      operation: 'navigate_tab',
      args: {tab: request.currentTab || 'agent'},
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

  return {
    actions: actions.map((action, index) => ({...action, id: `agent_${index + 1}`})),
    reasoning_summary: '根据任务目标与风险分级生成半自动执行计划。',
    estimated_steps: actions.length,
    undo_plan: ['可撤销最近一次自动执行', '高风险操作默认进入确认队列'],
  };
};

module.exports = {
  planAgentActions,
};
