export type AgentAppTab = 'home' | 'agent' | 'community' | 'profile';

export type AgentDomain =
  | 'navigation'
  | 'grading'
  | 'convert'
  | 'community'
  | 'settings'
  | 'app';

export type AgentRiskLevel = 'low' | 'medium' | 'high';
export type AgentPriority = 'low' | 'normal' | 'high';
export type AgentRuntimePhase = 'idle' | 'planning' | 'executing' | 'done' | 'error';

export interface AgentIntent {
  goal: string;
  context?: Record<string, unknown>;
  constraints?: string[];
  priority?: AgentPriority;
}

export interface AgentAction {
  id?: string;
  domain: AgentDomain;
  operation: string;
  args?: Record<string, unknown>;
  riskLevel: AgentRiskLevel;
  requiresConfirmation: boolean;
}

export interface AgentPlanResponse {
  actions: AgentAction[];
  reasoningSummary: string;
  estimatedSteps: number;
  undoPlan: string[];
}

export interface AgentActionFailure {
  action: AgentAction;
  reason: string;
}

export interface AgentExecutionResult {
  appliedActions: AgentAction[];
  failedActions: AgentActionFailure[];
  rollbackAvailable: boolean;
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
  execute: AgentToolExecutor;
}

export interface AgentCapabilityDescriptor {
  domain: AgentDomain;
  operation: string;
  description: string;
  riskLevel: AgentRiskLevel;
  requiresConfirmation: boolean;
}

export interface AgentPlanRequest {
  intent: AgentIntent;
  currentTab: AgentAppTab;
  capabilities: AgentCapabilityDescriptor[];
}

export interface AgentMemoryUpsertRequest {
  key: string;
  value: unknown;
}
