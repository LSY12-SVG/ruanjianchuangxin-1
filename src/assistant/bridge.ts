import type {
  AssistantAvatarState,
  AvatarRendererCommand,
  AvatarRendererMessage,
} from './types';

export const parseAvatarRendererMessage = (
  raw: unknown,
): AvatarRendererMessage | null => {
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as AvatarRendererMessage;
    if (
      parsed.type === 'loaded' ||
      parsed.type === 'error' ||
      parsed.type === 'tap' ||
      parsed.type === 'motion_done'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

export const createAvatarStateCommand = (
  state: AssistantAvatarState,
): string => {
  const payload: AvatarRendererCommand = {
    type: 'state',
    state,
  };
  return JSON.stringify(payload);
};
