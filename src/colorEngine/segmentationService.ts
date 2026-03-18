import type {ImagePickerResult} from '../hooks/useImagePicker';
import type {
  CloudFallbackReason,
  LocalMaskLayer,
  SegmentationResult,
  SegmentationMaskDescriptor,
} from '../types/colorEngine';
import {defaultMaskAdjustments} from '../types/colorEngine';
import {requestCloudJson} from '../cloud/endpointResolver';

interface SegmentRequest {
  image: ImagePickerResult;
  endpoint?: string;
}

const buildLayerFromMask = (mask: SegmentationMaskDescriptor): LocalMaskLayer => {
  const base = defaultMaskAdjustments();
  const normalizedStrength = Math.max(0, Math.min(1, mask.coverage * 0.85 + mask.confidence * 0.15));

  if (mask.type === 'subject') {
    base.exposure = 0.14;
    base.clarity = 8;
  } else if (mask.type === 'sky') {
    base.temperature = -8;
    base.saturation = 5;
  } else if (mask.type === 'skin') {
    base.temperature = 6;
    base.saturation = -4;
    base.denoise = 10;
  } else {
    base.saturation = -4;
    base.clarity = -3;
  }

  return {
    id: `${mask.type}_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
    type: mask.type,
    enabled: true,
    strength: normalizedStrength,
    confidence: Math.max(0, Math.min(1, mask.confidence)),
    feather: 0.35,
    density: 1,
    invert: false,
    edgeAwareRefine: 0.55,
    source: 'cloud',
    recommendedBy: 'cloud_model',
    adjustments: base,
  };
};

export const fallbackSegmentationResult = (
  reason: CloudFallbackReason = 'unknown',
): SegmentationResult => ({
  model: 'fallback-tonal-v1',
  latencyMs: 0,
  fallbackUsed: true,
  fallbackReason: reason,
  cloudState: 'offline',
  endpoint: undefined,
  nextRecoveryAction: 'retry_in_background',
  retrying: false,
  masks: [
    {type: 'subject', confidence: 0.55, coverage: 0.36},
    {type: 'sky', confidence: 0.42, coverage: 0.28},
    {type: 'skin', confidence: 0.38, coverage: 0.12},
    {type: 'background', confidence: 0.5, coverage: 0.62},
  ],
});

export const requestSegmentation = async ({
  image,
  endpoint,
}: SegmentRequest): Promise<SegmentationResult> => {
  const payload = {
    image: {
      uri: image.uri,
      width: image.width,
      height: image.height,
      type: image.type,
    },
  };

  const cloudResult = await requestCloudJson<SegmentationResult>({
    servicePath: '/v1/color/segment',
    explicitEndpoint: endpoint,
    method: 'POST',
    body: payload,
    timeoutMs: 2500,
    retries: 0,
    healthTimeoutMs: 700,
    totalBudgetMs: 3200,
  });

  if (!cloudResult.ok || !cloudResult.data) {
    console.warn(
      '[segmentation] segmentation_fallback_used',
      JSON.stringify({
        cloudState: cloudResult.cloudState,
        fallbackReason: cloudResult.fallbackReason || 'unknown',
        endpoint: cloudResult.endpoint || '',
        latencyMs: cloudResult.latencyMs,
        attempts: cloudResult.attempts,
        nextRecoveryAction: cloudResult.nextRecoveryAction,
      }),
    );
    const fallback = fallbackSegmentationResult(cloudResult.fallbackReason || 'unknown');
    fallback.cloudState = cloudResult.cloudState;
    fallback.latencyMs = cloudResult.latencyMs;
    fallback.endpoint = cloudResult.endpoint;
    fallback.nextRecoveryAction = cloudResult.nextRecoveryAction;
    fallback.retrying = cloudResult.retrying;
    return fallback;
  }

  const json = cloudResult.data;
  const masksRaw = Array.isArray(json?.masks)
    ? json.masks
    : Array.isArray((json as Record<string, unknown>)?.mask_list)
      ? ((json as Record<string, unknown>).mask_list as unknown[])
      : null;
  const modelRaw =
    (json as Record<string, unknown>)?.model ??
    (json as Record<string, unknown>)?.seg_model;
  if (!masksRaw || typeof modelRaw !== 'string') {
    const fallback = fallbackSegmentationResult('bad_payload');
    fallback.cloudState = 'degraded';
    fallback.endpoint = cloudResult.endpoint;
    fallback.latencyMs = cloudResult.latencyMs;
    fallback.nextRecoveryAction = cloudResult.nextRecoveryAction;
    fallback.retrying = cloudResult.retrying;
    return fallback;
  }

  return {
    model: modelRaw,
    latencyMs: Number(
      (json as Record<string, unknown>).latencyMs ||
        (json as Record<string, unknown>).latency_ms ||
        cloudResult.latencyMs ||
        0,
    ),
    fallbackUsed: Boolean(
      (json as Record<string, unknown>).fallbackUsed ??
        (json as Record<string, unknown>).fallback_used,
    ),
    fallbackReason:
      ((json as Record<string, unknown>).fallbackReason as CloudFallbackReason | undefined) ||
      ((json as Record<string, unknown>).fallback_reason as CloudFallbackReason | undefined),
    cloudState:
      ((json as Record<string, unknown>).cloudState as SegmentationResult['cloudState']) ||
      ((json as Record<string, unknown>).cloud_state as SegmentationResult['cloudState']) ||
      cloudResult.cloudState,
    endpoint:
      ((json as Record<string, unknown>).endpoint as string | undefined) || cloudResult.endpoint,
    nextRecoveryAction:
      ((json as Record<string, unknown>).nextRecoveryAction as string | undefined) ||
      ((json as Record<string, unknown>).next_recovery_action as string | undefined) ||
      cloudResult.nextRecoveryAction,
    retrying:
      Boolean((json as Record<string, unknown>).retrying) || cloudResult.retrying,
    masks: masksRaw as SegmentationMaskDescriptor[],
  };
};

export const toLocalMaskLayers = (result: SegmentationResult): LocalMaskLayer[] =>
  result.masks.map(buildLayerFromMask);
