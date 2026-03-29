import {
  requestAgentLogin,
  resolveAgentLoginPrompt,
  useAgentAuthPromptStore,
} from '../../src/agent/authPromptStore';

describe('authPromptStore', () => {
  afterEach(() => {
    useAgentAuthPromptStore.getState().setPendingRequest(null);
  });

  it('opens login prompt and resolves waiting caller', async () => {
    const pending = requestAgentLogin('需要登录');
    expect(useAgentAuthPromptStore.getState().visible).toBe(true);
    expect(useAgentAuthPromptStore.getState().message).toContain('登录');

    resolveAgentLoginPrompt(true);

    await expect(pending).resolves.toBe(true);
    expect(useAgentAuthPromptStore.getState().visible).toBe(false);
  });
});
