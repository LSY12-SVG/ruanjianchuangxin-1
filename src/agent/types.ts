export type AgentAppTab = 'create' | 'assistant' | 'works';
export type AgentCreateRoute = 'hub' | 'editor';

export type AgentDomain =
  | 'navigation'
  | 'grading'
  | 'convert'
  | 'community'
  | 'settings'
  | 'app';

export type AgentRiskLevel = 'low' | 'medium' | 'high';
export type AgentPriority = 'low' | 'normal' | 'high';
export type AgentRuntimePhase =
  | 'idle'
  | 'planned'
  | 'running'
  | 'pending_confirm'
  | 'client_required'
  | 'applied'
  | 'failed'
  | 'rolled_back';
export type AgentActionStatus =
  | 'planned'
  | 'running'
  | 'pending_confirm'
  | 'client_required'
  | 'applied'
  | 'failed'
  | 'rolled_back';
export type AgentPlannerSource = 'cloud' | 'local';
export type AgentErrorCode =
  | 'confirmation_required'
  | 'not_registered'
  | 'forbidden_scope'
  | 'client_required'
  | 'timeout'
  | 'tool_error'
  | 'invalid_action'
  | 'unknown';

export interface AgentIntent {
  goal: string;
  context?: Record<string, unknown>;
  constraints?: string[];
  priority?: AgentPriority;
}

export interface AgentAction {
  actionId: string;
  id?: string;
  domain: AgentDomain;
  operation: string;
  toolRef?: {
    serverId: string;
    toolName: string;
  };
  args?: Record<string, unknown>;
  riskLevel: AgentRiskLevel;
  requiresConfirmation: boolean;
  idempotent?: boolean;
  timeoutMs?: number;
  requiredScopes?: string[];
  skillName?: string;
  status?: AgentActionStatus;
}

export interface AgentPlanResponse {
  planId: string;
  actions: AgentAction[];
  reasoningSummary: string;
  clarificationRequired?: boolean;
  clarificationQuestion?: string;
  decisionTrace?: Array<{step: string; reason: string; confidence?: number}>;
  selectedSkillPack?: string;
  candidateSkillPacks?: Array<{id: string; score: number}>;
  memoryApplied?: {preferences: boolean; outcomes: boolean};
  executionStrategy?: 'fast' | 'quality' | 'cost';
  estimatedSteps: number;
  undoPlan: string[];
  plannerSource: AgentPlannerSource;
}

export interface AgentActionFailure {
  action: AgentAction;
  reason: string;
  errorCode: AgentErrorCode;
  retryable: boolean;
}

export interface AgentActionExecution {
  action: AgentAction;
  status: AgentActionStatus;
  message?: string;
  errorCode?: AgentErrorCode;
  retryable: boolean;
  attempts: number;
  durationMs: number;
  skillName?: string;
}

export interface AgentExecutionResult {
  executionId: string;
  planId: string;
  status: Exclude<AgentRuntimePhase, 'idle' | 'planned'>;
  actionResults: AgentActionExecution[];
  appliedActions: AgentAction[];
  failedActions: AgentActionFailure[];
  pendingActions: AgentAction[];
  rollbackAvailable: boolean;
  startedAt: string;
  endedAt: string;
}

export interface AgentHistoryEntry {
  id: string;
  goal: string;
  tab: AgentAppTab;
  createdAt: string;
  plan: AgentPlanResponse;
  execution: AgentExecutionResult;
}

export interface AgentMemorySnapshot {
  preferences: Record<string, string | number | boolean>;
  history: AgentHistoryEntry[];
}

export interface AgentToolExecutionResult {
  ok: boolean;
  message?: string;
  rollback?: (() => void | Promise<void>) | null;
  errorCode?: AgentErrorCode;
  retryable?: boolean;
}

export type AgentToolExecutor = (
  action: AgentAction,
) => AgentToolExecutionResult | Promise<AgentToolExecutionResult>;

export interface AgentRegisteredOperation {
  domain: AgentDomain;
  operation: string;
  description: string;
  defaultRisk: AgentRiskLevel;
  defaultRequiresConfirmation?: boolean;
  defaultIdempotent?: boolean;
  defaultRequiredScopes?: string[];
  defaultSkillName?: string;
  snapshot?: () => Record<string, unknown> | null;
  execute: AgentToolExecutor;
}

export interface AgentCapabilityDescriptor {
  domain: AgentDomain;
  operation: string;
  description: string;
  riskLevel: AgentRiskLevel;
  requiresConfirmation: boolean;
  idempotent: boolean;
}

export interface AgentPlanRequest {
  intent: AgentIntent;
  currentTab: AgentAppTab;
  capabilities: AgentCapabilityDescriptor[];
  pageSnapshot?: Record<string, unknown>;
  lastExecution?: Pick<AgentExecutionResult, 'status' | 'actionResults' | 'failedActions'> | null;
}

export interface AgentMemoryUpsertRequest {
  userId: string;
  namespace: string;
  key: string;
  value: unknown;
  ttlSeconds?: number;
}

export interface AgentMemoryQueryRequest {
  userId: string;
  namespace: string;
  key: string;
}

export interface AgentMemoryQueryResponse {
  ok: boolean;
  key: string;
  value: unknown;
  version: number;
  updatedAt: string | null;
}

export interface AgentExecuteRequest {
  userId?: string;
  namespace?: string;
  grantedScopes?: string[];
  planId: string;
  actions: AgentAction[];
  actionIds?: string[];
  idempotencyKey?: string;
  allowConfirmActions?: boolean;
}

export interface AgentExecuteResponse {
  executionId: string;
  planId: string;
  namespace?: string;
  auditId?: string;
  toolCalls?: Array<{
    actionId: string;
    serverId: string;
    toolName: string;
    status: string;
    latencyMs: number;
    requestId: string;
  }>;
  actionResults: AgentActionExecution[];
  appliedActions: AgentAction[];
  failedActions: AgentActionFailure[];
  pendingActions: AgentAction[];
  rollbackAvailable: boolean;
  status: Exclude<AgentRuntimePhase, 'idle' | 'planned'>;
}

