import type {InterpretResponse} from '../../voice/types';
import {requestApi} from './http';
import type {
  ColorAutoGradeModuleResponse,
  ColorInterpretModuleResponse,
  ColorRequestContext,
  ColorSegmentResponse,
} from './types';

const COLOR_TIMEOUT = {
  initialSuggest: 180_000,
  voiceRefine: 180_000,
  autoGradeFast: 180_000,
  autoGradeRefine: 180_000,
  segment: 180_000,
} as const;

const toInterpretResponse = (
  payload: ColorInterpretModuleResponse,
  cloudState: 'healthy' | 'degraded' = 'healthy',
): InterpretResponse => ({
  actions: Array.isArray(payload.actions) ? payload.actions : [],
  confidence: Number(payload.confidence || 0),
  needsConfirmation: Boolean(payload.needsConfirmation),
  fallbackUsed: payload.source === 'fallback',
  reasoningSummary: String(payload.reasoningSummary || ''),
  message: String(payload.message || ''),
  source: payload.source === 'fallback' ? 'fallback' : 'cloud',
  analysisSummary: payload.analysisSummary,
  appliedProfile: payload.appliedProfile,
  sceneProfile: payload.sceneProfile,
  sceneConfidence:
    typeof payload.sceneConfidence === 'number' ? payload.sceneConfidence : undefined,
  qualityRiskFlags: Array.isArray(payload.qualityRiskFlags)
    ? payload.qualityRiskFlags
    : [],
  recommendedIntensity: payload.recommendedIntensity || 'normal',
  cloudState,
});

export const colorApi = {
  async initialSuggest(input: ColorRequestContext): Promise<InterpretResponse> {
    const payload = await requestApi<ColorInterpretModuleResponse>(
      '/v1/modules/color/initial-suggest',
      {
        method: 'POST',
        timeoutMs: COLOR_TIMEOUT.initialSuggest,
        body: {
          locale: input.locale,
          transcript: '',
          currentParams: input.currentParams,
          image: input.image,
          imageStats: input.imageStats,
        },
      },
    );
    return toInterpretResponse(payload);
  },

  async voiceRefine(input: ColorRequestContext, transcript: string): Promise<InterpretResponse> {
    const payload = await requestApi<ColorInterpretModuleResponse>(
      '/v1/modules/color/voice-refine',
      {
        method: 'POST',
        timeoutMs: COLOR_TIMEOUT.voiceRefine,
        body: {
          locale: input.locale,
          transcript,
          currentParams: input.currentParams,
          image: input.image,
          imageStats: input.imageStats,
        },
      },
    );
    return toInterpretResponse(payload);
  },

  async autoGrade(
    input: ColorRequestContext,
    phase: 'fast' | 'refine',
  ): Promise<ColorAutoGradeModuleResponse> {
    return requestApi<ColorAutoGradeModuleResponse>('/v1/modules/color/pro/auto-grade', {
      method: 'POST',
      timeoutMs: phase === 'fast' ? COLOR_TIMEOUT.autoGradeFast : COLOR_TIMEOUT.autoGradeRefine,
      body: {
        mode: 'upload_autograde',
        phase,
        locale: input.locale,
        currentParams: input.currentParams,
        image: input.image,
        imageStats: input.imageStats,
      },
    });
  },

  async segment(input: ColorRequestContext): Promise<ColorSegmentResponse> {
    return requestApi<ColorSegmentResponse>('/v1/modules/color/pro/segment', {
      method: 'POST',
      timeoutMs: COLOR_TIMEOUT.segment,
      body: {
        image: input.image,
      },
    });
  },
};
