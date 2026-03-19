import type {AssistantFrequencyState, AssistantTriggerRule} from './types';

export const ASSISTANT_PAGE_MIN_INTERVAL_MS = 15 * 1000;
export const ASSISTANT_REPEAT_LIMIT = 2;
export const ASSISTANT_IGNORE_LIMIT = 3;

export const createEmptyAssistantFrequencyState = (): AssistantFrequencyState => ({
  lastShownAtByRule: {},
  lastShownAtByPage: {},
  ignoreCountByRule: {},
  shownCountByRule: {},
});

export const shouldTriggerRule = (
  state: AssistantFrequencyState,
  nowMs: number,
  rule: AssistantTriggerRule,
): boolean => {
  const lastOnPage = state.lastShownAtByPage[rule.page] || 0;
  if (nowMs - lastOnPage < ASSISTANT_PAGE_MIN_INTERVAL_MS) {
    return false;
  }

  const lastShown = state.lastShownAtByRule[rule.id] || 0;
  if (nowMs - lastShown < rule.cooldownMs) {
    return false;
  }

  const ignored = state.ignoreCountByRule[rule.id] || 0;
  if (ignored >= ASSISTANT_IGNORE_LIMIT) {
    return false;
  }

  const shown = state.shownCountByRule?.[rule.id] || 0;
  if (shown >= ASSISTANT_REPEAT_LIMIT) {
    return false;
  }

  return true;
};

export const markRuleShown = (
  state: AssistantFrequencyState,
  rule: AssistantTriggerRule,
  nowMs: number,
): AssistantFrequencyState => ({
  ...state,
  lastShownAtByRule: {
    ...state.lastShownAtByRule,
    [rule.id]: nowMs,
  },
  shownCountByRule: {
    ...state.shownCountByRule,
    [rule.id]: (state.shownCountByRule?.[rule.id] || 0) + 1,
  },
  lastShownAtByPage: {
    ...state.lastShownAtByPage,
    [rule.page]: nowMs,
  },
});

export const markRuleIgnored = (
  state: AssistantFrequencyState,
  ruleId: string,
): AssistantFrequencyState => ({
  ...state,
  ignoreCountByRule: {
    ...state.ignoreCountByRule,
    [ruleId]: (state.ignoreCountByRule[ruleId] || 0) + 1,
  },
});

export const resetRuleIgnored = (
  state: AssistantFrequencyState,
  ruleId: string,
): AssistantFrequencyState => {
  const next = {...state.ignoreCountByRule};
  delete next[ruleId];
  return {
    ...state,
    ignoreCountByRule: next,
  };
};
