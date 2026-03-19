export type AssistantUiState =
  | 'S0_hidden'
  | 'S1_collapsed'
  | 'S2_remind'
  | 'S3_focus'
  | 'S4_dragging'
  | 'S5_half'
  | 'S6_full'
  | 'S7_thinking'
  | 'S8_talking'
  | 'S9_done'
  | 'S10_sleep';

export type AssistantRuntimePanelMode = 'hidden' | 'half' | 'full';

export type AssistantAvatarState =
  | 'idle'
  | 'remind'
  | 'focus'
  | 'thinking'
  | 'talking'
  | 'success'
  | 'sleep';

export type AssistantScenePage = 'home' | 'capture' | 'editor' | 'works';

export type AssistantSceneTrigger =
  | 'page_enter'
  | 'idle_timeout'
  | 'task_completed'
  | 'task_failed'
  | 'image_imported'
  | 'camera_open'
  | 'manual';

export interface AssistantSceneEvent {
  id: string;
  page: AssistantScenePage;
  trigger: AssistantSceneTrigger;
  timestamp: number;
  payload?: Record<string, unknown>;
}

export interface AssistantTriggerRule {
  id: string;
  page: AssistantScenePage;
  trigger: AssistantSceneTrigger;
  text: string;
  style: 'gentle' | 'professional' | 'lively';
  priority: number;
  cooldownMs: number;
  action: 'open_half' | 'open_full' | 'run_quick_optimize' | 'none';
  activeNightMode?: boolean;
}

export interface AssistantFrequencyState {
  lastShownAtByRule: Record<string, number>;
  lastShownAtByPage: Record<string, number>;
  ignoreCountByRule: Record<string, number>;
  shownCountByRule: Record<string, number>;
}

export interface AvatarAssetDescriptor {
  id: string;
  name: string;
  provider: string;
  modelAssetUri: string;
  thumbnailAssetUri: string;
  rendererPageUri: string;
}

export interface AvatarRendererMessage {
  type: 'loaded' | 'error' | 'tap' | 'motion_done';
  message?: string;
}

export interface AvatarRendererCommand {
  type: 'state';
  state: AssistantAvatarState;
}
