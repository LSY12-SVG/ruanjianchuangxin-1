import type {AssistantUiState} from './types';

export type AssistantStateEvent =
  | 'app_ready'
  | 'system_remind'
  | 'user_focus'
  | 'user_drag_start'
  | 'user_drag_end'
  | 'user_open_half'
  | 'user_open_full'
  | 'user_close'
  | 'run_start'
  | 'run_message'
  | 'run_done'
  | 'run_failed'
  | 'auto_sleep'
  | 'auto_reset';

export const reduceAssistantUiState = (
  current: AssistantUiState,
  event: AssistantStateEvent,
): AssistantUiState => {
  switch (event) {
    case 'app_ready':
      return 'S1_collapsed';
    case 'system_remind':
      return current === 'S10_sleep' ? 'S2_remind' : current === 'S1_collapsed' ? 'S2_remind' : current;
    case 'user_focus':
      return 'S3_focus';
    case 'user_drag_start':
      return 'S4_dragging';
    case 'user_drag_end':
      return 'S1_collapsed';
    case 'user_open_half':
      return 'S5_half';
    case 'user_open_full':
      return 'S6_full';
    case 'user_close':
      return 'S1_collapsed';
    case 'run_start':
      return 'S7_thinking';
    case 'run_message':
      return 'S8_talking';
    case 'run_done':
      return 'S9_done';
    case 'run_failed':
      return 'S8_talking';
    case 'auto_sleep':
      return current === 'S1_collapsed' ? 'S10_sleep' : current;
    case 'auto_reset':
      return 'S1_collapsed';
    default:
      return current;
  }
};

export const avatarStateFromUiState = (
  state: AssistantUiState,
): 'idle' | 'remind' | 'focus' | 'thinking' | 'talking' | 'success' | 'sleep' => {
  if (state === 'S2_remind') {
    return 'remind';
  }
  if (state === 'S3_focus' || state === 'S4_dragging' || state === 'S5_half' || state === 'S6_full') {
    return 'focus';
  }
  if (state === 'S7_thinking') {
    return 'thinking';
  }
  if (state === 'S8_talking') {
    return 'talking';
  }
  if (state === 'S9_done') {
    return 'success';
  }
  if (state === 'S10_sleep') {
    return 'sleep';
  }
  return 'idle';
};
