import React, {useEffect} from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {useVoiceColorGrading} from '../../src/voice/useVoiceColorGrading';
import {defaultColorGradingParams} from '../../src/types/colorGrading';

jest.mock('../../src/voice/cloudInterpreter', () => ({
  interpretWithCloud: jest.fn(),
}));

jest.mock('../../src/voice/paramApplier', () => ({
  applyVoiceInterpretation: jest.fn((params: unknown) => params),
  formatInterpretationSummary: jest.fn(() => 'summary'),
}));

jest.mock('../../src/voice/speechRecognizer', () => ({
  createSpeechRecognizer: jest.fn(),
  requestRecordAudioPermission: jest.fn(async () => true),
}));

const {interpretWithCloud} = jest.requireMock('../../src/voice/cloudInterpreter') as {
  interpretWithCloud: jest.Mock;
};

const {applyVoiceInterpretation} = jest.requireMock('../../src/voice/paramApplier') as {
  applyVoiceInterpretation: jest.Mock;
};

const {createSpeechRecognizer} = jest.requireMock('../../src/voice/speechRecognizer') as {
  createSpeechRecognizer: jest.Mock;
};

interface VoiceState {
  state: string;
  isRecording: boolean;
  lastError: string;
  visualState: string;
  requestInitialVisualSuggestion: () => Promise<void>;
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
    interpretWithCloud.mockReset();
    applyVoiceInterpretation.mockClear();
    interpretWithCloud.mockResolvedValue({
      response: null,
      cloudState: 'degraded',
      fallbackReason: 'timeout',
      endpoint: 'http://127.0.0.1:8787',
      latencyMs: 1200,
      attempts: 1,
      retrying: false,
      nextRecoveryAction: 'retry_with_backoff',
    });
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

  it('does not auto-apply a local style fallback for initial visual suggestion', async () => {
    createSpeechRecognizer.mockImplementation(() => ({
      start: jest.fn(async () => undefined),
      stop: jest.fn(async () => undefined),
      destroy: jest.fn(async () => undefined),
    }));

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
      await latestState.requestInitialVisualSuggestion();
    });

    expect(latestState.visualState).toBe('visual_error');
    expect(latestState.lastError).toContain('真实图像理解结果');
    expect(applyVoiceInterpretation).not.toHaveBeenCalled();
  });
});
