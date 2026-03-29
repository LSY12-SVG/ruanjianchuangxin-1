const {
  AGENT_SKILL_PACKS,
  chooseExecutionStrategy,
  selectSkillPack,
  filterActionsBySkillPack,
} = require('../../backend/src/agentSkillPacks');

describe('agent skill packs', () => {
  test('includes v1 packs', () => {
    const ids = AGENT_SKILL_PACKS.map(item => item.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'creative_pipeline',
        'grading_workflow',
        'modeling_delivery',
        'community_publish',
        'assistant_ops',
      ]),
    );
  });

  test('selects creative pipeline for multi stage creation goal', () => {
    const selected = selectSkillPack({
      goal: '先调色再建模最后发社区',
      currentTab: 'agent',
      actions: [
        {domain: 'grading', operation: 'apply_visual_suggest'},
        {domain: 'convert', operation: 'start_task'},
        {domain: 'community', operation: 'publish_draft'},
      ],
    });
    expect(selected.selected.id).toBe('creative_pipeline');
  });

  test('prefers explicit strategy over memory and adaptive', () => {
    const strategy = chooseExecutionStrategy({
      requestedStrategy: 'fast',
      memory: {userPreferences: {preferredExecutionStrategy: 'cost'}},
      goal: '闭环发布',
      actions: [{stage: 'grading'}, {stage: 'convert'}],
    });
    expect(strategy).toBe('fast');
  });

  test('filters actions by selected skill pack toolChain', () => {
    const pack = AGENT_SKILL_PACKS.find(item => item.id === 'grading_workflow');
    const filtered = filterActionsBySkillPack({
      actions: [
        {domain: 'grading', operation: 'apply_visual_suggest'},
        {domain: 'convert', operation: 'start_task'},
      ],
      skillPack: pack,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({domain: 'grading', operation: 'apply_visual_suggest'});
  });
});
