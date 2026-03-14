import type {AgentAction} from '../types';

export const TOOL_ROUTER_SKILL_NAME = 'agent-tool-router';

interface ToolRouterInput {
  actions: AgentAction[];
  hasOperation: (action: AgentAction) => boolean;
}

interface ToolRouterOutput {
  routable: AgentAction[];
  rejected: AgentAction[];
}

export const routeActionsByCapability = ({
  actions,
  hasOperation,
}: ToolRouterInput): ToolRouterOutput => {
  const routable: AgentAction[] = [];
  const rejected: AgentAction[] = [];
  for (const action of actions) {
    if (hasOperation(action)) {
      routable.push(action);
    } else {
      rejected.push(action);
    }
  }
  return {routable, rejected};
};
