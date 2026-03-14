import {normalizeInterpretResponse} from './contracts';
import type {InterpretRequest, InterpretResponse} from './types';
import {
  requestCloudJson,
  type CloudRequestResult,
} from '../cloud/endpointResolver';
import type {CloudFallbackReason, CloudServiceState} from '../types/colorEngine';

interface CloudInterpretResult {
  response: InterpretResponse | null;
  cloudState: CloudServiceState;
  fallbackReason?: CloudFallbackReason;
  endpoint?: string;
  latencyMs: number;
  attempts: number;
  retrying: boolean;
  nextRecoveryAction: string;
}

export const interpretWithCloud = async (
  request: InterpretRequest,
  endpoint?: string,
): Promise<CloudInterpretResult> => {
  const payload = {
    mode: request.mode || 'voice_refine',
    transcript: request.transcript,
    currentParams: request.currentParams,
    locale: request.locale,
    sceneHints: request.sceneHints || ['photo_color_grading', 'mobile_gpu_preview'],
    image: request.image,
    imageStats: request.imageStats,
  };
  const cloudResult: CloudRequestResult<unknown> = await requestCloudJson({
    servicePath: '/v1/color/interpret',
    explicitEndpoint: endpoint,
    method: 'POST',
    body: payload,
    timeoutMs: 8000,
    retries: 1,
    healthTimeoutMs: 700,
    totalBudgetMs: 9500,
  });

  if (!cloudResult.ok) {
    console.warn(
      '[voice-cloud] interpret fallback:',
      JSON.stringify({
        cloudState: cloudResult.cloudState,
        fallbackReason: cloudResult.fallbackReason || 'unknown',
        endpoint: cloudResult.endpoint || '',
        latencyMs: cloudResult.latencyMs,
        attempts: cloudResult.attempts,
        nextRecoveryAction: cloudResult.nextRecoveryAction,
      }),
    );
    return {
      response: null,
      cloudState: cloudResult.cloudState,
      fallbackReason: cloudResult.fallbackReason,
      endpoint: cloudResult.endpoint,
      latencyMs: cloudResult.latencyMs,
      attempts: cloudResult.attempts,
      retrying: cloudResult.retrying,
      nextRecoveryAction: cloudResult.nextRecoveryAction,
    };
  }

  const normalized = normalizeInterpretResponse(cloudResult.data);
  if (!normalized) {
    return {
      response: null,
      cloudState: 'degraded',
      fallbackReason: 'bad_payload',
      endpoint: cloudResult.endpoint,
      latencyMs: cloudResult.latencyMs,
      attempts: cloudResult.attempts,
      retrying: cloudResult.retrying,
      nextRecoveryAction: cloudResult.nextRecoveryAction,
    };
  }

  const responseCloudState = normalized.fallbackUsed ? 'degraded' : cloudResult.cloudState;
  const responseFallbackReason = normalized.fallbackReason;

  return {
    response: normalized,
    cloudState: responseCloudState,
    fallbackReason: responseFallbackReason,
    endpoint: cloudResult.endpoint,
    latencyMs: cloudResult.latencyMs,
    attempts: cloudResult.attempts,
    retrying: cloudResult.retrying,
    nextRecoveryAction: cloudResult.nextRecoveryAction,
  };
};
