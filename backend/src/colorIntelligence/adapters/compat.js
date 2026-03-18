const withInterpretCompat = payload => {
  const actions = Array.isArray(payload?.intent_actions) ? payload.intent_actions : [];
  const camel = {
    actions,
    intentActions: actions,
    confidence: payload?.confidence,
    needsConfirmation: payload?.needsConfirmation,
    fallbackUsed: Boolean(payload?.fallback_used),
    reasoningSummary: payload?.reasoning_summary || '',
    message: payload?.message || '',
    source: payload?.source || 'cloud',
    analysisSummary: payload?.analysis_summary || '',
    appliedProfile: payload?.applied_profile || '',
    sceneProfile: payload?.scene_profile || '',
    sceneConfidence: payload?.scene_confidence,
    qualityRiskFlags: Array.isArray(payload?.quality_risk_flags)
      ? payload.quality_risk_flags
      : [],
    recommendedIntensity: payload?.recommended_intensity || 'normal',
    fallbackReason: payload?.fallback_reason,
  };

  return {
    ...camel,
    ...payload,
    fallback_used: camel.fallbackUsed,
    reasoning_summary: camel.reasoningSummary,
    analysis_summary: camel.analysisSummary,
    applied_profile: camel.appliedProfile,
    scene_profile: camel.sceneProfile,
    scene_confidence: camel.sceneConfidence,
    quality_risk_flags: camel.qualityRiskFlags,
    recommended_intensity: camel.recommendedIntensity,
    fallback_reason: camel.fallbackReason,
  };
};

const withAutoGradeCompat = payload => {
  const camel = {
    phase: payload?.phase,
    sceneProfile: payload?.sceneProfile || 'general',
    confidence: payload?.confidence,
    globalActions: Array.isArray(payload?.globalActions) ? payload.globalActions : [],
    localMaskPlan: Array.isArray(payload?.localMaskPlan) ? payload.localMaskPlan : [],
    qualityRiskFlags: Array.isArray(payload?.qualityRiskFlags) ? payload.qualityRiskFlags : [],
    explanation: payload?.explanation || '',
    fallbackUsed: Boolean(payload?.fallbackUsed),
    fallbackReason: payload?.fallbackReason,
    cloudState: payload?.cloudState,
    latencyMs: payload?.latencyMs,
    endpoint: payload?.endpoint,
    lockedEndpoint: payload?.lockedEndpoint,
    nextRecoveryAction: payload?.nextRecoveryAction,
    phaseTimeoutMs: payload?.phaseTimeoutMs,
    phaseBudgetMs: payload?.phaseBudgetMs,
    payloadBytes: payload?.payloadBytes,
    encodeQuality: payload?.encodeQuality,
    mimeType: payload?.mimeType,
    modelUsed: payload?.modelUsed,
    modelRoute: payload?.modelRoute,
  };

  return {
    ...camel,
    ...payload,
    scene_profile: camel.sceneProfile,
    global_actions: camel.globalActions,
    local_mask_plan: camel.localMaskPlan,
    quality_risk_flags: camel.qualityRiskFlags,
    fallback_used: camel.fallbackUsed,
    fallback_reason: camel.fallbackReason,
    cloud_state: camel.cloudState,
    latency_ms: camel.latencyMs,
    locked_endpoint: camel.lockedEndpoint,
    next_recovery_action: camel.nextRecoveryAction,
    phase_timeout_ms: camel.phaseTimeoutMs,
    phase_budget_ms: camel.phaseBudgetMs,
    payload_bytes: camel.payloadBytes,
    encode_quality: camel.encodeQuality,
    mime_type: camel.mimeType,
    model_used: camel.modelUsed,
    model_route: camel.modelRoute,
  };
};

const withSegmentationCompat = payload => {
  const camel = {
    model: payload?.model || '',
    latencyMs: payload?.latencyMs || 0,
    fallbackUsed: Boolean(payload?.fallbackUsed),
    fallbackReason: payload?.fallbackReason,
    cloudState: payload?.cloudState,
    endpoint: payload?.endpoint,
    nextRecoveryAction: payload?.nextRecoveryAction,
    retrying: payload?.retrying,
    masks: Array.isArray(payload?.masks) ? payload.masks : [],
  };

  return {
    ...camel,
    ...payload,
    latency_ms: camel.latencyMs,
    fallback_used: camel.fallbackUsed,
    fallback_reason: camel.fallbackReason,
    cloud_state: camel.cloudState,
    next_recovery_action: camel.nextRecoveryAction,
  };
};

module.exports = {
  withInterpretCompat,
  withAutoGradeCompat,
  withSegmentationCompat,
};
