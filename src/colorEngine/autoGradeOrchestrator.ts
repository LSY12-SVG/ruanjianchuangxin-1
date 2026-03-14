import {useCallback, useRef, useState} from 'react';
import type {ColorGradingParams} from '../types/colorGrading';
import type {
  AutoGradeReport,
  AutoGradeResult,
  AutoGradeStatus,
  LocalMaskLayer,
} from '../types/colorEngine';
import {requestAutoGrade} from './autoGradeService';
import {applyVoiceInterpretation} from '../voice/paramApplier';
import type {VoiceImageContext} from '../voice/imageContext';
import type {ImagePickerResult} from '../hooks/useImagePicker';
import type {InterpretResponse} from '../voice/types';
import {SKIN_SAFE_CLAMP} from './autoGradeService';

interface RunAutoGradeInput {
  image: ImagePickerResult;
  imageContext: VoiceImageContext;
  currentParams: ColorGradingParams;
  currentMasks: LocalMaskLayer[];
  locale: string;
  endpoint?: string;
}

interface AutoGradeSnapshot {
  params: ColorGradingParams;
  masks: LocalMaskLayer[];
}

interface UseAutoGradeOrchestratorOptions {
  onApply: (params: ColorGradingParams, masks: LocalMaskLayer[]) => void;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const applyLocalSafetyClamp = (masks: LocalMaskLayer[]): LocalMaskLayer[] =>
  masks.map(mask => {
    if (mask.type !== 'skin') {
      return mask;
    }
    return {
      ...mask,
      adjustments: {
        ...mask.adjustments,
        saturation: clamp(
          mask.adjustments.saturation,
          SKIN_SAFE_CLAMP.saturation.min,
          SKIN_SAFE_CLAMP.saturation.max,
        ),
        temperature: clamp(
          mask.adjustments.temperature,
          SKIN_SAFE_CLAMP.temperature.min,
          SKIN_SAFE_CLAMP.temperature.max,
        ),
        clarity: clamp(
          mask.adjustments.clarity,
          SKIN_SAFE_CLAMP.clarity.min,
          SKIN_SAFE_CLAMP.clarity.max,
        ),
      },
    };
  });

const mergeMaskPlans = (
  baseMasks: LocalMaskLayer[],
  nextMasks: LocalMaskLayer[],
): LocalMaskLayer[] => {
  const brushMasks = baseMasks.filter(mask => mask.type === 'brush');
  const nextByType = new Map(nextMasks.map(mask => [mask.type, mask]));
  const merged: LocalMaskLayer[] = [];

  baseMasks.forEach(mask => {
    if (mask.type === 'brush') {
      return;
    }
    const updated = nextByType.get(mask.type);
    if (updated) {
      merged.push(updated);
      nextByType.delete(mask.type);
      return;
    }
    merged.push(mask);
  });

  nextByType.forEach(mask => {
    if (mask.type !== 'brush') {
      merged.push(mask);
    }
  });

  return [...merged, ...brushMasks];
};

const hasPreviewDelta = (
  prevParams: ColorGradingParams,
  nextParams: ColorGradingParams,
  prevMasks: LocalMaskLayer[],
  nextMasks: LocalMaskLayer[],
): boolean => {
  try {
    return (
      JSON.stringify(prevParams) !== JSON.stringify(nextParams) ||
      JSON.stringify(prevMasks) !== JSON.stringify(nextMasks)
    );
  } catch {
    return true;
  }
};

const toInterpretLike = (result: AutoGradeResult): InterpretResponse => ({
  actions: result.globalActions as never,
  confidence: result.confidence,
  needsConfirmation: false,
  fallbackUsed: result.fallbackUsed,
  reasoningSummary: result.explanation,
  message: result.explanation,
  source: result.fallbackUsed ? 'fallback' : 'cloud',
  analysisSummary: result.explanation,
  appliedProfile: result.sceneProfile,
  sceneProfile: result.sceneProfile,
  qualityRiskFlags: result.qualityRiskFlags,
  recommendedIntensity: 'normal' as const,
});

export const useAutoGradeOrchestrator = ({
  onApply,
}: UseAutoGradeOrchestratorOptions) => {
  const [status, setStatus] = useState<AutoGradeStatus>('idle');
  const [report, setReport] = useState<AutoGradeReport | null>(null);
  const [firstAutoGradeAppliedAt, setFirstAutoGradeAppliedAt] = useState<string | null>(null);
  const [firstAutoGradeUndoToken, setFirstAutoGradeUndoToken] = useState<string | null>(null);
  const snapshotRef = useRef<AutoGradeSnapshot | null>(null);
  const runTokenRef = useRef(0);

  const runAutoGrade = useCallback(
    async (input: RunAutoGradeInput): Promise<AutoGradeResult | null> => {
      if (!input.image.success) {
        return null;
      }
      if (status === 'analyzing' || status === 'applying') {
        return null;
      }

      setStatus('analyzing');
      const runToken = Date.now();
      runTokenRef.current = runToken;
      let fastResult: AutoGradeResult;
      try {
        fastResult = await requestAutoGrade(
          {
            mode: 'upload_autograde',
            phase: 'fast',
            locale: input.locale,
            currentParams: input.currentParams,
              image: {
                uri: input.image.uri,
                mimeType: input.imageContext.cloudPayloads.fast.mimeType,
                width: input.imageContext.cloudPayloads.fast.width,
                height: input.imageContext.cloudPayloads.fast.height,
                // Fast phase is driven by image stats + cloud heuristics to keep SLA stable.
                // Refine phase still uploads preview base64 for higher-quality model guidance.
                base64: '',
                payloadBytes: 0,
                encodeQuality: input.imageContext.cloudPayloads.fast.encodeQuality,
                maxEdgeApplied: input.imageContext.cloudPayloads.fast.maxEdgeApplied,
              },
              imageStats: input.imageContext.imageStats,
            },
          input.endpoint,
        );
      } catch (error) {
        if (runTokenRef.current !== runToken) {
          return null;
        }
        setStatus('failed');
        setReport({
          phase: 'fast',
          sceneProfile: 'general',
          qualityRiskFlags: [],
          explanation: '自动调色失败，请稍后重试。',
          fallbackUsed: true,
          fallbackReason: 'unknown',
          refineApplied: false,
          refineFallbackReason: 'unknown',
          cloudState: 'offline',
          endpoint: undefined,
          lockedEndpoint: undefined,
        latencyMs: 0,
        nextRecoveryAction: 'retry_in_background',
        phaseTimeoutMs: undefined,
        phaseBudgetMs: undefined,
        payloadBytes: undefined,
        encodeQuality: undefined,
      });
        console.warn('auto grade orchestrator failed:', error);
        return null;
      }

      setStatus('applying');
      if (runTokenRef.current !== runToken) {
        return null;
      }
      const before: AutoGradeSnapshot = {
        params: JSON.parse(JSON.stringify(input.currentParams)) as ColorGradingParams,
        masks: JSON.parse(JSON.stringify(input.currentMasks)) as LocalMaskLayer[],
      };
      const fastParams = applyVoiceInterpretation(input.currentParams, toInterpretLike(fastResult));
      const brushMasks = input.currentMasks.filter(mask => mask.type === 'brush');
      const fastMasks = applyLocalSafetyClamp([...fastResult.localMaskPlan, ...brushMasks]);
      onApply(fastParams, fastMasks);

      const now = new Date().toISOString();
      const undoToken = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      snapshotRef.current = before;
      setFirstAutoGradeAppliedAt(now);
      setFirstAutoGradeUndoToken(undoToken);
      setReport({
        phase: 'fast',
        sceneProfile: fastResult.sceneProfile,
        qualityRiskFlags: fastResult.qualityRiskFlags,
        explanation: fastResult.explanation,
        fallbackUsed: fastResult.fallbackUsed,
        fallbackReason: fastResult.fallbackReason,
        refineApplied: false,
        cloudState: fastResult.cloudState,
        endpoint: fastResult.endpoint,
        lockedEndpoint: fastResult.lockedEndpoint,
        latencyMs: fastResult.latencyMs,
        nextRecoveryAction: fastResult.nextRecoveryAction,
        phaseTimeoutMs: fastResult.phaseTimeoutMs,
        phaseBudgetMs: fastResult.phaseBudgetMs,
        payloadBytes: fastResult.payloadBytes,
        encodeQuality: fastResult.encodeQuality,
      });
      setStatus(fastResult.fallbackUsed ? 'degraded' : 'refining');
      console.log(
        '[auto-grade]',
        JSON.stringify({
          phase: 'fast',
          autoGradeStatus: fastResult.fallbackUsed ? 'degraded' : 'completed',
          cloudState: fastResult.cloudState,
          fallbackReason: fastResult.fallbackReason || '',
          sceneProfile: fastResult.sceneProfile,
          latencyMs: fastResult.latencyMs,
          fallbackUsed: fastResult.fallbackUsed,
          endpoint: fastResult.endpoint || '',
          lockedEndpoint: fastResult.lockedEndpoint || '',
          nextRecoveryAction: fastResult.nextRecoveryAction,
          phaseTimeoutMs: fastResult.phaseTimeoutMs || 0,
          phaseBudgetMs: fastResult.phaseBudgetMs || 0,
          payloadBytes: fastResult.payloadBytes || 0,
          encodeQuality: fastResult.encodeQuality || 0,
          mimeType: fastResult.mimeType || '',
          modelUsed: fastResult.modelUsed || '',
          modelRoute: fastResult.modelRoute || '',
          globalActionCount: fastResult.globalActions.length,
          localMaskCount: fastResult.localMaskPlan.length,
          appliedToPreview: true,
        }),
      );

      if (fastResult.fallbackUsed) {
        return fastResult;
      }

      if (!input.imageContext.cloudPayloads.refine.base64) {
        setReport({
          phase: 'refine',
          sceneProfile: fastResult.sceneProfile,
          qualityRiskFlags: fastResult.qualityRiskFlags,
          explanation: 'refine 需要预览图数据，当前设备仅保留 fast 首版。',
          fallbackUsed: false,
          refineApplied: false,
          refineFallbackReason: 'bad_payload',
          cloudState: fastResult.cloudState,
          endpoint: fastResult.endpoint,
          lockedEndpoint: fastResult.lockedEndpoint,
          latencyMs: fastResult.latencyMs,
          nextRecoveryAction: 'retry_in_background',
        });
        setStatus('completed');
        return fastResult;
      }

      void (async () => {
        try {
          const refineResult = await requestAutoGrade(
            {
              mode: 'upload_autograde',
              phase: 'refine',
              locale: input.locale,
              currentParams: fastParams,
              image: {
                uri: input.image.uri,
                mimeType: input.imageContext.cloudPayloads.refine.mimeType,
                width: input.imageContext.cloudPayloads.refine.width,
                height: input.imageContext.cloudPayloads.refine.height,
                base64: input.imageContext.cloudPayloads.refine.base64,
                payloadBytes: input.imageContext.cloudPayloads.refine.payloadBytes,
                encodeQuality: input.imageContext.cloudPayloads.refine.encodeQuality,
                maxEdgeApplied: input.imageContext.cloudPayloads.refine.maxEdgeApplied,
              },
              imageStats: input.imageContext.imageStats,
            },
            input.endpoint,
          );

          if (runTokenRef.current !== runToken) {
            return;
          }

          const hasRefineOps =
            refineResult.globalActions.length > 0 || refineResult.localMaskPlan.length > 0;

          if (!hasRefineOps) {
            setReport({
              phase: 'refine',
              sceneProfile: fastResult.sceneProfile,
              qualityRiskFlags: fastResult.qualityRiskFlags,
              explanation: refineResult.explanation,
              fallbackUsed: refineResult.fallbackUsed,
              refineApplied: false,
              refineFallbackReason: refineResult.fallbackReason,
              cloudState: refineResult.cloudState,
              endpoint: refineResult.endpoint,
              lockedEndpoint: refineResult.lockedEndpoint,
              latencyMs: refineResult.latencyMs,
              nextRecoveryAction: refineResult.nextRecoveryAction,
              phaseTimeoutMs: refineResult.phaseTimeoutMs,
              phaseBudgetMs: refineResult.phaseBudgetMs,
              payloadBytes: refineResult.payloadBytes,
              encodeQuality: refineResult.encodeQuality,
            });
            setStatus(refineResult.fallbackUsed ? 'degraded' : 'completed');
            console.log(
              '[auto-grade]',
              JSON.stringify({
                phase: 'refine',
                autoGradeStatus: refineResult.fallbackUsed ? 'degraded' : 'completed',
                cloudState: refineResult.cloudState,
                fallbackReason: refineResult.fallbackReason || '',
                sceneProfile: fastResult.sceneProfile,
                latencyMs: refineResult.latencyMs,
                fallbackUsed: refineResult.fallbackUsed,
                endpoint: refineResult.endpoint || '',
                lockedEndpoint: refineResult.lockedEndpoint || '',
                nextRecoveryAction: refineResult.nextRecoveryAction,
                phaseTimeoutMs: refineResult.phaseTimeoutMs || 0,
                phaseBudgetMs: refineResult.phaseBudgetMs || 0,
                payloadBytes: refineResult.payloadBytes || 0,
                encodeQuality: refineResult.encodeQuality || 0,
                mimeType: refineResult.mimeType || '',
                modelUsed: refineResult.modelUsed || '',
                modelRoute: refineResult.modelRoute || '',
                globalActionCount: refineResult.globalActions.length,
                localMaskCount: refineResult.localMaskPlan.length,
                appliedToPreview: false,
              }),
            );
            return;
          }

          const refinedParams = applyVoiceInterpretation(fastParams, toInterpretLike(refineResult));
          const refinedMasks = applyLocalSafetyClamp(
            mergeMaskPlans(fastMasks, refineResult.localMaskPlan),
          );
          const previewChanged = hasPreviewDelta(fastParams, refinedParams, fastMasks, refinedMasks);
          onApply(refinedParams, refinedMasks);
          setReport({
            phase: 'refine',
            sceneProfile: refineResult.sceneProfile || fastResult.sceneProfile,
            qualityRiskFlags: Array.from(
              new Set([...fastResult.qualityRiskFlags, ...refineResult.qualityRiskFlags]),
            ),
            explanation: previewChanged
              ? refineResult.explanation
              : `${refineResult.explanation}（refine 结果与当前参数一致）`,
            fallbackUsed: refineResult.fallbackUsed,
            refineApplied: previewChanged,
            refineFallbackReason: refineResult.fallbackUsed ? refineResult.fallbackReason : undefined,
            cloudState: refineResult.cloudState,
            endpoint: refineResult.endpoint,
            lockedEndpoint: refineResult.lockedEndpoint,
            latencyMs: refineResult.latencyMs,
            nextRecoveryAction: refineResult.nextRecoveryAction,
            phaseTimeoutMs: refineResult.phaseTimeoutMs,
            phaseBudgetMs: refineResult.phaseBudgetMs,
            payloadBytes: refineResult.payloadBytes,
            encodeQuality: refineResult.encodeQuality,
          });
          setStatus(refineResult.fallbackUsed ? 'degraded' : 'completed');
          console.log(
            '[auto-grade]',
            JSON.stringify({
              phase: 'refine',
              autoGradeStatus: refineResult.fallbackUsed ? 'degraded' : 'completed',
              cloudState: refineResult.cloudState,
              fallbackReason: refineResult.fallbackReason || '',
              sceneProfile: refineResult.sceneProfile || fastResult.sceneProfile,
              latencyMs: refineResult.latencyMs,
              fallbackUsed: refineResult.fallbackUsed,
              endpoint: refineResult.endpoint || '',
              lockedEndpoint: refineResult.lockedEndpoint || '',
              nextRecoveryAction: refineResult.nextRecoveryAction,
              phaseTimeoutMs: refineResult.phaseTimeoutMs || 0,
              phaseBudgetMs: refineResult.phaseBudgetMs || 0,
              payloadBytes: refineResult.payloadBytes || 0,
              encodeQuality: refineResult.encodeQuality || 0,
              mimeType: refineResult.mimeType || '',
              modelUsed: refineResult.modelUsed || '',
              modelRoute: refineResult.modelRoute || '',
              globalActionCount: refineResult.globalActions.length,
              localMaskCount: refineResult.localMaskPlan.length,
              appliedToPreview: previewChanged,
            }),
          );
        } catch (error) {
          if (runTokenRef.current !== runToken) {
            return;
          }
          setReport({
            phase: 'refine',
            sceneProfile: fastResult.sceneProfile,
            qualityRiskFlags: fastResult.qualityRiskFlags,
            explanation: 'refine 请求失败，已保留 fast 首版。',
            fallbackUsed: false,
            refineApplied: false,
            refineFallbackReason: 'unknown',
            cloudState: 'degraded',
            endpoint: undefined,
            lockedEndpoint: undefined,
            latencyMs: 0,
            nextRecoveryAction: 'retry_with_backoff',
            phaseTimeoutMs: undefined,
            phaseBudgetMs: undefined,
            payloadBytes: undefined,
            encodeQuality: undefined,
          });
          setStatus('completed');
          console.warn('auto grade refine failed:', error);
        }
      })();

      return fastResult;
    },
    [onApply, status],
  );

  const undoFirstAutoGrade = useCallback(() => {
    if (!snapshotRef.current) {
      return false;
    }
    onApply(snapshotRef.current.params, snapshotRef.current.masks);
    snapshotRef.current = null;
    setFirstAutoGradeUndoToken(null);
    setStatus('idle');
    return true;
  }, [onApply]);

  const resetAutoGradeState = useCallback(() => {
    runTokenRef.current += 1;
    snapshotRef.current = null;
    setReport(null);
    setStatus('idle');
    setFirstAutoGradeAppliedAt(null);
    setFirstAutoGradeUndoToken(null);
  }, []);

  return {
    status,
    report,
    firstAutoGradeAppliedAt,
    firstAutoGradeUndoToken,
    runAutoGrade,
    undoFirstAutoGrade,
    resetAutoGradeState,
  };
};
