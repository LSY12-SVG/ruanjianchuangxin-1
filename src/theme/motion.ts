export type MotionPresetKey =
  | 'pageEnter'
  | 'cardLift'
  | 'statusPulse'
  | 'buttonPress'
  | 'sheetTransition';

export interface MotionPreset {
  duration: number;
  delay?: number;
  fromScale?: number;
  toScale?: number;
  fromY?: number;
  toY?: number;
}

export const MOTION_PRESETS: Record<MotionPresetKey, MotionPreset> = {
  pageEnter: {
    duration: 280,
    fromY: 16,
    toY: 0,
  },
  cardLift: {
    duration: 240,
    delay: 36,
    fromY: 14,
    toY: 0,
  },
  statusPulse: {
    duration: 280,
    fromScale: 0.88,
    toScale: 1.08,
  },
  buttonPress: {
    duration: 150,
    fromScale: 1,
    toScale: 0.97,
  },
  sheetTransition: {
    duration: 280,
    fromY: 460,
    toY: 0,
  },
};

export const MOTION_LIMITS = {
  maxConcurrentLoops: 1,
} as const;
