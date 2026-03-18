import type {VoiceControllableParam} from '../types/colorGrading';
import type {
  AutoGradeAction,
  AutoGradeRequest,
  AutoGradeResult,
  CloudFallbackReason,
  LocalMaskLayer,
} from '../types/colorEngine';
import {requestCloudJson} from '../cloud/endpointResolver';
import {fallbackSegmentationResult, toLocalMaskLayers} from './segmentationService';

export interface AutoGradePhaseRuntime {
  timeoutMs: number;
  totalBudgetMs: number;
  retries: number;
}

export const AUTO_GRADE_PHASE_RUNTIME: Record<'fast' | 'refine', AutoGradePhaseRuntime> = {
  fast: {
    timeoutMs: 5000,
    totalBudgetMs: 5500,
    retries: 0,
  },
  refine: {
    timeoutMs: 50000,
    totalBudgetMs: 50000,
    retries: 0,
  },
};

export const SKIN_SAFE_CLAMP = {
  saturation: {min: -8, max: 6},
  temperature: {min: -6, max: 8},
  clarity: {min: -4, max: 8},
} as const;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const toAction = (raw: unknown): AutoGradeAction | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const action = String(value.action || '').trim();
  const target = String(value.target || '').trim();
  if (!action || !target) {
    return null;
  }
  if (action === 'set_param') {
    const amount = Number(value.value);
    if (!Number.isFinite(amount)) {
      return null;
    }
    return {
      action: 'set_param',
      target: target as VoiceControllableParam,
      value: amount,
    };
  }
  if (action === 'adjust_param') {
    const amount = Number(value.delta);
    if (!Number.isFinite(amount)) {
      return null;
    }
    return {
      action: 'adjust_param',
      target: target as VoiceControllableParam,
      delta: amount,
    };
  }
  if (action === 'apply_style') {
    const style = String(value.style || '').trim();
    if (!style) {
      return null;
    }
    return {
      action: 'apply_style',
      target: 'style',
      style,
      strength: Number.isFinite(Number(value.strength)) ? Number(value.strength) : 1,
    };
  }
  if (action === 'reset') {
    return {action: 'reset', target: 'style'};
  }
  return null;
};

const buildFallbackGlobalActions = (
  request: AutoGradeRequest,
  reason?: CloudFallbackReason,
): AutoGradeAction[] => {
  const stats = request.imageStats;
  const actions: AutoGradeAction[] = [];
  if (stats.lumaMean < 0.22) {
    actions.push({action: 'adjust_param', target: 'exposure', delta: 0.22});
    actions.push({action: 'adjust_param', target: 'shadows', delta: 16});
  } else if (stats.lumaMean > 0.78) {
    actions.push({action: 'adjust_param', target: 'exposure', delta: -0.18});
    actions.push({action: 'adjust_param', target: 'highlights', delta: -18});
  } else {
    actions.push({action: 'adjust_param', target: 'contrast', delta: 8});
  }
  if (stats.saturationMean < 0.2) {
    actions.push({action: 'adjust_param', target: 'vibrance', delta: 10});
  } else if (stats.saturationMean > 0.62) {
    actions.push({action: 'adjust_param', target: 'saturation', delta: -10});
  }
  if (stats.highlightClipPct > 0.07) {
    actions.push({action: 'adjust_param', target: 'whites', delta: -10});
  }
  if (stats.shadowClipPct > 0.1) {
    actions.push({action: 'adjust_param', target: 'blacks', delta: 8});
  }
  if (!actions.length) {
    actions.push({
      action: 'apply_style',
      target: 'style',
      style: reason === 'timeout' ? 'portrait_clean' : 'fresh_bright',
      strength: 0.85,
    });
  }
  return actions;
};

const applyFallbackMaskSafety = (layers: LocalMaskLayer[]): LocalMaskLayer[] =>
  layers.map(layer => {
    if (layer.type !== 'skin') {
      return {
        ...layer,
        recommendedBy: 'heuristic_fallback',
      };
    }
    return {
      ...layer,
      recommendedBy: 'heuristic_fallback',
      adjustments: {
        ...layer.adjustments,
        saturation: clamp(
          layer.adjustments.saturation,
          SKIN_SAFE_CLAMP.saturation.min,
          SKIN_SAFE_CLAMP.saturation.max,
        ),
        temperature: clamp(
          layer.adjustments.temperature,
          SKIN_SAFE_CLAMP.temperature.min,
          SKIN_SAFE_CLAMP.temperature.max,
        ),
        clarity: clamp(
          layer.adjustments.clarity,
          SKIN_SAFE_CLAMP.clarity.min,
          SKIN_SAFE_CLAMP.clarity.max,
        ),
      },
    };
  });

const toNumberOrUndefined = (value: unknown): number | undefined => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const getRequestPayloadDiagnostics = (request: AutoGradeRequest) => ({
  payloadBytes: toNumberOrUndefined(request.image.payloadBytes),
  encodeQuality: toNumberOrUndefined(request.image.encodeQuality),
  mimeType: request.image.mimeType,
  maxEdgeApplied: toNumberOrUndefined(request.image.maxEdgeApplied),
});

const resolveRecoveryActionForFallbackReason = (reason?: CloudFallbackReason): string => {
  switch (reason) {
    case 'timeout':
      return 'retry_with_backoff';
    case 'host_unreachable':
      return 'verify_adb_reverse_or_lan_host';
    case 'dns_error':
      return 'check_dns_or_hostname';
    case 'auth_error':
      return 'check_model_api_credentials';
    case 'http_5xx':
      return 'wait_or_switch_backup_model';
    case 'bad_payload':
      return 'check_backend_payload_schema';
    case 'model_unavailable':
      return 'check_model_catalog_or_id';
    default:
      return 'retry_in_background';
  }
};

export const requestAutoGrade = async (
  request: AutoGradeRequest,
  endpoint?: string,
): Promise<AutoGradeResult> => {
  const phase = request.phase || 'fast';
  const phaseRuntime = AUTO_GRADE_PHASE_RUNTIME[phase];
  const isFastPhase = phase === 'fast';
  const payloadDiagnostics = getRequestPayloadDiagnostics(request);
  const cloudResult = await requestCloudJson<unknown>({
    servicePath: '/v1/color/auto-grade',
    explicitEndpoint: endpoint,
    method: 'POST',
    body: {
      ...request,
      phase,
    },
    phase,
    timeoutMs: phaseRuntime.timeoutMs,
    retries: phaseRuntime.retries,
    healthTimeoutMs: 700,
    totalBudgetMs: phaseRuntime.totalBudgetMs,
  });

  if (!cloudResult.ok || !cloudResult.data || typeof cloudResult.data !== 'object') {
    if (!isFastPhase) {
      return {
        phase,
        sceneProfile: 'general',
        confidence: 0.45,
        globalActions: [],
        localMaskPlan: [],
        qualityRiskFlags: [],
        explanation: 'refine 未在预算内完成，已保留 fast 首版结果。',
        fallbackUsed: true,
        fallbackReason: cloudResult.fallbackReason,
        cloudState: cloudResult.cloudState,
        latencyMs: cloudResult.latencyMs,
        endpoint: cloudResult.endpoint,
        lockedEndpoint: cloudResult.lockedEndpoint,
        nextRecoveryAction: cloudResult.nextRecoveryAction,
        phaseTimeoutMs: phaseRuntime.timeoutMs,
        phaseBudgetMs: phaseRuntime.totalBudgetMs,
        payloadBytes: payloadDiagnostics.payloadBytes,
        encodeQuality: payloadDiagnostics.encodeQuality,
        mimeType: payloadDiagnostics.mimeType,
      };
    }

    const fallbackMasks = applyFallbackMaskSafety(
      toLocalMaskLayers(fallbackSegmentationResult(cloudResult.fallbackReason || 'unknown')),
    );
    return {
      phase,
      sceneProfile: 'general',
      confidence: 0.58,
      globalActions: buildFallbackGlobalActions(request, cloudResult.fallbackReason),
      localMaskPlan: fallbackMasks,
      qualityRiskFlags: [],
      explanation: '云端不可用，已应用本地首版保守调色方案。',
      fallbackUsed: true,
      fallbackReason: cloudResult.fallbackReason,
      cloudState: cloudResult.cloudState,
      latencyMs: cloudResult.latencyMs,
      endpoint: cloudResult.endpoint,
      lockedEndpoint: cloudResult.lockedEndpoint,
      nextRecoveryAction: cloudResult.nextRecoveryAction,
      phaseTimeoutMs: phaseRuntime.timeoutMs,
      phaseBudgetMs: phaseRuntime.totalBudgetMs,
      payloadBytes: payloadDiagnostics.payloadBytes,
      encodeQuality: payloadDiagnostics.encodeQuality,
      mimeType: payloadDiagnostics.mimeType,
    };
  }

  const payload = cloudResult.data as Record<string, unknown>;
  const payloadFallbackUsed = Boolean(payload.fallbackUsed ?? payload.fallback_used);
  const payloadFallbackReason =
    (payload.fallbackReason as CloudFallbackReason | undefined) ||
    (payload.fallback_reason as CloudFallbackReason | undefined);
  const payloadCloudStateRaw = payload.cloudState ?? payload.cloud_state;
  const payloadCloudState =
    payloadCloudStateRaw === 'healthy' ||
    payloadCloudStateRaw === 'degraded' ||
    payloadCloudStateRaw === 'offline'
      ? payloadCloudStateRaw
      : undefined;
  const payloadRecoveryAction =
    (typeof payload.nextRecoveryAction === 'string' && payload.nextRecoveryAction) ||
    (typeof payload.next_recovery_action === 'string' && payload.next_recovery_action) ||
    undefined;
  const payloadModelUsed =
    (typeof payload.modelUsed === 'string' && payload.modelUsed) ||
    (typeof payload.model_used === 'string' && payload.model_used) ||
    undefined;
  const payloadModelRoute =
    (typeof payload.modelRoute === 'string' && payload.modelRoute) ||
    (typeof payload.model_route === 'string' && payload.model_route) ||
    undefined;
  const effectiveCloudState =
    payloadCloudState ||
    (payloadFallbackUsed && cloudResult.cloudState === 'healthy' ? 'degraded' : cloudResult.cloudState);
  const effectiveRecoveryAction =
    payloadRecoveryAction ||
    (payloadFallbackUsed && payloadFallbackReason
      ? resolveRecoveryActionForFallbackReason(payloadFallbackReason)
      : cloudResult.nextRecoveryAction);
  const globalActionsRaw =
    Array.isArray(payload.globalActions) && payload.globalActions.length
      ? payload.globalActions
      : Array.isArray(payload.global_actions) && payload.global_actions.length
        ? payload.global_actions
      : Array.isArray(payload.actions)
        ? payload.actions
        : [];
  const globalActions = globalActionsRaw.map(toAction).filter(Boolean) as AutoGradeAction[];
  const localMaskPlanRaw = Array.isArray(payload.localMaskPlan)
    ? payload.localMaskPlan
    : Array.isArray(payload.local_mask_plan)
      ? payload.local_mask_plan
      : [];
  const qualityRiskFlagsRaw = Array.isArray(payload.qualityRiskFlags)
    ? payload.qualityRiskFlags
    : Array.isArray(payload.quality_risk_flags)
      ? payload.quality_risk_flags
      : [];
  const sceneProfileRaw = payload.sceneProfile ?? payload.scene_profile;
  const explanationRaw = payload.explanation ?? payload.reasoningSummary ?? payload.reasoning_summary;
  const localMaskPlan = localMaskPlanRaw.length
    ? (localMaskPlanRaw as LocalMaskLayer[]).map(layer => ({
        ...layer,
        recommendedBy: layer.recommendedBy || 'cloud_model',
      }))
    : [];

  if (!globalActions.length && !localMaskPlan.length) {
    if (!isFastPhase) {
      return {
        phase,
        sceneProfile: 'general',
        confidence: 0.45,
        globalActions: [],
        localMaskPlan: [],
        qualityRiskFlags: [],
        explanation: 'refine 返回结构异常，已跳过本次 refine。',
        fallbackUsed: true,
        fallbackReason: 'bad_payload',
        cloudState: 'degraded',
        latencyMs: cloudResult.latencyMs,
        endpoint: cloudResult.endpoint,
        lockedEndpoint: cloudResult.lockedEndpoint,
        nextRecoveryAction: cloudResult.nextRecoveryAction,
        phaseTimeoutMs: phaseRuntime.timeoutMs,
        phaseBudgetMs: phaseRuntime.totalBudgetMs,
        payloadBytes: payloadDiagnostics.payloadBytes,
        encodeQuality: payloadDiagnostics.encodeQuality,
        mimeType: payloadDiagnostics.mimeType,
      };
    }

    const fallbackMasks = applyFallbackMaskSafety(
      toLocalMaskLayers(fallbackSegmentationResult('bad_payload')),
    );
    return {
      phase,
      sceneProfile: 'general',
      confidence: 0.52,
      globalActions: buildFallbackGlobalActions(request, 'bad_payload'),
      localMaskPlan: fallbackMasks,
      qualityRiskFlags: [],
      explanation: '云端返回结构异常，已回退本地首版方案。',
      fallbackUsed: true,
      fallbackReason: 'bad_payload',
      cloudState: 'degraded',
      latencyMs: cloudResult.latencyMs,
      endpoint: cloudResult.endpoint,
      lockedEndpoint: cloudResult.lockedEndpoint,
      nextRecoveryAction: cloudResult.nextRecoveryAction,
      phaseTimeoutMs: phaseRuntime.timeoutMs,
      phaseBudgetMs: phaseRuntime.totalBudgetMs,
      payloadBytes: payloadDiagnostics.payloadBytes,
      encodeQuality: payloadDiagnostics.encodeQuality,
      mimeType: payloadDiagnostics.mimeType,
    };
  }

  return {
    phase,
    sceneProfile: String(sceneProfileRaw || 'general'),
    confidence: Number.isFinite(Number(payload.confidence)) ? Number(payload.confidence) : 0.78,
    globalActions,
    localMaskPlan,
    qualityRiskFlags: (qualityRiskFlagsRaw as string[]).map(item => String(item)),
    explanation: String(explanationRaw || '已完成上传首版智能调色。'),
    fallbackUsed: payloadFallbackUsed,
    fallbackReason: payloadFallbackReason,
    cloudState: effectiveCloudState,
    latencyMs: cloudResult.latencyMs,
    endpoint: cloudResult.endpoint,
    lockedEndpoint: cloudResult.lockedEndpoint,
    nextRecoveryAction: effectiveRecoveryAction,
    phaseTimeoutMs:
      toNumberOrUndefined(payload.phaseTimeoutMs ?? payload.phase_timeout_ms) ?? phaseRuntime.timeoutMs,
    phaseBudgetMs:
      toNumberOrUndefined(payload.phaseBudgetMs ?? payload.phase_budget_ms) ?? phaseRuntime.totalBudgetMs,
    payloadBytes:
      toNumberOrUndefined(payload.payloadBytes ?? payload.payload_bytes) ?? payloadDiagnostics.payloadBytes,
    encodeQuality:
      toNumberOrUndefined(payload.encodeQuality ?? payload.encode_quality) ?? payloadDiagnostics.encodeQuality,
    mimeType: String(payload.mimeType || payload.mime_type || payloadDiagnostics.mimeType || ''),
    modelUsed: payloadModelUsed,
    modelRoute: payloadModelRoute,
  };
};
