export interface FirstPassGateState {
  imageSessionKey: string;
  triggered: boolean;
}

export const createFirstPassGate = (): FirstPassGateState => ({
  imageSessionKey: '',
  triggered: false,
});

export const openFirstPassGate = (
  gate: FirstPassGateState,
  imageSessionKey: string,
): void => {
  gate.imageSessionKey = imageSessionKey;
  gate.triggered = false;
};

export const canTriggerFirstPass = (
  gate: FirstPassGateState,
  imageSessionKey: string,
): boolean => {
  if (!imageSessionKey) {
    return false;
  }
  if (gate.imageSessionKey !== imageSessionKey) {
    openFirstPassGate(gate, imageSessionKey);
  }
  return !gate.triggered;
};

export const markFirstPassTriggered = (
  gate: FirstPassGateState,
  imageSessionKey: string,
): void => {
  gate.imageSessionKey = imageSessionKey;
  gate.triggered = true;
};
