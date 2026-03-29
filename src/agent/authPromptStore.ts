import {create} from 'zustand';

interface PendingAuthRequest {
  message?: string;
  resolve: (success: boolean) => void;
}

interface AgentAuthPromptState {
  visible: boolean;
  message: string;
  pendingRequest: PendingAuthRequest | null;
  setPendingRequest: (request: PendingAuthRequest | null) => void;
}

export const useAgentAuthPromptStore = create<AgentAuthPromptState>(set => ({
  visible: false,
  message: '',
  pendingRequest: null,
  setPendingRequest: request =>
    set({
      pendingRequest: request,
      visible: Boolean(request),
      message: request?.message || '',
    }),
}));

export const requestAgentLogin = (message?: string): Promise<boolean> =>
  new Promise(resolve => {
    const current = useAgentAuthPromptStore.getState().pendingRequest;
    if (current) {
      current.resolve(false);
    }
    useAgentAuthPromptStore.getState().setPendingRequest({
      message,
      resolve,
    });
  });

export const resolveAgentLoginPrompt = (success: boolean): void => {
  const state = useAgentAuthPromptStore.getState();
  state.pendingRequest?.resolve(success);
  state.setPendingRequest(null);
};
