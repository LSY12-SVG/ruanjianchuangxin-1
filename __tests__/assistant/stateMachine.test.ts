import {avatarStateFromUiState, reduceAssistantUiState} from '../../src/assistant/stateMachine';

describe('assistant state machine', () => {
  it('handles key state transitions', () => {
    expect(reduceAssistantUiState('S0_hidden', 'app_ready')).toBe('S1_collapsed');
    expect(reduceAssistantUiState('S1_collapsed', 'system_remind')).toBe('S2_remind');
    expect(reduceAssistantUiState('S1_collapsed', 'user_open_half')).toBe('S5_half');
    expect(reduceAssistantUiState('S5_half', 'user_open_full')).toBe('S6_full');
    expect(reduceAssistantUiState('S6_full', 'run_start')).toBe('S7_thinking');
    expect(reduceAssistantUiState('S7_thinking', 'run_message')).toBe('S8_talking');
    expect(reduceAssistantUiState('S8_talking', 'run_done')).toBe('S9_done');
    expect(reduceAssistantUiState('S9_done', 'auto_reset')).toBe('S1_collapsed');
  });

  it('maps UI states to avatar renderer states', () => {
    expect(avatarStateFromUiState('S1_collapsed')).toBe('idle');
    expect(avatarStateFromUiState('S2_remind')).toBe('remind');
    expect(avatarStateFromUiState('S6_full')).toBe('focus');
    expect(avatarStateFromUiState('S7_thinking')).toBe('thinking');
    expect(avatarStateFromUiState('S8_talking')).toBe('talking');
    expect(avatarStateFromUiState('S9_done')).toBe('success');
    expect(avatarStateFromUiState('S10_sleep')).toBe('sleep');
  });
});
