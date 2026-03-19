import {
  createEmptyAssistantFrequencyState,
  markRuleIgnored,
  markRuleShown,
  shouldTriggerRule,
} from '../../src/assistant/frequency';
import type {AssistantTriggerRule} from '../../src/assistant/types';

const sampleRule: AssistantTriggerRule = {
  id: 'rule_a',
  page: 'home',
  trigger: 'page_enter',
  text: 'hello',
  style: 'gentle',
  priority: 100,
  cooldownMs: 30000,
  action: 'open_half',
};

describe('assistant frequency control', () => {
  it('enforces page and rule cooldown windows', () => {
    const t0 = 100000;
    const state0 = createEmptyAssistantFrequencyState();
    expect(shouldTriggerRule(state0, t0, sampleRule)).toBe(true);

    const state1 = markRuleShown(state0, sampleRule, t0);
    expect(shouldTriggerRule(state1, t0 + 5000, sampleRule)).toBe(false);
    expect(shouldTriggerRule(state1, t0 + 31000, sampleRule)).toBe(true);
  });

  it('stops triggering after repeated ignores', () => {
    let state = createEmptyAssistantFrequencyState();
    state = markRuleIgnored(state, sampleRule.id);
    state = markRuleIgnored(state, sampleRule.id);
    state = markRuleIgnored(state, sampleRule.id);
    expect(shouldTriggerRule(state, 200000, sampleRule)).toBe(false);
  });
});
