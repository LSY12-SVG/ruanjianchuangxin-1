import {create} from 'zustand';
import type {AgentClientTab} from './dualEntryOrchestrator';

interface AgentClientNavigationBridgeState {
  navigateToTab: (tab: AgentClientTab) => void;
  setNavigateToTab: (handler: (tab: AgentClientTab) => void) => void;
}

export const useAgentClientNavigationBridge = create<AgentClientNavigationBridgeState>(set => ({
  navigateToTab: () => undefined,
  setNavigateToTab: handler =>
    set({
      navigateToTab: handler,
    }),
}));

