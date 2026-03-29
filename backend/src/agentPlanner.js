const {buildWorkflowActions} = require('./agentIntentCompiler');
const {createPlanningSummary} = require('./agentPlanSummaryService');
const {augmentPlanActions} = require('./agentPlannerAugmentService');
const {
  chooseExecutionStrategyWithSource,
  selectSkillPacks,
  filterActionsBySkillPacks,
  normalizeStrategy,
  buildSubtaskGraph,
} = require('./agentSkillPacks');

const capabilityKey = (domain, operation) => `${domain}::${operation}`;

const toCapabilitySet = capabilities =>
  new Set(
    (Array.isArray(capabilities) ? capabilities : [])
      .filter(item => item && typeof item.domain === 'string' && typeof item.operation === 'string')
      .map(item => capabilityKey(item.domain, item.operation)),
  );

const toActionLabel = action => {
  const key = `${String(action?.domain || '').trim()}::${String(action?.operation || '').trim()}`;
  if (key === 'navigation::navigate_tab') {
    return '页面跳转';
  }
  if (key === 'grading::apply_visual_suggest') {
    return '执行首轮调色';
  }
  if (key === 'convert::start_task') {
    return '启动建模任务';
  }
  if (key === 'community::create_draft') {
    return '创建社区草稿';
  }
  if (key === 'community::publish_draft') {
    return '发布社区内容';
  }
  if (key === 'app::summarize_current_page') {
    return '总结当前页面';
  }
  return `${String(action?.domain || 'app')}.${String(action?.operation || 'action')}`;
};

const buildDecisionTrace = ({goal, currentTab, compiled, actions, selectedSkillPack, auxPacks, executionStrategy, strategySource, memoryApplied}) => {
  const traces = [];
  traces.push({
    step: 'intent_compile',
    reason:
      typeof compiled?.reasoning === 'string' && compiled.reasoning.trim()
        ? compiled.reasoning.trim()
        : `结合当前页面(${currentTab || 'agent'})进行意图编译`,
    confidence: Number(compiled?.confidence || 0.5),
  });

  const stageText =
    Array.isArray(compiled?.detectedStages) && compiled.detectedStages.length > 0
      ? compiled.detectedStages.join(' -> ')
      : 'fallback';
  traces.push({
    step: 'stage_plan',
    reason: `阶段规划: ${stageText}，共 ${Array.isArray(actions) ? actions.length : 0} 步`,
    confidence:
      Array.isArray(compiled?.detectedStages) && compiled.detectedStages.length > 0 ? 0.78 : 0.52,
  });

  traces.push({
    step: 'skill_pack_route',
    reason: `主包 ${selectedSkillPack || 'assistant_ops'}${Array.isArray(auxPacks) && auxPacks.length ? ` + 辅包 ${auxPacks.join(',')}` : ''}，执行策略 ${executionStrategy}（${strategySource}）。`,
    confidence: 0.74,
  });

  if (memoryApplied?.preferences || memoryApplied?.outcomes) {
    traces.push({
      step: 'memory_injection',
      reason: `已注入记忆(${memoryApplied.preferences ? '偏好' : ''}${
        memoryApplied.preferences && memoryApplied.outcomes ? '+' : ''
      }${memoryApplied.outcomes ? '结果' : ''})以优化参数和顺序。`,
      confidence: 0.71,
    });
  }

  const firstBusinessAction = (Array.isArray(actions) ? actions : []).find(
    item => !(item?.domain === 'navigation' && item?.operation === 'navigate_tab'),
  );
  if (firstBusinessAction) {
    traces.push({
      step: 'next_action',
      reason: `优先动作: ${toActionLabel(firstBusinessAction)}`,
      confidence: 0.73,
    });
  }

  if (typeof goal === 'string' && goal.trim()) {
    traces.push({
      step: 'goal_alignment',
      reason: '动作顺序已对齐用户目标，并保留高风险确认门禁。',
      confidence: 0.76,
    });
  }

  return traces.slice(0, 6);
};

const planAgentActions = async request => {
  const goal = String(request?.intent?.goal || '').trim();
  const currentTab = request.currentTab || 'agent';
  const capSet = toCapabilitySet(request?.capabilities);
  const planId = `plan_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const userMemory = request?.userMemory && typeof request.userMemory === 'object' ? request.userMemory : null;
  const memoryApplied = {
    preferences: Boolean(userMemory?.userPreferences && Object.keys(userMemory.userPreferences).length > 0),
    outcomes: Array.isArray(userMemory?.taskOutcomes) && userMemory.taskOutcomes.length > 0,
  };

  const compiled = buildWorkflowActions({
    goal,
    currentTab,
    planId,
    capSet,
  });
  const ruleActions = Array.isArray(compiled.actions) ? compiled.actions : [];

  const selectedPacks = selectSkillPacks({
    goal,
    currentTab,
    actions: ruleActions,
  });
  const selectedSkillPack = selectedPacks.primary?.id || 'assistant_ops';
  const selectedAuxSkillPacks = (Array.isArray(selectedPacks.aux) ? selectedPacks.aux : [])
    .map(item => String(item?.id || '').trim())
    .filter(Boolean);
  const strategyDecision = chooseExecutionStrategyWithSource({
    requestedStrategy: normalizeStrategy(request?.executionStrategy),
    memory: userMemory,
    goal,
    actions: ruleActions,
  });
  const executionStrategy = strategyDecision.strategy;
  const strategySource = strategyDecision.source;

  const skillFilteredActions = filterActionsBySkillPacks({
    actions: ruleActions,
    primarySkillPack: selectedPacks.primary,
    auxSkillPacks: selectedPacks.aux,
  });

  const inputSource = request?.inputSource === 'voice' ? 'voice' : 'text';
  const augmentPromise = augmentPlanActions({
    goal,
    currentTab,
    actions: skillFilteredActions,
    historyContext: request?.pageSnapshot,
    knownMissingContexts: skillFilteredActions.flatMap(action =>
      Array.isArray(action?.preconditions) ? action.preconditions : [],
    ),
    executionStrategy,
    userMemory,
    selectedSkillPack,
  }).catch(() => null);

  const summaryPromise = createPlanningSummary({
    goal,
    currentTab,
    inputSource,
    actions: skillFilteredActions,
    compilerReasoning: compiled.reasoning,
    workflowMode: compiled.mode,
  }).catch(() => ({
    reasoningSummary: '',
    summarySource: 'rule',
  }));

  const [augmented, summary] = await Promise.all([augmentPromise, summaryPromise]);

  let actions = skillFilteredActions;
  if (Array.isArray(augmented?.actions) && augmented.actions.length > 0) {
    actions = augmented.actions;
  }

  const subtaskGraph = buildSubtaskGraph({
    actions,
    primarySkillPack: selectedPacks.primary,
    auxSkillPacks: selectedPacks.aux,
  });

  return {
    planId,
    plannerSource: 'cloud',
    actions,
    reasoningSummary: summary.reasoningSummary,
    summarySource: summary.summarySource,
    clarificationRequired: compiled.clarificationRequired === true,
    clarificationQuestion: compiled.clarificationQuestion || undefined,
    decisionTrace: buildDecisionTrace({
      goal,
      currentTab,
      compiled,
      actions,
      selectedSkillPack,
      auxPacks: selectedAuxSkillPacks,
      executionStrategy,
      strategySource,
      memoryApplied,
    }),
    selectedSkillPack,
    selectedAuxSkillPacks,
    candidateSkillPacks: selectedPacks.candidates,
    subtaskGraph,
    memoryApplied,
    strategySource,
    executionStrategy,
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
