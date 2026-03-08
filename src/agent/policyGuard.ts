import type {AgentAction} from './types';

export const requiresConfirmationByPolicy = (action: AgentAction): boolean => {
  if (action.requiresConfirmation) {
    return true;
  }
  return action.riskLevel !== 'low';
};

export const canAutoExecute = (action: AgentAction): boolean =>
  !requiresConfirmationByPolicy(action);
