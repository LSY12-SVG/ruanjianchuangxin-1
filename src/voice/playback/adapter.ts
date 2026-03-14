export interface VoicePlaybackAdapter {
  isAvailable: boolean;
  speak: (text: string, options?: {locale?: string; pitch?: number; rate?: number}) => Promise<void>;
  stop: () => Promise<void>;
}

export const NoopPlaybackAdapter: VoicePlaybackAdapter = {
  isAvailable: false,
  speak: async () => {
    // Reserved for future TTS integration.
  },
  stop: async () => {
    // Reserved for future TTS integration.
  },
};
