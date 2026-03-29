import type {ColorGradingParams} from '../../types/colorGrading';
import type {InterpretImageStats, VoiceIntentAction} from '../../voice/types';

export type ClientPermissionKey =
  | 'photo_library'
  | 'photo_library_write'
  | 'camera'
  | 'microphone'
  | 'notifications'
  | 'auth_session'
  | 'file_read'
  | 'file_write'
  | 'system_settings';

export type ClientPermissionState = 'granted' | 'denied' | 'blocked' | 'unavailable';

export type ModuleHealthState = 'healthy' | 'degraded' | 'down';

export interface ModuleHealthItem {
  module: string;
  status: ModuleHealthState;
  ok: boolean;
  provider?: string;
  strictMode?: boolean;
  details?: Record<string, unknown>;
}

export interface AgentStrategyMetricBucket {
  planLatencyP50Ms: number;
  planLatencyP95Ms: number;
  executeSuccessRate: number;
  interruptionRate: number;
  sampleCount: number;
}

export interface AgentStrategyMetrics {
  fast: AgentStrategyMetricBucket;
  quality: AgentStrategyMetricBucket;
  cost: AgentStrategyMetricBucket;
  adaptive: AgentStrategyMetricBucket;
}

export interface AgentModuleHealthResponse {
  module: string;
  ok: boolean;
  strictMode: boolean;
  metrics: Record<string, unknown> & {
    strategyMetrics?: AgentStrategyMetrics;
  };
}

export interface ModuleCapabilityItem {
  module: string;
  enabled: boolean;
  strictMode: boolean;
  provider: string;
  mcpServers?: string[];
  externalMcpEnabled?: boolean;
  supportsSkillPacks?: boolean;
  supportsExecutionStrategy?: boolean;
  auth: {
    required: boolean;
    scopes: string[];
  };
  endpoints: string[];
}

export interface ModuleGatewayHealthResponse {
  ok: boolean;
  missingModules: string[];
  modules: Record<string, Record<string, unknown>>;
}

export interface ModuleGatewayCapabilitiesResponse {
  ok: boolean;
  modules: ModuleCapabilityItem[];
}

export interface ColorInterpretModuleResponse {
  actions: VoiceIntentAction[];
  confidence: number;
  reasoningSummary: string;
  needsConfirmation: boolean;
  message: string;
  source: 'cloud' | 'fallback';
  analysisSummary?: string;
  appliedProfile?: string;
  sceneProfile?: string;
  sceneConfidence?: number;
  qualityRiskFlags?: string[];
  recommendedIntensity?: 'soft' | 'normal' | 'strong';
  modelUsed?: string;
  modelRoute?: string;
  latencyMs?: number;
}

export interface ColorAutoGradeModuleResponse {
  phase: 'fast' | 'refine';
  sceneProfile: string;
  confidence: number;
  globalActions: VoiceIntentAction[];
  localMaskPlan: Array<Record<string, unknown>>;
  qualityRiskFlags: string[];
  explanation: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
  modelUsed?: string;
  modelRoute?: string;
}

export interface ColorSegmentMask {
  type: string;
  confidence: number;
  coverage: number;
}

export interface ColorSegmentResponse {
  model: string;
  latencyMs: number;
  fallbackUsed: boolean;
  masks: ColorSegmentMask[];
}

export interface VoiceTranscribeResponse {
  transcript: string;
  language?: string;
  durationMs?: number;
  requestId?: string;
}

export interface ModelingJobResponse {
  taskId: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed' | 'expired';
  pollAfterMs?: number;
  message?: string;
  previewUrl?: string;
  previewImageUrl?: string;
  downloadUrl?: string;
  viewerFormat?: 'glb' | 'gltf' | 'obj' | 'fbx';
  viewerFiles?: Array<{
    type?: string;
    url: string;
    previewImageUrl?: string;
  }>;
  sessionId?: string;
}

export interface ModelingModelAssetResponse {
  id: string;
  sessionId: string;
  glbUrl: string | null;
  thumbnailUrl?: string | null;
  viewerFormat: 'glb' | 'gltf' | 'obj' | 'fbx' | null;
  viewerFiles?: Array<{
    type?: string;
    url: string;
    previewImageUrl?: string;
  }>;
}

export interface CaptureSessionResponse {
  id: string;
  status: string;
  targetFrameCount: number;
  minimumFrameCount: number;
  acceptedFrameCount: number;
  taskId: string | null;
  missingAngleTags: string[];
  suggestedAngleTag: string | null;
  statusHint: string;
}

export interface AgentPlanAction {
  actionId: string;
  id: string;
  domain: string;
  operation: string;
  toolRef?: {
    serverId: string;
    toolName: string;
  };
  args?: Record<string, unknown>;
  stage?: 'grading' | 'convert' | 'community' | 'app';
  dependsOn?: string[];
  preconditions?: string[];
  toolMeta?: {
    displayName?: string;
    requiredContext?: string[];
    requiredDevicePermissions?: ClientPermissionKey[];
    supportsAsync?: boolean;
    riskLevel?: 'low' | 'medium' | 'high';
    resumable?: boolean;
    clientOwned?: boolean;
    confirmationPolicy?: 'never' | 'always';
    resultCardKind?: string;
  };
  riskLevel: 'low' | 'medium' | 'high';
  requiresConfirmation: boolean;
  requiredScopes: string[];
}

export interface AgentWorkflowRunState {
  runId: string;
  status:
    | 'queued'
    | 'running'
    | 'waiting_context'
    | 'waiting_confirm'
    | 'waiting_async_result'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
    | 'partial_succeeded';
  currentStep: number;
  totalSteps: number;
  nextRequiredContext: string | null;
  blockedReason?: string | null;
  updatedAt: string;
  waitingActionId?: string | null;
  pendingTask?: {
    taskId: string;
    taskStatus: string;
    pollAfterMs: number;
  } | null;
  lastWorkerAt?: string | null;
  nextPollAt?: string | null;
}

export interface AgentWorkflowHistoryEntry {
  id: string;
  type: string;
  status: string;
  message: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface AgentPlanResponse {
  planId: string;
  actions: AgentPlanAction[];
  reasoningSummary: string;
  summarySource?: 'model' | 'rule';
  clarificationRequired?: boolean;
  clarificationQuestion?: string;
  decisionTrace?: Array<{
    step: string;
    reason: string;
    confidence?: number;
  }>;
  selectedSkillPack?: string;
  selectedAuxSkillPacks?: string[];
  candidateSkillPacks?: Array<{id: string; score: number}>;
  subtaskGraph?: Array<{
    nodeId: string;
    packId: string;
    actionId: string;
    dependsOn?: string[];
    resumable?: boolean;
    fallbackRef?: string;
  }>;
  memoryApplied?: {
    preferences: boolean;
    outcomes: boolean;
  };
  executionStrategy?: 'fast' | 'quality' | 'cost';
  strategySource?: 'user' | 'memory' | 'adaptive';
  estimatedSteps: number;
  plannerSource: 'cloud' | 'local';
  fallback?: {
    used: boolean;
    reason: string;
  };
  decisionPath?: 'planned' | 'fallback_direct';
}

export interface AgentResumeContextPatch {
  colorContext?: ColorRequestContext | null;
  modelingImageContext?: {
    image: {
      mimeType: string;
      fileName: string;
      base64: string;
    };
  } | null;
}

export interface AgentExecuteResponse {
  executionId: string;
  planId: string;
  status:
    | 'pending_confirm'
    | 'failed'
    | 'applied'
    | 'client_required'
    | 'waiting_async_result'
    | 'cancelled';
  auditId?: string;
  traceId?: string;
  workflowRun?: AgentWorkflowRunState | null;
  workflowState?: {
    currentStep: number;
    totalSteps: number;
    nextRequiredContext: string | null;
  };
  toolCalls?: Array<{
    actionId: string;
    serverId: string;
    toolName: string;
    status: string;
    latencyMs: number;
    requestId: string;
    retryCount?: number;
    errorCode?: string;
  }>;
  resultCards?: Array<{
    kind: string;
    title: string;
    summary: string;
    status: string;
    artifact?: Record<string, unknown>;
    nextAction?: Record<string, unknown>;
    recovery?: Record<string, unknown>;
  }>;
  completionScore?: number;
  recoverySuggestions?: Array<{
    type: string;
    label: string;
    actionRef?: Record<string, unknown>;
  }>;
  resultSummary?: {
    done: string;
    why: string;
    next: string;
  };
  nextAction?: {
    type: 'confirm' | 'provide_context' | 'wait_async' | 'retry' | 'resume';
    label: string;
    targetTab?: string;
    requiredContext?: string;
    pollAfterMs?: number;
    nextPollAt?: string;
    actionId?: string;
    runId?: string;
  };
  appliedStrategy?: 'fast' | 'quality' | 'cost';
  outcomeRecorded?: boolean;
  clientRequiredActions?: AgentPlanAction[];
  clientHandledActions?: Array<{
    actionId: string;
    domain: string;
    operation: string;
    message: string;
    output?: Record<string, unknown>;
  }>;
  pageSummary?: string;
  actionResults: Array<{
    status: string;
    message: string;
    errorCode?: string;
    output?: Record<string, unknown>;
    action: AgentPlanAction;
  }>;
}

export interface AgentWorkflowHistoryResponse {
  ok: boolean;
  runId: string;
  planId: string;
  history: AgentWorkflowHistoryEntry[];
  latestExecuteResult: AgentExecuteResponse | null;
}

export interface CommunityAuthor {
  id: string;
  name: string;
  avatarUrl: string;
}

export interface CommunityPost {
  id: string;
  author: CommunityAuthor;
  status: 'draft' | 'published';
  title: string;
  content: string;
  beforeUrl: string;
  afterUrl: string;
  tags: string[];
  gradingParams: Partial<ColorGradingParams>;
  likesCount: number;
  savesCount: number;
  commentsCount: number;
  isLiked: boolean;
  isSaved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityComment {
  id: string;
  postId: string;
  parentId: string | null;
  author: CommunityAuthor;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
  hasMore: boolean;
}

export interface ColorRequestContext {
  locale: string;
  currentParams: ColorGradingParams;
  image: {
    mimeType: string;
    width: number;
    height: number;
    base64: string;
  };
  imageStats: InterpretImageStats;
}



