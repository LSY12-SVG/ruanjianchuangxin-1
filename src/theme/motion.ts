export type MotionPresetKey =
  | 'pageEnter'
  | 'cardStagger'
  | 'fabMorph'
  | 'heroParallax';

export const MOTION_PRESETS: Record<MotionPresetKey, {duration: number; delay?: number}> = {
  pageEnter: {duration: 520},
  cardStagger: {duration: 460, delay: 90},
  fabMorph: {duration: 280},
  heroParallax: {duration: 600},
};
