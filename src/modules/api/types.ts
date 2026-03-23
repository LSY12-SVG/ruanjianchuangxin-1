import type {ColorGradingParams} from '../../types/colorGrading';
import type {InterpretImageStats, VoiceIntentAction} from '../../voice/types';

export type ModuleHealthState = 'healthy' | 'degraded' | 'down';

export interface ModuleHealthItem {
  module: string;
  status: ModuleHealthState;
  ok: boolean;
  provider?: string;
  strictMode?: boolean;
  details?: Record<string, unknown>;
}

export interface ModuleCapabilityItem {
  module: string;
  enabled: boolean;
  strictMode: boolean;
  provider: string;
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
  args?: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high';
  requiresConfirmation: boolean;
  requiredScopes: string[];
}

export interface AgentPlanResponse {
  planId: string;
  actions: AgentPlanAction[];
  reasoningSummary: string;
  estimatedSteps: number;
  plannerSource: 'cloud' | 'local';
}

export interface AgentExecuteResponse {
  executionId: string;
  planId: string;
  status: 'pending_confirm' | 'failed' | 'applied' | 'client_required';
  actionResults: Array<{
    status: string;
    message: string;
    errorCode?: string;
    output?: Record<string, unknown>;
    action: AgentPlanAction;
  }>;
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
