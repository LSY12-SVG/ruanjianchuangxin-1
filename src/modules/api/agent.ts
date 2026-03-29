import {requestApi} from './http';
import type {
  AgentExecuteResponse,
  AgentWorkflowHistoryResponse,
  AgentPlanAction,
  AgentPlanResponse,
  AgentResumeContextPatch,
  AgentModuleHealthResponse,
} from './types';

const BASE_CAPABILITIES: Array<{domain: string; operation: string}> = [
  {domain: 'navigation', operation: 'navigate_tab'},
  {domain: 'grading', operation: 'apply_visual_suggest'},
  {domain: 'grading', operation: 'reset_params'},
  {domain: 'convert', operation: 'start_task'},
  {domain: 'community', operation: 'create_draft'},
  {domain: 'community', operation: 'publish_draft'},
  {domain: 'settings', operation: 'apply_patch'},
  {domain: 'settings', operation: 'open'},
  {domain: 'permission', operation: 'request'},
  {domain: 'auth', operation: 'require_login'},
  {domain: 'file', operation: 'pick'},
  {domain: 'file', operation: 'write'},
  {domain: 'app', operation: 'summarize_current_page'},
];

export type AgentPlanCurrentTab =
  | 'create'
  | 'model'
  | 'agent'
  | 'community'
  | 'home'
  | 'profile';

const toLegacyCurrentTab = (tab: AgentPlanCurrentTab): 'home' | 'agent' | 'community' | 'profile' => {
  if (tab === 'community') {
    return 'community';
  }
  if (tab === 'agent') {
    return 'agent';
  }
  if (tab === 'profile') {
    return 'profile';
  }
  return 'home';
};

const buildPageSnapshot = (tab: AgentPlanCurrentTab): Record<string, unknown> => {
  if (tab === 'model') {
    return {currentTab: 'home', currentRoute: 'modeling'};
  }
  if (tab === 'create') {
    return {currentTab: 'home', currentRoute: 'grading'};
  }
  return {currentTab: toLegacyCurrentTab(tab)};
};

export const agentApi = {
  async createPlan(
    prompt: string,
    currentTab: AgentPlanCurrentTab = 'agent',
    inputSource: 'text' | 'voice' = 'text',
    executionStrategy?: 'fast' | 'quality' | 'cost',
  ): Promise<AgentPlanResponse> {
    return requestApi<AgentPlanResponse>('/v1/modules/agent/plan', {
      method: 'POST',
      auth: true,
      body: {
        intent: {goal: prompt},
        currentTab: toLegacyCurrentTab(currentTab),
        inputSource,
        capabilities: BASE_CAPABILITIES,
        pageSnapshot: buildPageSnapshot(currentTab),
        executionStrategy,
      },
    });
  },

  async executePlan(
    planId: string,
    actions: AgentPlanAction[],
    options?: {
      actionIds?: string[];
      allowConfirmActions?: boolean;
      idempotencyKey?: string;
      executionStrategy?: 'fast' | 'quality' | 'cost';
    },
  ): Promise<AgentExecuteResponse> {
    return requestApi<AgentExecuteResponse>('/v1/modules/agent/execute', {
      method: 'POST',
      auth: true,
      body: {
        planId,
        actions,
        actionIds: Array.isArray(options?.actionIds) ? options.actionIds : undefined,
        allowConfirmActions: options?.allowConfirmActions === true,
        idempotencyKey: typeof options?.idempotencyKey === 'string' ? options.idempotencyKey : undefined,
        executionStrategy: options?.executionStrategy,
      },
    });
  },

  async getWorkflowRun(runId: string): Promise<AgentExecuteResponse> {
    return requestApi<AgentExecuteResponse>(
      `/v1/modules/agent/runs/${encodeURIComponent(runId)}`,
      {
        auth: true,
      },
    );
  },

  async getWorkflowRunHistory(runId: string): Promise<AgentWorkflowHistoryResponse> {
    return requestApi<AgentWorkflowHistoryResponse>(
      `/v1/modules/agent/runs/${encodeURIComponent(runId)}/history`,
      {
        auth: true,
      },
    );
  },

  async registerWorkflowRun(input: {
    planId: string;
    actions: AgentPlanAction[];
    latestExecuteResult: AgentExecuteResponse;
    namespace?: string;
    runId?: string;
  }): Promise<AgentExecuteResponse> {
    return requestApi<AgentExecuteResponse>('/v1/modules/agent/runs/register', {
      method: 'POST',
      auth: true,
      body: {
        planId: input.planId,
        actions: input.actions,
        latestExecuteResult: input.latestExecuteResult,
        namespace: input.namespace,
        runId: input.runId,
      },
    });
  },

  async resumeWorkflowRun(
    runId: string,
    options?: {
      allowConfirmActions?: boolean;
      contextPatch?: AgentResumeContextPatch;
    },
  ): Promise<AgentExecuteResponse> {
    return requestApi<AgentExecuteResponse>(
      `/v1/modules/agent/runs/${encodeURIComponent(runId)}/resume`,
      {
        method: 'POST',
        auth: true,
        body: {
          allowConfirmActions: options?.allowConfirmActions === true,
          contextPatch: options?.contextPatch,
        },
      },
    );
  },

  async callbackWorkflowRun(runId: string): Promise<{ok: boolean; runId: string; changed: boolean; status: string}> {
    return requestApi<{ok: boolean; runId: string; changed: boolean; status: string}>(
      `/v1/modules/agent/runs/${encodeURIComponent(runId)}/callback`,
      {
        method: 'POST',
        auth: true,
      },
    );
  },
  async cancelWorkflowRun(runId: string): Promise<AgentExecuteResponse> {
    return requestApi<AgentExecuteResponse>(
      `/v1/modules/agent/runs/${encodeURIComponent(runId)}/cancel`,
      {
        method: 'POST',
        auth: true,
      },
    );
  },

  async retryWorkflowRun(
    runId: string,
    options?: {
      actionIds?: string[];
      allowConfirmActions?: boolean;
    },
  ): Promise<AgentExecuteResponse> {
    return requestApi<AgentExecuteResponse>(
      `/v1/modules/agent/runs/${encodeURIComponent(runId)}/retry`,
      {
        method: 'POST',
        auth: true,
        body: {
          actionIds: Array.isArray(options?.actionIds) ? options?.actionIds : undefined,
          allowConfirmActions: options?.allowConfirmActions === true,
        },
      },
    );
  },

  async getAgentHealth(): Promise<AgentModuleHealthResponse> {
    return requestApi<AgentModuleHealthResponse>('/v1/modules/agent/health', {
      auth: true,
    });
  },
};

