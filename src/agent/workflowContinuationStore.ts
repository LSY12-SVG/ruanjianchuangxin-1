import {create} from 'zustand';
import {createJSONStorage, persist} from 'zustand/middleware';
import type {AgentExecuteResponse, AgentPlanResponse, AgentWorkflowRunState} from '../modules/api';
import {mmkvStorage} from '../store/mmkvStorage';

export type AgentContinuationTab = 'create' | 'model' | 'agent' | 'community';

export interface AgentPendingContextGuide {
  operation: 'grading.apply_visual_suggest' | 'convert.start_task';
  targetTab: AgentContinuationTab;
  message: string;
}

export interface AgentPendingWorkflow {
  plan: AgentPlanResponse;
  latestExecuteResult: AgentExecuteResponse | null;
  missingContextGuides: AgentPendingContextGuide[];
  workflowRun: AgentWorkflowRunState | null;
  updatedAt: number;
}

export interface AgentPersistedRunRef {
  runId: string;
  planId: string;
  status: AgentWorkflowRunState['status'];
  updatedAt: number;
}

interface AgentWorkflowContinuationState {
  pendingWorkflow: AgentPendingWorkflow | null;
  persistedRunRef: AgentPersistedRunRef | null;
  setPendingWorkflow: (payload: Omit<AgentPendingWorkflow, 'updatedAt'>) => void;
  clearPendingWorkflow: () => void;
  setPersistedRunRef: (payload: AgentPersistedRunRef | null) => void;
}

export const useAgentWorkflowContinuationStore = create<AgentWorkflowContinuationState>()(
  persist(
    set => ({
      pendingWorkflow: null,
      persistedRunRef: null,
      setPendingWorkflow: payload =>
        set(() => {
          const updatedAt = Date.now();
          const workflowRun = payload.workflowRun;
          return {
            pendingWorkflow: {
              ...payload,
              updatedAt,
            },
            persistedRunRef: workflowRun?.runId
              ? {
                  runId: workflowRun.runId,
                  planId: payload.plan.planId,
                  status: workflowRun.status,
                  updatedAt,
                }
              : null,
          };
        }),
      clearPendingWorkflow: () =>
        set({
          pendingWorkflow: null,
          persistedRunRef: null,
        }),
      setPersistedRunRef: payload =>
        set({
          persistedRunRef: payload,
        }),
    }),
    {
      name: 'visiongenie.agent.workflow',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: state => ({
        persistedRunRef: state.persistedRunRef,
      }),
    },
  ),
);
