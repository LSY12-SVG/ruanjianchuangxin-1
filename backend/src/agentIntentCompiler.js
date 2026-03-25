const STAGE_ORDER = ['grading', 'convert', 'community'];

const hasAny = (text, words) => words.some(word => text.includes(word));

const keywordGroups = {
  grading: [
    '调色',
    '电影感',
    '风格',
    '色调',
    '润色',
    '美化',
    '优化图片',
    'optimize',
    'color',
    'cinematic',
  ],
  convert: ['建模', '3d', '2d转3d', '模型', '重建', 'mesh', 'convert'],
  community: ['社区', '发帖', '帖子', '分享', '发布', '草稿', 'post', 'publish', 'community'],
  publish: ['发布', '上线', '发出去', 'publish', 'post now', '直接发'],
  draft: ['草稿', 'draft', '初稿', '文案'],
  sequencing: ['然后', '接着', '最后', '再', '并且', 'and then'],
};

const detectWorkflowIntent = ({goal, currentTab}) => {
  const lowered = String(goal || '').trim().toLowerCase();
  const wantsGrading = hasAny(lowered, keywordGroups.grading);
  const wantsConvert = hasAny(lowered, keywordGroups.convert);
  const wantsCommunity = hasAny(lowered, keywordGroups.community);
  const wantsPublish = hasAny(lowered, keywordGroups.publish);
  const wantsDraft = wantsCommunity || hasAny(lowered, keywordGroups.draft);
  const hasSequenceHint = hasAny(lowered, keywordGroups.sequencing);
  const stageCount =
    Number(wantsGrading) + Number(wantsConvert) + Number(wantsCommunity);

  const detectedStages = [];
  if (wantsGrading) {
    detectedStages.push('grading');
  }
  if (wantsConvert) {
    detectedStages.push('convert');
  }
  if (wantsCommunity) {
    detectedStages.push('community');
  }

  if (detectedStages.length === 0) {
    return {
      mode: 'fallback',
      detectedStages: [],
      publishRequested: false,
      draftRequested: false,
      hasSequenceHint,
      reasoning: `未命中多阶段关键词，回退为当前页总结（tab=${currentTab || 'agent'}）。`,
    };
  }

  return {
    mode: stageCount > 1 || hasSequenceHint ? 'workflow' : 'single_stage',
    detectedStages,
    publishRequested: wantsPublish,
    draftRequested: wantsDraft,
    hasSequenceHint,
    reasoning: `命中阶段: ${detectedStages.join(' -> ')}`,
  };
};

const addAction = ({actions, capSet, planId, suffix, action, stage, dependsOn, preconditions}) => {
  const key = `${action.domain}::${action.operation}`;
  if (!capSet.has(key)) {
    return null;
  }
  const actionId = `${planId}_${suffix}`;
  const nextAction = {
    ...action,
    actionId,
    id: actionId,
    stage,
    dependsOn: Array.isArray(dependsOn) ? dependsOn.filter(Boolean) : [],
    preconditions: Array.isArray(preconditions) ? preconditions.filter(Boolean) : [],
  };
  actions.push(nextAction);
  return nextAction;
};

const buildWorkflowActions = ({
  goal,
  currentTab,
  planId,
  capSet,
}) => {
  const compiled = detectWorkflowIntent({goal, currentTab});
  const actions = [];
  const sortedStages = STAGE_ORDER.filter(stage => compiled.detectedStages.includes(stage));

  let previousTerminalActionId = null;

  for (const stage of sortedStages) {
    if (stage === 'grading') {
      addAction({
        actions,
        capSet,
        planId,
        suffix: 'grading_nav',
        stage: 'grading',
        dependsOn: previousTerminalActionId ? [previousTerminalActionId] : [],
        action: {
          domain: 'navigation',
          operation: 'navigate_tab',
          args: {tab: 'home', route: 'grading'},
          riskLevel: 'low',
          requiresConfirmation: false,
          idempotent: true,
          requiredScopes: ['app:navigate'],
          skillName: 'agent-tool-router',
        },
      });

      const gradingAction = addAction({
        actions,
        capSet,
        planId,
        suffix: 'grading_apply',
        stage: 'grading',
        dependsOn: actions.length ? [actions[actions.length - 1].actionId] : [],
        preconditions: ['context.color.image'],
        action: {
          domain: 'grading',
          operation: 'apply_visual_suggest',
          riskLevel: 'low',
          requiresConfirmation: false,
          idempotent: false,
          requiredScopes: ['grading:write'],
          skillName: 'agent-task-planner',
        },
      });
      previousTerminalActionId = gradingAction?.actionId || previousTerminalActionId;
      continue;
    }

    if (stage === 'convert') {
      addAction({
        actions,
        capSet,
        planId,
        suffix: 'convert_nav',
        stage: 'convert',
        dependsOn: previousTerminalActionId ? [previousTerminalActionId] : [],
        action: {
          domain: 'navigation',
          operation: 'navigate_tab',
          args: {tab: 'home', route: 'modeling'},
          riskLevel: 'low',
          requiresConfirmation: false,
          idempotent: true,
          requiredScopes: ['app:navigate'],
          skillName: 'agent-tool-router',
        },
      });
      const convertAction = addAction({
        actions,
        capSet,
        planId,
        suffix: 'convert_start',
        stage: 'convert',
        dependsOn: actions.length ? [actions[actions.length - 1].actionId] : [],
        preconditions: ['context.modeling.image'],
        action: {
          domain: 'convert',
          operation: 'start_task',
          args: {level: 'balanced'},
          riskLevel: 'medium',
          requiresConfirmation: true,
          idempotent: false,
          requiredScopes: ['convert:write'],
          skillName: 'agent-permission-gate',
        },
      });
      previousTerminalActionId = convertAction?.actionId || previousTerminalActionId;
      continue;
    }

    if (stage === 'community') {
      addAction({
        actions,
        capSet,
        planId,
        suffix: 'community_nav',
        stage: 'community',
        dependsOn: previousTerminalActionId ? [previousTerminalActionId] : [],
        action: {
          domain: 'navigation',
          operation: 'navigate_tab',
          args: {tab: 'community'},
          riskLevel: 'low',
          requiresConfirmation: false,
          idempotent: true,
          requiredScopes: ['app:navigate'],
          skillName: 'agent-tool-router',
        },
      });

      const createDraftAction = addAction({
        actions,
        capSet,
        planId,
        suffix: 'community_draft',
        stage: 'community',
        dependsOn: actions.length ? [actions[actions.length - 1].actionId] : [],
        action: {
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
        },
      });

      const shouldPublish = compiled.publishRequested;
      if (shouldPublish) {
        const publishAction = addAction({
          actions,
          capSet,
          planId,
          suffix: 'community_publish',
          stage: 'community',
          dependsOn: createDraftAction?.actionId ? [createDraftAction.actionId] : [],
          preconditions: ['context.community.draftId'],
          action: {
            domain: 'community',
            operation: 'publish_draft',
            riskLevel: 'high',
            requiresConfirmation: true,
            idempotent: false,
            requiredScopes: ['community:publish'],
            skillName: 'agent-permission-gate',
          },
        });
        previousTerminalActionId = publishAction?.actionId || createDraftAction?.actionId || previousTerminalActionId;
      } else {
        previousTerminalActionId = createDraftAction?.actionId || previousTerminalActionId;
      }
    }
  }

  if (!actions.length) {
    addAction({
      actions,
      capSet,
      planId,
      suffix: 'fallback_nav',
      stage: 'app',
      action: {
        domain: 'navigation',
        operation: 'navigate_tab',
        args: {tab: currentTab || 'agent'},
        riskLevel: 'low',
        requiresConfirmation: false,
        idempotent: true,
        requiredScopes: ['app:navigate'],
        skillName: 'agent-tool-router',
      },
    });
    addAction({
      actions,
      capSet,
      planId,
      suffix: 'fallback_summary',
      stage: 'app',
      dependsOn: actions.length ? [actions[actions.length - 1].actionId] : [],
      action: {
        domain: 'app',
        operation: 'summarize_current_page',
        riskLevel: 'low',
        requiresConfirmation: false,
        idempotent: true,
        requiredScopes: ['app:read'],
        skillName: 'agent-task-planner',
      },
    });
  }

  return {
    actions,
    detectedStages: sortedStages,
    reasoning: compiled.reasoning,
    mode: compiled.mode,
  };
};

module.exports = {
  detectWorkflowIntent,
  buildWorkflowActions,
};
