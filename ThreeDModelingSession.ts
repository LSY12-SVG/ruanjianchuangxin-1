export interface ThreeDModelingSessionState {
  captureSessionId: string | null;
  reconstructionTaskId: string | null;
  modelId: string | null;
  selectedAngleTag: string | null;
  localFrameUris: Record<string, string>;
}

const defaultSessionState: ThreeDModelingSessionState = {
  captureSessionId: null,
  reconstructionTaskId: null,
  modelId: null,
  selectedAngleTag: null,
  localFrameUris: {},
};

let currentSession: ThreeDModelingSessionState = {...defaultSessionState};

export function getThreeDModelingSession(): ThreeDModelingSessionState {
  return {
    captureSessionId: currentSession.captureSessionId,
    reconstructionTaskId: currentSession.reconstructionTaskId,
    modelId: currentSession.modelId,
    selectedAngleTag: currentSession.selectedAngleTag,
    localFrameUris: {...currentSession.localFrameUris},
  };
}

export function setThreeDModelingSession(
  nextSession: Partial<ThreeDModelingSessionState>,
) {
  currentSession = {
    captureSessionId:
      nextSession.captureSessionId === undefined
        ? currentSession.captureSessionId
        : nextSession.captureSessionId,
    reconstructionTaskId:
      nextSession.reconstructionTaskId === undefined
        ? currentSession.reconstructionTaskId
        : nextSession.reconstructionTaskId,
    modelId: nextSession.modelId === undefined ? currentSession.modelId : nextSession.modelId,
    selectedAngleTag:
      nextSession.selectedAngleTag === undefined
        ? currentSession.selectedAngleTag
        : nextSession.selectedAngleTag,
    localFrameUris:
      nextSession.localFrameUris === undefined
        ? {...currentSession.localFrameUris}
        : {...nextSession.localFrameUris},
  };
}

export function resetThreeDModelingSession() {
  currentSession = {...defaultSessionState};
}
