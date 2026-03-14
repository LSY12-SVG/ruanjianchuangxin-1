import React, {useEffect} from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {useAutoGradeOrchestrator} from '../../src/colorEngine/autoGradeOrchestrator';
import {defaultColorGradingParams} from '../../src/types/colorGrading';
import type {AutoGradeResult, LocalMaskLayer} from '../../src/types/colorEngine';
import type {ImagePickerResult} from '../../src/hooks/useImagePicker';
import type {VoiceImageContext} from '../../src/voice/imageContext';

jest.mock('../../src/colorEngine/autoGradeService', () => {
  const actual = jest.requireActual('../../src/colorEngine/autoGradeService');
  return {
    ...actual,
    requestAutoGrade: jest.fn(),
  };
});

const {requestAutoGrade} = jest.requireMock('../../src/colorEngine/autoGradeService') as {
  requestAutoGrade: jest.Mock;
};

type OrchestratorState = ReturnType<typeof useAutoGradeOrchestrator>;

interface HarnessProps {
  onReady: (state: OrchestratorState) => void;
  onApply: (params: typeof defaultColorGradingParams, masks: LocalMaskLayer[]) => void;
}

const Harness: React.FC<HarnessProps> = ({onReady, onApply}) => {
  const state = useAutoGradeOrchestrator({onApply});
  useEffect(() => {
    onReady(state);
  }, [onReady, state]);
  return null;
};

const buildResult = (partial: Partial<AutoGradeResult>): AutoGradeResult => ({
  phase: 'fast',
  sceneProfile: 'general',
  confidence: 0.8,
  globalActions: [],
  localMaskPlan: [],
  qualityRiskFlags: [],
  explanation: 'ok',
  fallbackUsed: false,
  cloudState: 'healthy',
  latencyMs: 120,
  nextRecoveryAction: 'cloud_available',
  phaseTimeoutMs: 5000,
  phaseBudgetMs: 5500,
  payloadBytes: 0,
  encodeQuality: 82,
  mimeType: 'image/jpeg',
  ...partial,
});

describe('auto grade orchestrator', () => {
  beforeEach(() => {
    requestAutoGrade.mockReset();
  });

  it('preserves refine fallbackUsed state in report', async () => {
    requestAutoGrade
      .mockResolvedValueOnce(
        buildResult({
          phase: 'fast',
          globalActions: [{action: 'adjust_param', target: 'exposure', delta: 0.2}],
        }),
      )
      .mockResolvedValueOnce(
        buildResult({
          phase: 'refine',
          fallbackUsed: true,
          fallbackReason: 'timeout',
          cloudState: 'degraded',
          explanation: 'refine timeout',
        }),
      );

    const onApply = jest.fn();
    let latestState: OrchestratorState | null = null;
    await act(async () => {
      TestRenderer.create(
        <Harness
          onApply={onApply}
          onReady={state => {
            latestState = state;
          }}
        />,
      );
    });

    const image = {
      success: true,
      uri: 'file://sample.jpg',
      width: 100,
      height: 100,
      type: 'image/jpeg',
      base64: 'ZmFrZQ==',
    } satisfies ImagePickerResult;
    const imageContext: VoiceImageContext = {
      image: {
        mimeType: 'image/jpeg',
        width: 100,
        height: 100,
        base64: 'ZmFrZQ==',
      },
      imageStats: {
        lumaMean: 0.45,
        lumaStd: 0.2,
        highlightClipPct: 0.02,
        shadowClipPct: 0.03,
        saturationMean: 0.35,
      },
      cloudPayloads: {
        fast: {
          mimeType: 'image/jpeg',
          width: 100,
          height: 100,
          base64: '',
          payloadBytes: 0,
          encodeQuality: 82,
          maxEdgeApplied: 1280,
        },
        refine: {
          mimeType: 'image/jpeg',
          width: 100,
          height: 100,
          base64: 'ZmFrZQ==',
          payloadBytes: 6,
          encodeQuality: 82,
          maxEdgeApplied: 1920,
        },
      },
    };

    await act(async () => {
      await latestState?.runAutoGrade({
        image,
        imageContext,
        currentParams: defaultColorGradingParams,
        currentMasks: [],
        locale: 'zh-CN',
      });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(latestState?.report?.phase).toBe('refine');
    expect(latestState?.report?.fallbackUsed).toBe(true);
    expect(latestState?.report?.refineApplied).toBe(false);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('applies refine result when fallbackUsed=true but refine ops exist', async () => {
    requestAutoGrade
      .mockResolvedValueOnce(
        buildResult({
          phase: 'fast',
          globalActions: [{action: 'adjust_param', target: 'exposure', delta: 0.2}],
        }),
      )
      .mockResolvedValueOnce(
        buildResult({
          phase: 'refine',
          fallbackUsed: true,
          fallbackReason: 'bad_payload',
          cloudState: 'degraded',
          explanation: 'parser fallback refine',
          globalActions: [{action: 'adjust_param', target: 'contrast', delta: 4}],
        }),
      );

    const onApply = jest.fn();
    let latestState: OrchestratorState | null = null;
    await act(async () => {
      TestRenderer.create(
        <Harness
          onApply={onApply}
          onReady={state => {
            latestState = state;
          }}
        />,
      );
    });

    const image = {
      success: true,
      uri: 'file://sample.jpg',
      width: 100,
      height: 100,
      type: 'image/jpeg',
      base64: 'ZmFrZQ==',
    } satisfies ImagePickerResult;
    const imageContext: VoiceImageContext = {
      image: {
        mimeType: 'image/jpeg',
        width: 100,
        height: 100,
        base64: 'ZmFrZQ==',
      },
      imageStats: {
        lumaMean: 0.45,
        lumaStd: 0.2,
        highlightClipPct: 0.02,
        shadowClipPct: 0.03,
        saturationMean: 0.35,
      },
      cloudPayloads: {
        fast: {
          mimeType: 'image/jpeg',
          width: 100,
          height: 100,
          base64: '',
          payloadBytes: 0,
          encodeQuality: 82,
          maxEdgeApplied: 1280,
        },
        refine: {
          mimeType: 'image/jpeg',
          width: 100,
          height: 100,
          base64: 'ZmFrZQ==',
          payloadBytes: 6,
          encodeQuality: 82,
          maxEdgeApplied: 1920,
        },
      },
    };

    await act(async () => {
      await latestState?.runAutoGrade({
        image,
        imageContext,
        currentParams: defaultColorGradingParams,
        currentMasks: [],
        locale: 'zh-CN',
      });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(latestState?.report?.phase).toBe('refine');
    expect(latestState?.report?.fallbackUsed).toBe(true);
    expect(latestState?.report?.refineApplied).toBe(true);
    expect(latestState?.report?.refineFallbackReason).toBe('bad_payload');
    expect(onApply).toHaveBeenCalledTimes(2);
  });
});
