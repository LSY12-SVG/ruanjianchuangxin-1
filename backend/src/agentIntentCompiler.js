const {resolveActionToolRef} = require('./agentToolRefs');

const STAGE_ORDER = ['grading', 'convert', 'community'];

const hasAny = (text, words) => words.some(word => text.includes(word));
const indexOfAny = (text, words) => {
  let min = Number.POSITIVE_INFINITY;
  for (const word of words) {
    const index = text.indexOf(word);
    if (index >= 0 && index < min) {
      min = index;
    }
  }
  return Number.isFinite(min) ? min : -1;
};

const keywordGroups = {
  grading: [
    '调色',
    '修色',
    '色彩优化',
    '调一下颜色',
    '照片优化',
    '美颜',
    '电影感',
    '风格',
    '色调',
    '润色',
    '美化',
    '优化图片',
    '调成',
    '修图',
    '高级感',
    '清透',
    'hdr',
    'grade',
    'optimize',
    'color',
    'cinematic',
    'grade',
    'retouch',
  ],
  convert: [
    '建模',
    '3d',
    '2d转3d',
    '模型',
    '重建',
    '出模型',
    '三维建模',
    'mesh',
    'convert',
    '三维',
    '立体',
    'modeling',
  ],
  community: [
    '社区',
    '发帖',
    '帖子',
    '分享',
    '发布',
    '发社区',
    '发到社区',
    '发动态',
    'po到社区',
    '草稿',
    'post',
    'publish',
    'community',
    '动态',
    '作品',
  ],
  publish: ['发布', '上线', '发出去', 'publish', 'post now', '直接发', '现在发', '公开'],
  draft: ['草稿', 'draft', '初稿', '文案'],
  sequencing: ['然后', '接着', '最后', '再', '并且', 'and then', '下一步', '随后', '顺便'],
  ambiguous: ['高级一点', '好看一点', '优化一下', '处理一下', '弄一下', '帮我搞定', '随便调', '你看着办'],
};

const buildClarification = ({
  goal,
  wantsGrading,
  wantsConvert,
  wantsCommunity,
  wantsPublish,
  stageCount,
}) => {
  const lowered = String(goal || '').trim().toLowerCase();
  const looksAmbiguous = hasAny(lowered, keywordGroups.ambiguous);
  if (!looksAmbiguous) {
    return {
      clarificationRequired: false,
      clarificationQuestion: null,
      confidence: stageCount >= 1 ? 0.82 : 0.45,
    };
  }

  const needsHighRiskConfirmHint = wantsCommunity && wantsPublish;
  if (needsHighRiskConfirmHint) {
    return {
      clarificationRequired: true,
      clarificationQuestion: '检测到“发布”请求，发布动作会进入确认门禁。是否按“先生成草稿，再待确认发布”继续？',
      confidence: 0.62,
    };
  }

  if (stageCount === 1 && (wantsGrading || wantsConvert || wantsCommunity)) {
    return {
      clarificationRequired: false,
      clarificationQuestion: null,
      confidence: 0.7,
    };
  }

  return {
    clarificationRequired: false,
    clarificationQuestion: null,
    confidence: stageCount === 0 ? 0.48 : 0.74,
  };
};

const detectWorkflowIntent = ({goal, currentTab}) => {
  const lowered = String(goal || '').trim().toLowerCase();
  const compact = lowered.replace(/\s+/g, '');
  const wantsGrading = hasAny(lowered, keywordGroups.grading) || hasAny(compact, keywordGroups.grading);
  const wantsConvert = hasAny(lowered, keywordGroups.convert) || hasAny(compact, keywordGroups.convert);
  const wantsPublish = hasAny(lowered, keywordGroups.publish);
  const wantsDraft = hasAny(lowered, keywordGroups.draft);
  const wantsCommunity =
    hasAny(lowered, keywordGroups.community) ||
    hasAny(compact, keywordGroups.community) ||
    wantsPublish ||
    wantsDraft;
  const wantsFullPipeline =
    hasAny(lowered, ['三段式', '全流程', '完整流程', '一条龙', '闭环']) &&
    (wantsGrading || wantsConvert || wantsCommunity);
  const hasSequenceHint = hasAny(lowered, keywordGroups.sequencing);
  const stageCount =
    Number(wantsGrading) + Number(wantsConvert) + Number(wantsCommunity);
  const clarification = buildClarification({
    goal,
    wantsGrading,
    wantsConvert,
    wantsCommunity,
    wantsPublish,
    stageCount,
  });

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

  if (wantsFullPipeline) {
    return {
      mode: 'workflow',
      detectedStages: ['grading', 'convert', 'community'],
      publishRequested: true,
      draftRequested: true,
      hasSequenceHint: true,
      clarificationRequired: false,
      clarificationQuestion: null,
      confidence: 0.9,
      reasoning: '命中全流程意图，按 调色 -> 建模 -> 社区 执行。',
    };
  }

  if (detectedStages.length === 0) {
    return {
      mode: 'fallback',
      detectedStages: [],
      publishRequested: false,
      draftRequested: false,
      hasSequenceHint,
      clarificationRequired: clarification.clarificationRequired,
      clarificationQuestion: clarification.clarificationQuestion,
      confidence: clarification.confidence,
      reasoning: `未命中多阶段关键词，回退为当前页总结（tab=${currentTab || 'agent'}）。`,
    };
  }

  const stageFirstIndex = {
    grading: Math.min(
      ...[indexOfAny(lowered, keywordGroups.grading), indexOfAny(compact, keywordGroups.grading)]
        .filter(index => index >= 0),
    ),
    convert: Math.min(
      ...[indexOfAny(lowered, keywordGroups.convert), indexOfAny(compact, keywordGroups.convert)]
        .filter(index => index >= 0),
    ),
    community: Math.min(
      ...[indexOfAny(lowered, keywordGroups.community), indexOfAny(compact, keywordGroups.community)]
        .filter(index => index >= 0),
    ),
  };
  const orderedStages = detectedStages
    .slice()
    .sort((a, b) => {
      const aIndex = Number.isFinite(stageFirstIndex[a]) ? stageFirstIndex[a] : Number.POSITIVE_INFINITY;
      const bIndex = Number.isFinite(stageFirstIndex[b]) ? stageFirstIndex[b] : Number.POSITIVE_INFINITY;
      if (aIndex === bIndex) {
        return STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b);
      }
      return aIndex - bIndex;
    });

  return {
    mode: stageCount > 1 || hasSequenceHint ? 'workflow' : 'single_stage',
    detectedStages: orderedStages,
    publishRequested: wantsPublish,
    draftRequested: wantsDraft || wantsCommunity,
    hasSequenceHint,
    clarificationRequired: clarification.clarificationRequired,
    clarificationQuestion: clarification.clarificationQuestion,
    confidence: clarification.confidence,
    reasoning: `命中阶段: ${orderedStages.join(' -> ')}，发布:${wantsPublish ? '是' : '否'}`,
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
    toolRef: resolveActionToolRef(action) || undefined,
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
  const sortedStages = Array.isArray(compiled.detectedStages) && compiled.detectedStages.length
    ? compiled.detectedStages
    : STAGE_ORDER.filter(stage => compiled.detectedStages.includes(stage));

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

  if (!actions.length) {
    const fallbackActionId = `${planId}_fallback_direct`;
    actions.push({
      actionId: fallbackActionId,
      id: fallbackActionId,
      domain: 'app',
      operation: 'summarize_current_page',
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotent: true,
      requiredScopes: ['app:read'],
      skillName: 'agent-task-planner',
      toolRef:
        resolveActionToolRef({
          domain: 'app',
          operation: 'summarize_current_page',
        }) || undefined,
      stage: 'app',
      dependsOn: [],
      preconditions: [],
    });
  }

  return {
    actions,
    detectedStages: sortedStages,
    reasoning: compiled.reasoning,
    mode: compiled.mode,
    clarificationRequired: compiled.clarificationRequired === true,
    clarificationQuestion: compiled.clarificationQuestion || null,
    confidence: Number(compiled.confidence || 0),
  };
};

module.exports = {
  detectWorkflowIntent,
  buildWorkflowActions,
};


