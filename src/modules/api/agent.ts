import {requestApi} from './http';
import type {AgentExecuteResponse, AgentPlanAction, AgentPlanResponse} from './types';

const BASE_CAPABILITIES: Array<{domain: string; operation: string}> = [
  {domain: 'navigation', operation: 'navigate_tab'},
  {domain: 'grading', operation: 'apply_visual_suggest'},
  {domain: 'grading', operation: 'reset_params'},
  {domain: 'convert', operation: 'start_task'},
  {domain: 'community', operation: 'create_draft'},
  {domain: 'community', operation: 'publish_draft'},
  {domain: 'settings', operation: 'apply_patch'},
  {domain: 'app', operation: 'summarize_current_page'},
];

export const agentApi = {
  async createPlan(prompt: string): Promise<AgentPlanResponse> {
    return requestApi<AgentPlanResponse>('/v1/modules/agent/plan', {
      method: 'POST',
      body: {
        intent: {goal: prompt},
        currentTab: 'agent',
        capabilities: BASE_CAPABILITIES,
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
      },
    });
  },
};
