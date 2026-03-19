export interface AgentActionResult {
  ok: boolean;
  message: string;
}

export interface AgentSettingsPatch {
  syncOnWifi?: boolean;
  communityNotify?: boolean;
  voiceAutoApply?: boolean;
}

export interface SettingsPatchBridge {
  applyPatch: (patch: AgentSettingsPatch) => Promise<AgentActionResult>;
}

export interface WaitForBridgeOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

const wait = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

export const waitForProfileBridge = async (
  getBridge: () => SettingsPatchBridge | null,
  options: WaitForBridgeOptions = {},
): Promise<SettingsPatchBridge | null> => {
  const timeoutMs = options.timeoutMs ?? 1600;
  const pollIntervalMs = options.pollIntervalMs ?? 40;
  const start = Date.now();

  let bridge = getBridge();
  while (!bridge && Date.now() - start <= timeoutMs) {
    await wait(pollIntervalMs);
    bridge = getBridge();
  }

  return bridge;
};

export interface ApplySettingsPatchWithBridgeParams extends WaitForBridgeOptions {
  openSettings: () => void;
  getBridge: () => SettingsPatchBridge | null;
  patch: AgentSettingsPatch;
}

export const applySettingsPatchWithBridge = async ({
  openSettings,
  getBridge,
  patch,
  timeoutMs,
  pollIntervalMs,
}: ApplySettingsPatchWithBridgeParams): Promise<AgentActionResult> => {
  openSettings();
  const bridge = await waitForProfileBridge(getBridge, {timeoutMs, pollIntervalMs});
  if (!bridge) {
    return {
      ok: false,
      message: '设置页面未就绪，请重试',
    };
  }
  return bridge.applyPatch(patch);
};
