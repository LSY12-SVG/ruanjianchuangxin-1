import {
  applySettingsPatchWithBridge,
  type AgentSettingsPatch,
  type SettingsPatchBridge,
} from '../../src/agent/operations/settingsApplyPatch';

describe('settings apply patch bridge helper', () => {
  test('succeeds on first call when bridge registers shortly after opening', async () => {
    let bridge: SettingsPatchBridge | null = null;
    const openSettings = jest.fn(() => {
      setTimeout(() => {
        bridge = {
          applyPatch: async (patch: AgentSettingsPatch) => ({
            ok: true,
            message: patch.syncOnWifi ? 'patched' : 'noop',
          }),
        };
      }, 20);
    });

    const result = await applySettingsPatchWithBridge({
      openSettings,
      getBridge: () => bridge,
      patch: {syncOnWifi: true},
      timeoutMs: 300,
      pollIntervalMs: 10,
    });

    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ok: true, message: 'patched'});
  });

  test('returns retryable error on timeout and succeeds when retried after bridge is ready', async () => {
    let bridge: SettingsPatchBridge | null = null;
    const openSettings = jest.fn();

    const first = await applySettingsPatchWithBridge({
      openSettings,
      getBridge: () => bridge,
      patch: {communityNotify: true},
      timeoutMs: 40,
      pollIntervalMs: 10,
    });
    expect(first.ok).toBe(false);
    expect(first.message).toContain('请重试');

    bridge = {
      applyPatch: async () => ({
        ok: true,
        message: 'patched_on_retry',
      }),
    };
    const second = await applySettingsPatchWithBridge({
      openSettings,
      getBridge: () => bridge,
      patch: {communityNotify: true},
      timeoutMs: 80,
      pollIntervalMs: 10,
    });

    expect(second).toEqual({ok: true, message: 'patched_on_retry'});
    expect(openSettings).toHaveBeenCalledTimes(2);
  });
});
