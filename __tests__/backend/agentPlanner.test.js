const {planAgentActions} = require('../../backend/src/agentPlanner');

describe('agent planner', () => {
  const originalPlannerEnv = {
    model: process.env.AGENT_PLANNER_MODEL,
    baseUrl: process.env.AGENT_PLANNER_BASE_URL,
    apiKey: process.env.AGENT_PLANNER_API_KEY,
    timeout: process.env.AGENT_PLANNER_TIMEOUT_MS,
  };

  afterEach(() => {
    process.env.AGENT_PLANNER_MODEL = originalPlannerEnv.model;
    process.env.AGENT_PLANNER_BASE_URL = originalPlannerEnv.baseUrl;
    process.env.AGENT_PLANNER_API_KEY = originalPlannerEnv.apiKey;
    process.env.AGENT_PLANNER_TIMEOUT_MS = originalPlannerEnv.timeout;
    delete global.fetch;
  });

  test('uses home/modeling route protocol for convert flow', async () => {
    const plan = await planAgentActions({
      intent: {goal: '帮我做3d建模'},
      currentTab: 'home',
      capabilities: [
        {domain: 'navigation', operation: 'navigate_tab'},
        {domain: 'convert', operation: 'start_task'},
      ],
    });
    expect(plan.actions.length).toBe(2);
    expect(plan.actions[0].args).toEqual({tab: 'home', route: 'modeling'});
    expect(plan.actions[1].domain).toBe('convert');
    expect(plan.actions[1].toolRef).toEqual({
      serverId: 'app-core',
      toolName: 'convert.start_task',
    });
  });

  test('filters actions by capabilities', async () => {
    const plan = await planAgentActions({
      intent: {goal: '发布社区帖子'},
      currentTab: 'community',
      capabilities: [{domain: 'navigation', operation: 'navigate_tab'}],
    });
    expect(plan.actions.length).toBe(1);
    expect(plan.actions[0].domain).toBe('navigation');
  });

  test('emits planId and plannerSource', async () => {
    const plan = await planAgentActions({
      intent: {goal: '总结当前页面'},
      currentTab: 'agent',
      capabilities: [
        {domain: 'navigation', operation: 'navigate_tab'},
        {domain: 'app', operation: 'summarize_current_page'},
      ],
    });
    expect(typeof plan.planId).toBe('string');
    expect(plan.plannerSource).toBe('cloud');
    expect(plan.actions[0].actionId).toBeTruthy();
  });

  test('builds staged workflow with preconditions and publish confirm gate', async () => {
    const plan = await planAgentActions({
      intent: {goal: '把这张图调成电影感，然后建模，最后发布社区'},
      currentTab: 'agent',
      capabilities: [
        {domain: 'navigation', operation: 'navigate_tab'},
        {domain: 'grading', operation: 'apply_visual_suggest'},
        {domain: 'convert', operation: 'start_task'},
        {domain: 'community', operation: 'create_draft'},
        {domain: 'community', operation: 'publish_draft'},
      ],
    });

    expect(plan.actions.map(item => item.stage)).toEqual(
      expect.arrayContaining(['grading', 'convert', 'community']),
    );

    const grading = plan.actions.find(
      item => item.domain === 'grading' && item.operation === 'apply_visual_suggest',
    );
    const convert = plan.actions.find(
      item => item.domain === 'convert' && item.operation === 'start_task',
    );
    const publish = plan.actions.find(
      item => item.domain === 'community' && item.operation === 'publish_draft',
    );

    expect(grading.preconditions).toEqual(expect.arrayContaining(['context.color.image']));
    expect(convert.preconditions).toEqual(expect.arrayContaining(['context.modeling.image']));
    expect(Array.isArray(convert.dependsOn)).toBe(true);
    expect(convert.dependsOn.length).toBeGreaterThan(0);
    expect(publish.riskLevel).toBe('high');
    expect(publish.requiresConfirmation).toBe(true);
    expect(publish.preconditions).toEqual(expect.arrayContaining(['context.community.draftId']));
  });

  test('builds executable pipeline for cinematic grading -> 3d -> draft with publish confirm', async () => {
    const plan = await planAgentActions({
      intent: {goal: '请把这张图先调色成电影感，再生成3D模型，最后创建社区草稿并在发布前向我确认'},
      currentTab: 'agent',
      capabilities: [
        {domain: 'navigation', operation: 'navigate_tab'},
        {domain: 'grading', operation: 'apply_visual_suggest'},
        {domain: 'convert', operation: 'start_task'},
        {domain: 'community', operation: 'create_draft'},
        {domain: 'community', operation: 'publish_draft'},
      ],
    });

    const stageOrder = plan.actions
      .map(item => item.stage)
      .filter((stage, index, arr) => arr.indexOf(stage) === index);
    expect(stageOrder.slice(0, 3)).toEqual(['grading', 'convert', 'community']);

    const publish = plan.actions.find(
      item => item.domain === 'community' && item.operation === 'publish_draft',
    );
    expect(publish).toEqual(
      expect.objectContaining({
        requiresConfirmation: true,
        riskLevel: 'high',
      }),
    );
    expect(publish.preconditions).toEqual(expect.arrayContaining(['context.community.draftId']));
  });
  test('adds inputSource to reasoning summary for observability', async () => {
    const plan = await planAgentActions({
      intent: {goal: '总结当前页面'},
      currentTab: 'agent',
      inputSource: 'voice',
      capabilities: [
        {domain: 'navigation', operation: 'navigate_tab'},
        {domain: 'app', operation: 'summarize_current_page'},
      ],
    });

    expect(typeof plan.reasoningSummary).toBe('string');
    expect(plan.reasoningSummary.length).toBeGreaterThan(0);
    expect(['model', 'rule']).toContain(plan.summarySource);
  });

  test('orders stages by utterance sequence when sequence is explicit', async () => {
    const plan = await planAgentActions({
      intent: {goal: '先建模再调色，最后发社区'},
      currentTab: 'agent',
      capabilities: [
        {domain: 'navigation', operation: 'navigate_tab'},
        {domain: 'grading', operation: 'apply_visual_suggest'},
        {domain: 'convert', operation: 'start_task'},
        {domain: 'community', operation: 'create_draft'},
      ],
    });

    const stageOrder = plan.actions
      .map(item => item.stage)
      .filter((stage, index, arr) => arr.indexOf(stage) === index);
    expect(stageOrder.slice(0, 3)).toEqual(['convert', 'grading', 'community']);
  });

  test('treats publish-only intent as community workflow', async () => {
    const plan = await planAgentActions({
      intent: {goal: '帮我直接发布这次结果'},
      currentTab: 'agent',
      capabilities: [
        {domain: 'navigation', operation: 'navigate_tab'},
        {domain: 'community', operation: 'create_draft'},
        {domain: 'community', operation: 'publish_draft'},
      ],
    });

    expect(plan.actions.some(item => item.domain === 'community' && item.operation === 'create_draft')).toBe(true);
    expect(plan.actions.some(item => item.domain === 'community' && item.operation === 'publish_draft')).toBe(true);
  });

  test('planner model can patch draft args without changing action set', async () => {
    process.env.AGENT_PLANNER_MODEL = 'planner-model';
    process.env.AGENT_PLANNER_BASE_URL = 'https://planner.example.com';
    process.env.AGENT_PLANNER_API_KEY = 'secret';
    global.fetch = jest.fn(async (_url, options) => {
      const payload = JSON.parse(options.body);
      const userPayload = JSON.parse(payload.messages[1].content);
      const draftAction = userPayload.actions.find(
        item => item.domain === 'community' && item.operation === 'create_draft',
      );
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  actionArgPatches: [
                    {
                      actionId: draftAction.actionId,
                      args: {
                        title: '电影感建模社区草稿',
                        tags: ['电影感', '3D', 'AI助手'],
                      },
                    },
                  ],
                }),
              },
            },
          ],
        }),
      };
    });

    const plan = await planAgentActions({
      intent: {goal: '把这张图调成电影感，然后建模，最后发社区'},
      currentTab: 'agent',
      capabilities: [
        {domain: 'navigation', operation: 'navigate_tab'},
        {domain: 'grading', operation: 'apply_visual_suggest'},
        {domain: 'convert', operation: 'start_task'},
        {domain: 'community', operation: 'create_draft'},
        {domain: 'community', operation: 'publish_draft'},
      ],
    });

    const draft = plan.actions.find(
      item => item.domain === 'community' && item.operation === 'create_draft',
    );
    expect(draft.args.title).toBe('电影感建模社区草稿');
    expect(draft.args.tags).toEqual(['电影感', '3D', 'AI助手']);
  });

  test('planner model accepts fenced json response', async () => {
    process.env.AGENT_PLANNER_MODEL = 'planner-model';
    process.env.AGENT_PLANNER_BASE_URL = 'https://planner.example.com';
    process.env.AGENT_PLANNER_API_KEY = 'secret';
    global.fetch = jest.fn(async (_url, options) => {
      const payload = JSON.parse(options.body);
      const userPayload = JSON.parse(payload.messages[1].content);
      const draftAction = userPayload.actions.find(
        item => item.domain === 'community' && item.operation === 'create_draft',
      );
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: `\`\`\`json\n${JSON.stringify({
                  actionArgPatches: [
                    {
                      actionId: draftAction.actionId,
                      args: {
                        title: 'fenced-json-title',
                      },
                    },
                  ],
                })}\n\`\`\``,
              },
            },
          ],
        }),
      };
    });

    const plan = await planAgentActions({
      intent: {goal: '把这张图调成电影感，然后建模，最后发社区'},
      currentTab: 'agent',
      capabilities: [
        {domain: 'navigation', operation: 'navigate_tab'},
        {domain: 'grading', operation: 'apply_visual_suggest'},
        {domain: 'convert', operation: 'start_task'},
        {domain: 'community', operation: 'create_draft'},
        {domain: 'community', operation: 'publish_draft'},
      ],
    });

    const draft = plan.actions.find(
      item => item.domain === 'community' && item.operation === 'create_draft',
    );
    expect(draft.args.title).toBe('fenced-json-title');
  });

  test('planner model failure falls back to rule actions', async () => {
    process.env.AGENT_PLANNER_MODEL = 'planner-model';
    process.env.AGENT_PLANNER_BASE_URL = 'https://planner.example.com';
    process.env.AGENT_PLANNER_API_KEY = 'secret';
    global.fetch = jest.fn(async () => {
      throw new Error('planner_down');
    });

    const plan = await planAgentActions({
      intent: {goal: '发布社区帖子'},
      currentTab: 'community',
      capabilities: [
        {domain: 'navigation', operation: 'navigate_tab'},
        {domain: 'community', operation: 'create_draft'},
      ],
    });

    expect(plan.actions).toHaveLength(2);
    expect(plan.actions[1].operation).toBe('create_draft');
  });

  test('prefers direct execution for ambiguous low-risk instruction', async () => {
    const plan = await planAgentActions({
      intent: {goal: '帮我处理一下，做得更高级一点'},
      currentTab: 'agent',
      capabilities: [
        {domain: 'navigation', operation: 'navigate_tab'},
        {domain: 'app', operation: 'summarize_current_page'},
      ],
    });

    expect(plan.clarificationRequired).toBe(false);
    expect(plan.clarificationQuestion || null).toBeNull();
  });

  test('keeps clarification hint for ambiguous high-risk publish intent', async () => {
    const plan = await planAgentActions({
      intent: {goal: '帮我处理一下然后直接发布社区'},
      currentTab: 'agent',
      capabilities: [
        {domain: 'navigation', operation: 'navigate_tab'},
        {domain: 'community', operation: 'create_draft'},
        {domain: 'community', operation: 'publish_draft'},
      ],
    });

    expect(plan.clarificationRequired).toBe(true);
    expect(typeof plan.clarificationQuestion).toBe('string');
    expect(plan.clarificationQuestion).toContain('确认');
  });

  test('guarantees a non-empty fallback action when capability mapping is sparse', async () => {
    const plan = await planAgentActions({
      intent: {goal: '请帮我做点什么'},
      currentTab: 'agent',
      capabilities: [{domain: 'settings', operation: 'open'}],
    });

    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.actions[0]).toEqual(
      expect.objectContaining({
        domain: 'app',
        operation: 'summarize_current_page',
      }),
    );
  });

  test('selects creative_pipeline and quality strategy for multi-stage goal', async () => {
    const plan = await planAgentActions({
      intent: {goal: '把这张图调色然后建模并发布社区'},
      currentTab: 'agent',
      capabilities: [
        {domain: 'navigation', operation: 'navigate_tab'},
        {domain: 'grading', operation: 'apply_visual_suggest'},
        {domain: 'convert', operation: 'start_task'},
        {domain: 'community', operation: 'create_draft'},
        {domain: 'community', operation: 'publish_draft'},
      ],
    });

    expect(plan.selectedSkillPack).toBe('creative_pipeline');
    expect(plan.executionStrategy).toBe('quality');
    expect(Array.isArray(plan.candidateSkillPacks)).toBe(true);
    expect(plan.candidateSkillPacks.length).toBeGreaterThan(0);
  });

  test('uses user preference execution strategy when available', async () => {
    const plan = await planAgentActions({
      intent: {goal: '帮我调色'},
      currentTab: 'agent',
      capabilities: [
        {domain: 'navigation', operation: 'navigate_tab'},
        {domain: 'grading', operation: 'apply_visual_suggest'},
      ],
      userMemory: {
        userPreferences: {
          preferredExecutionStrategy: 'cost',
        },
      },
    });

    expect(plan.executionStrategy).toBe('cost');
    expect(plan.memoryApplied).toEqual(
      expect.objectContaining({
        preferences: true,
      }),
    );
  });

  test('returns decision trace with bounded confidence', async () => {
    const plan = await planAgentActions({
      intent: {goal: '把这张图调成电影感然后建模'},
      currentTab: 'agent',
      capabilities: [
        {domain: 'navigation', operation: 'navigate_tab'},
        {domain: 'grading', operation: 'apply_visual_suggest'},
        {domain: 'convert', operation: 'start_task'},
      ],
    });

    expect(Array.isArray(plan.decisionTrace)).toBe(true);
    expect(plan.decisionTrace.length).toBeGreaterThan(0);
    expect(plan.decisionTrace[0]).toEqual(
      expect.objectContaining({
        step: expect.any(String),
        reason: expect.any(String),
      }),
    );
    for (const item of plan.decisionTrace) {
      if (typeof item.confidence === 'number') {
        expect(item.confidence).toBeGreaterThanOrEqual(0);
        expect(item.confidence).toBeLessThanOrEqual(1);
      }
    }
  });
});


