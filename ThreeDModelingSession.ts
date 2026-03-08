import type { ImageTo3DTaskStatus, SelectedImageAsset } from './ImageTo3DService';

export interface ThreeDModelingTaskSession {
  taskId: string | null;
  status: ImageTo3DTaskStatus;
  message: string;
  previewUrl: string | null;
  downloadUrl: string | null;
  fileType: string | null;
  expiresAt: string | null;
  pollAfterMs: number;
  pollStartedAt: number | null;
}

export interface ThreeDModelingSessionState {
  selectedImage: SelectedImageAsset | null;
  task: ThreeDModelingTaskSession;
}

const defaultTaskSession: ThreeDModelingTaskSession = {
  taskId: null,
  status: 'idle',
  message: '',
  previewUrl: null,
  downloadUrl: null,
  fileType: null,
  expiresAt: null,
  pollAfterMs: 5000,
  pollStartedAt: null,
};

let currentSession: ThreeDModelingSessionState = {
  selectedImage: null,
  task: { ...defaultTaskSession },
};

export function getThreeDModelingSession(): ThreeDModelingSessionState {
  return {
    selectedImage: currentSession.selectedImage,
    task: { ...currentSession.task },
  };
}

export function setThreeDModelingSession(nextSession: Partial<ThreeDModelingSessionState>) {
  currentSession = {
    selectedImage:
      nextSession.selectedImage === undefined ? currentSession.selectedImage : nextSession.selectedImage,
    task: nextSession.task ? { ...nextSession.task } : { ...currentSession.task },
  };
}

export function resetThreeDModelingSession() {
  currentSession = {
    selectedImage: null,
    task: { ...defaultTaskSession },
  };
}

export function createEmptyTaskSession(): ThreeDModelingTaskSession {
  return { ...defaultTaskSession };
}
