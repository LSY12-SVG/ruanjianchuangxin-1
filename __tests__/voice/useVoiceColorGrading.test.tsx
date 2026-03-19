import React, {useEffect} from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {useVoiceColorGrading} from '../../src/voice/useVoiceColorGrading';
import {defaultColorGradingParams} from '../../src/types/colorGrading';

jest.mock('../../src/voice/speechRecognizer', () => ({
  createSpeechRecognizer: jest.fn(),
  requestRecordAudioPermission: jest.fn(async () => true),
}));

const {createSpeechRecognizer} = jest.requireMock('../../src/voice/speechRecognizer') as {
  createSpeechRecognizer: jest.Mock;
};

interface VoiceState {
  state: string;
  isRecording: boolean;
  lastError: string;
  startPressToTalk: () => Promise<void>;
}

interface HarnessProps {
  onReady: (state: VoiceState) => void;
}

const Harness: React.FC<HarnessProps> = ({onReady}) => {
  const state = useVoiceColorGrading({
    currentParams: defaultColorGradingParams,
    onApplyParams: () => undefined,
    getImageContext: () => ({image: {} as never, imageStats: {} as never} as never),
  }) as unknown as VoiceState;
  useEffect(() => {
    onReady(state);
  }, [onReady, state]);
  return null;
};

describe('useVoiceColorGrading session lifecycle', () => {
  beforeEach(() => {
    createSpeechRecognizer.mockReset();
  });

  it('recovers to idle when recognizer is preempted by another voice module', async () => {
    let callbacks: Record<string, (() => void) | undefined> = {};
    const adapter = {
      start: jest.fn(async () => undefined),
      stop: jest.fn(async () => undefined),
      destroy: jest.fn(async () => undefined),
    };
    createSpeechRecognizer.mockImplementation((nextCallbacks: Record<string, unknown>) => {
      callbacks = nextCallbacks as Record<string, (() => void) | undefined>;
      return adapter;
    });

    let latestState!: VoiceState;
    await act(async () => {
      TestRenderer.create(
        <Harness
          onReady={state => {
            latestState = state;
          }}
        />,
      );
    });

    await act(async () => {
      await latestState.startPressToTalk();
    });
    await act(async () => {
      callbacks.onPreempted?.();
    });

    expect(latestState.state).toBe('idle');
    expect(latestState.isRecording).toBe(false);
    expect(latestState.lastError).toContain('被其他模块接管');
    expect(adapter.start).toHaveBeenCalledTimes(1);
  });
});
