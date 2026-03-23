import type {ColorGradingParams} from '../types/colorGrading.ts';
import type {CloudFallbackReason, CloudServiceState} from '../types/colorEngine';

export type VoiceIntentActionType =
  | 'set_param'
  | 'adjust_param'
  | 'apply_style'
  | 'reset';

export type VoiceTarget =
  | 'exposure'
  | 'brightness'
  | 'contrast'
  | 'highlights'
  | 'shadows'
  | 'whites'
  | 'blacks'
  | 'temperature'
  | 'tint'
  | 'vibrance'
  | 'saturation'
  | 'redBalance'
  | 'greenBalance'
  | 'blueBalance'
  | 'curve_master'
  | 'curve_r'
  | 'curve_g'
  | 'curve_b'
  | 'wheel_shadows'
  | 'wheel_midtones'
  | 'wheel_highlights'
  | 'style';

export type VoiceStyleTag =
  | 'cinematic_cool'
  | 'cinematic_warm'
  | 'portrait_clean'
  | 'vintage_fade'
  | 'moody_dark'
  | 'fresh_bright';

export interface VoiceIntentAction {
  action: VoiceIntentActionType;
  target: VoiceTarget;
  value?: number;
  delta?: number;
  style?: VoiceStyleTag;
  strength?: number;
}

export interface InterpretImagePayload {
  mimeType: string;
  width: number;
  height: number;
  base64: string;
}

export interface InterpretImageStats {
  lumaMean: number;
  lumaStd: number;
  highlightClipPct: number;
  shadowClipPct: number;
  saturationMean: number;
  skinPct?: number;
  skyPct?: number;
  greenPct?: number;
}

export interface InterpretRequest {
  mode?: 'initial_visual_suggest' | 'voice_refine';
  transcript: string;
  currentParams: ColorGradingParams;
  locale: string;
  sceneHints?: string[];
  image?: InterpretImagePayload;
  imageStats?: InterpretImageStats;
}

export interface InterpretResponse {
  actions: VoiceIntentAction[];
  globalBaseActions?: VoiceIntentAction[];
  sceneRefineActions?: VoiceIntentAction[];
  safetyClampActions?: VoiceIntentAction[];
  confidence: number;
  needsConfirmation: boolean;
  fallbackUsed: boolean;
  reasoningSummary: string;
  message: string;
  source: 'local' | 'cloud' | 'fallback';
  analysisSummary?: string;
  appliedProfile?: string;
  sceneProfile?: string;
  sceneConfidence?: number;
  qualityRiskFlags?: string[];
  recommendedIntensity?: 'soft' | 'normal' | 'strong';
  fallbackReason?: CloudFallbackReason;
  cloudState?: CloudServiceState;
}

export interface SpeechRecognitionResult {
  transcript: string;
  partialTranscript: string;
}

export interface VoiceAudioReadyPayload {
  uri: string;
  mimeType?: string;
  durationMs?: number;
  fileSize?: number;
}

export type VoicePipelineState =
  | 'idle'
  | 'listening'
  | 'continuous_listening'
  | 'transcribing'
  | 'parsed'
  | 'awaiting_confirm'
  | 'applying'
  | 'queue_applying'
  | 'error';

export interface PendingVoiceDecision {
  transcript: string;
  interpretation: InterpretResponse;
  previewParams: ColorGradingParams;
}

export interface SpeechRecognizerAdapter {
  start: (locale: string) => Promise<void>;
  stop: () => Promise<void>;
  destroy: () => Promise<void>;
  cleanupAudio?: (uri: string) => Promise<void>;
}
