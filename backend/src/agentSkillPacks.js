const PACKS = Object.freeze([
  {
    id: 'creative_pipeline',
    displayName: '创作闭环',
    intentHints: ['调色', '建模', '发布', '社区', '三段式', '闭环'],
    applicableTabs: ['home', 'agent', 'community', 'profile'],
    defaultStrategy: 'quality',
    toolChain: [
      'navigation::navigate_tab',
      'grading::apply_visual_suggest',
      'convert::start_task',
      'community::create_draft',
      'community::publish_draft',
    ],
    requiredContext: ['context.color.image', 'context.modeling.image'],
    requiredPermissions: ['photo_library'],
    riskPolicy: 'inherit',
    fallbackPackIds: ['grading_workflow', 'modeling_delivery', 'community_publish'],
  },
  {
    id: 'grading_workflow',
    displayName: '智能调色',
    intentHints: ['调色', '修图', '风格', '电影感', '优化图片'],
    applicableTabs: ['home', 'agent', 'community', 'profile'],
    defaultStrategy: 'fast',
    toolChain: ['navigation::navigate_tab', 'grading::apply_visual_suggest'],
    requiredContext: ['context.color.image'],
    requiredPermissions: ['photo_library'],
    riskPolicy: 'inherit',
    fallbackPackIds: ['assistant_ops'],
  },
  {
    id: 'modeling_delivery',
    displayName: '建模交付',
    intentHints: ['建模', '3d', '2d转3d', '导出模型', '写回'],
    applicableTabs: ['home', 'agent', 'community', 'profile'],
    defaultStrategy: 'quality',
    toolChain: ['navigation::navigate_tab', 'convert::start_task', 'file::write', 'community::create_draft'],
    requiredContext: ['context.modeling.image'],
    requiredPermissions: ['photo_library', 'file_write'],
    riskPolicy: 'strict',
    fallbackPackIds: ['assistant_ops'],
  },
  {
    id: 'community_publish',
    displayName: '社区发布',
    intentHints: ['社区', '发帖', '草稿', '发布', '动态'],
    applicableTabs: ['home', 'agent', 'community', 'profile'],
    defaultStrategy: 'quality',
    toolChain: ['navigation::navigate_tab', 'community::create_draft', 'community::publish_draft'],
    requiredContext: ['context.community.draftId'],
    requiredPermissions: [],
    riskPolicy: 'strict',
    fallbackPackIds: ['assistant_ops'],
  },
  {
    id: 'assistant_ops',
    displayName: '助手操作',
    intentHints: ['总结', '页面', '导航', '权限', '登录', '设置'],
    applicableTabs: ['home', 'agent', 'community', 'profile'],
    defaultStrategy: 'fast',
    toolChain: [
      'navigation::navigate_tab',
      'app::summarize_current_page',
      'permission::request',
      'auth::require_login',
      'settings::open',
      'settings::apply_patch',
      'file::pick',
      'file::write',
    ],
    requiredContext: [],
    requiredPermissions: [],
    riskPolicy: 'inherit',
    fallbackPackIds: [],
  },
  {
    id: 'export_delivery',
    displayName: '导出交付',
    intentHints: ['导出', '下载', '保存', '写回相册', '交付'],
    applicableTabs: ['home', 'agent', 'community', 'profile'],
    defaultStrategy: 'quality',
    toolChain: ['navigation::navigate_tab', 'convert::start_task', 'file::write'],
    requiredContext: ['context.modeling.image'],
    requiredPermissions: ['file_write', 'photo_library_write'],
    riskPolicy: 'strict',
    fallbackPackIds: ['modeling_delivery', 'assistant_ops'],
  },
  {
    id: 'batch_grading',
    displayName: '批量调色',
    intentHints: ['批量调色', '多图调色', '批处理调色', '批量优化'],
    applicableTabs: ['home', 'agent', 'community', 'profile'],
    defaultStrategy: 'fast',
    toolChain: ['navigation::navigate_tab', 'file::pick', 'grading::apply_visual_suggest', 'file::write'],
    requiredContext: ['context.color.image'],
    requiredPermissions: ['photo_library', 'file_write'],
    riskPolicy: 'inherit',
    fallbackPackIds: ['grading_workflow', 'assistant_ops'],
  },
  {
    id: 'batch_modeling',
    displayName: '批量建模',
    intentHints: ['批量建模', '多任务建模', '批处理建模'],
    applicableTabs: ['home', 'agent', 'community', 'profile'],
    defaultStrategy: 'quality',
    toolChain: ['navigation::navigate_tab', 'file::pick', 'convert::start_task', 'file::write'],
    requiredContext: ['context.modeling.image'],
    requiredPermissions: ['photo_library', 'file_write'],
    riskPolicy: 'strict',
    fallbackPackIds: ['modeling_delivery', 'assistant_ops'],
  },
  {
    id: 'ops_growth',
    displayName: '运营流程',
    intentHints: ['运营', '增长', '排队发布', '多帖发布', '内容运营'],
    applicableTabs: ['home', 'agent', 'community', 'profile'],
    defaultStrategy: 'quality',
    toolChain: ['navigation::navigate_tab', 'community::create_draft', 'community::publish_draft'],
    requiredContext: ['context.community.draftId'],
    requiredPermissions: [],
    riskPolicy: 'strict',
    fallbackPackIds: ['community_publish'],
  },
  {
    id: 'asset_cleanup',
    displayName: '产物整理',
    intentHints: ['整理产物', '清理', '归档', '整理文件'],
    applicableTabs: ['home', 'agent', 'community', 'profile'],
    defaultStrategy: 'cost',
    toolChain: ['navigation::navigate_tab', 'app::summarize_current_page', 'file::write', 'settings::open'],
    requiredContext: [],
    requiredPermissions: ['file_write'],
    riskPolicy: 'inherit',
    fallbackPackIds: ['assistant_ops'],
  },
  {
    id: 'review_summary',
    displayName: '复盘总结',
    intentHints: ['复盘', '总结结果', '分析流程', '回顾'],
    applicableTabs: ['home', 'agent', 'community', 'profile'],
    defaultStrategy: 'fast',
    toolChain: ['app::summarize_current_page', 'navigation::navigate_tab'],
    requiredContext: [],
    requiredPermissions: [],
    riskPolicy: 'inherit',
    fallbackPackIds: ['assistant_ops'],
  },
]);

const VALID_STRATEGIES = new Set(['fast', 'quality', 'cost']);

const normalizeStrategy = value => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return VALID_STRATEGIES.has(raw) ? raw : null;
};

const extractPreferenceStrategy = memory => {
  const preferred = normalizeStrategy(memory?.userPreferences?.preferredExecutionStrategy);
  return preferred;
};

const keywordScore = (goal, hints) => {
  const text = String(goal || '').toLowerCase();
  return (Array.isArray(hints) ? hints : []).reduce((sum, hint) => {
    const key = String(hint || '').toLowerCase().trim();
    if (!key) {
      return sum;
    }
    return text.includes(key) ? sum + 1 : sum;
  }, 0);
};

const detectQualitySignals = ({goal = '', actions = []}) => {
  const text = String(goal || '').toLowerCase();
  const multiStage = new Set(
    (Array.isArray(actions) ? actions : []).map(item => String(item?.stage || '').trim()).filter(Boolean),
  ).size > 1;
  const includesPublish = (Array.isArray(actions) ? actions : []).some(
    item => item?.domain === 'community' && item?.operation === 'publish_draft',
  );
  const includesConvert = (Array.isArray(actions) ? actions : []).some(
    item => item?.domain === 'convert' && item?.operation === 'start_task',
  );
  const highComplexityWord = ['闭环', '全流程', '完整', '高质量', '精细'].some(word => text.includes(word));
  return multiStage || includesPublish || includesConvert || highComplexityWord;
};

const detectCostSignals = ({memory = null}) => {
  const outcomes = Array.isArray(memory?.taskOutcomes) ? memory.taskOutcomes : [];
  if (outcomes.length === 0) {
    return false;
  }
  const last = outcomes.slice(0, 12);
  const failed = last.filter(item => item?.status === 'failed').length;
  const timeout = last.filter(item => String(item?.errorCode || '').includes('timeout')).length;
  return failed >= 5 || timeout >= 3;
};

const detectFrequentRepeatSignals = ({memory = null}) => {
  const outcomes = Array.isArray(memory?.taskOutcomes) ? memory.taskOutcomes : [];
  if (outcomes.length < 6) {
    return false;
  }
  const recent = outcomes.slice(0, 15).filter(item => item?.status === 'applied');
  if (recent.length < 5) {
    return false;
  }
  const fingerprintCount = {};
  for (const item of recent) {
    const fp = `${String(item?.topResultCardKind || '')}:${String(item?.status || '')}`;
    fingerprintCount[fp] = Number(fingerprintCount[fp] || 0) + 1;
  }
  return Object.values(fingerprintCount).some(value => Number(value) >= 5);
};

const chooseExecutionStrategyWithSource = ({requestedStrategy, memory, goal, actions}) => {
  const explicit = normalizeStrategy(requestedStrategy);
  if (explicit) {
    return {
      strategy: explicit,
      source: 'user',
    };
  }
  const preferred = extractPreferenceStrategy(memory);
  if (preferred) {
    return {
      strategy: preferred,
      source: 'memory',
    };
  }
  if (detectCostSignals({memory})) {
    return {
      strategy: 'cost',
      source: 'adaptive',
    };
  }
  if (detectQualitySignals({goal, actions})) {
    return {
      strategy: 'quality',
      source: 'adaptive',
    };
  }
  if (detectFrequentRepeatSignals({memory})) {
    return {
      strategy: 'fast',
      source: 'adaptive',
    };
  }
  return {
    strategy: 'fast',
    source: 'adaptive',
  };
};

const chooseExecutionStrategy = input => chooseExecutionStrategyWithSource(input).strategy;

const scoreSkillPacks = ({goal, currentTab, actions = []}) => {
  const actionSet = new Set(
    (Array.isArray(actions) ? actions : []).map(item => `${String(item?.domain || '')}::${String(item?.operation || '')}`),
  );
  return PACKS.map(pack => {
    const hint = keywordScore(goal, pack.intentHints);
    const tabBonus =
      Array.isArray(pack.applicableTabs) && pack.applicableTabs.includes(String(currentTab || '').trim())
        ? 1
        : 0;
    const toolMatches = (Array.isArray(pack.toolChain) ? pack.toolChain : []).reduce(
      (sum, key) => (actionSet.has(key) ? sum + 1 : sum),
      0,
    );
    const score = Number((hint * 2 + tabBonus + toolMatches * 1.5).toFixed(3));
    return {
      id: pack.id,
      score,
    };
  }).sort((a, b) => b.score - a.score);
};

const selectSkillPacks = ({goal, currentTab, actions = []}) => {
  const candidates = scoreSkillPacks({goal, currentTab, actions});
  const primaryId = candidates[0]?.score > 0 ? candidates[0].id : 'assistant_ops';
  const primary = PACKS.find(pack => pack.id === primaryId) || PACKS.find(pack => pack.id === 'assistant_ops');
  const fallbackCandidates = candidates.filter(item => item.id !== primaryId && item.score > 1.4).slice(0, 2);
  const aux = fallbackCandidates
    .map(item => PACKS.find(pack => pack.id === item.id))
    .filter(Boolean);
  return {
    primary,
    aux,
    candidates: candidates.slice(0, 5),
  };
};

const selectSkillPack = ({goal, currentTab, actions = []}) => {
  const selected = selectSkillPacks({goal, currentTab, actions});
  return {
    selected: selected.primary,
    candidates: selected.candidates,
  };
};

const filterActionsBySkillPacks = ({actions = [], primarySkillPack, auxSkillPacks = []}) => {
  const safeActions = Array.isArray(actions) ? actions : [];
  const chains = [primarySkillPack, ...(Array.isArray(auxSkillPacks) ? auxSkillPacks : [])]
    .filter(Boolean)
    .flatMap(item => (Array.isArray(item.toolChain) ? item.toolChain : []));
  if (chains.length === 0) {
    return safeActions;
  }
  const allowed = new Set(chains);
  const filtered = safeActions.filter(item =>
    allowed.has(`${String(item?.domain || '')}::${String(item?.operation || '')}`),
  );
  return filtered.length > 0 ? filtered : safeActions;
};

const filterActionsBySkillPack = ({actions = [], skillPack}) =>
  filterActionsBySkillPacks({
    actions,
    primarySkillPack: skillPack,
    auxSkillPacks: [],
  });

const buildSubtaskGraph = ({actions = [], primarySkillPack, auxSkillPacks = []}) => {
  const safeActions = Array.isArray(actions) ? actions : [];
  const primaryId = String(primarySkillPack?.id || 'assistant_ops');
  const auxList = Array.isArray(auxSkillPacks) ? auxSkillPacks : [];
  const pickPackIdForAction = actionKey => {
    for (const pack of auxList) {
      if (Array.isArray(pack?.toolChain) && pack.toolChain.includes(actionKey)) {
        return String(pack.id || primaryId);
      }
    }
    if (Array.isArray(primarySkillPack?.toolChain) && primarySkillPack.toolChain.includes(actionKey)) {
      return primaryId;
    }
    return primaryId;
  };
  return safeActions.map((action, index) => {
    const actionId = String(action?.actionId || action?.id || `a${index + 1}`);
    const actionKey = `${String(action?.domain || '')}::${String(action?.operation || '')}`;
    const packId = pickPackIdForAction(actionKey);
    const belongsPack = PACKS.find(item => String(item.id) === packId);
    const dependsOn = Array.isArray(action?.dependsOn)
      ? action.dependsOn.filter(item => typeof item === 'string' && item.trim())
      : [];
    return {
      nodeId: `node_${index + 1}_${actionId}`,
      packId,
      actionId,
      dependsOn,
      resumable: action?.toolMeta?.resumable !== false,
      fallbackRef: Array.isArray(belongsPack?.fallbackPackIds) && belongsPack.fallbackPackIds[0]
        ? String(belongsPack.fallbackPackIds[0])
        : undefined,
      riskPolicy: String(belongsPack?.riskPolicy || 'inherit'),
    };
  });
};

module.exports = {
  AGENT_SKILL_PACKS: PACKS,
  normalizeStrategy,
  chooseExecutionStrategy,
  chooseExecutionStrategyWithSource,
  scoreSkillPacks,
  selectSkillPack,
  selectSkillPacks,
  filterActionsBySkillPack,
  filterActionsBySkillPacks,
  buildSubtaskGraph,
};
