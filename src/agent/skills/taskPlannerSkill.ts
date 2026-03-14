import type {AgentAction} from '../types';

export const TASK_PLANNER_SKILL_NAME = 'agent-task-planner';

export const normalizeIntentGoal = (goal: string): string =>
  goal
    .replace(/\s+/g, ' ')
    .trim();

export const chooseRetryAttempts = (action: AgentAction): number => {
  if (action.idempotent) {
    return 2;
  }
  return 1;
};
