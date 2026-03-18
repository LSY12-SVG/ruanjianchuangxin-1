import {NativeModules} from 'react-native';
import {createSpeechRecognizer} from '../../src/voice/speechRecognizer';

describe('speech recognizer arbitration', () => {
  const voiceRecognition = NativeModules.VoiceRecognition as {
    start: jest.Mock;
    stop: jest.Mock;
    destroy: jest.Mock;
    addListener?: jest.Mock;
    removeListeners?: jest.Mock;
  };

  beforeEach(() => {
    voiceRecognition.start.mockClear();
    voiceRecognition.stop.mockClear();
    voiceRecognition.destroy.mockClear();
    voiceRecognition.addListener = jest.fn();
    voiceRecognition.removeListeners = jest.fn();
  });

  it('preempts previous recognizer before starting a new one', async () => {
    const preempted = jest.fn();
    const globalRecognizer = createSpeechRecognizer({onPreempted: preempted});
    const gradingRecognizer = createSpeechRecognizer({});

    await globalRecognizer.start('zh-CN');
    await gradingRecognizer.start('zh-CN');

    expect(voiceRecognition.start).toHaveBeenCalledTimes(2);
    expect(voiceRecognition.stop).toHaveBeenCalledTimes(1);
    expect(preempted).toHaveBeenCalledTimes(1);

    await gradingRecognizer.destroy();
    await globalRecognizer.destroy();
  });

  it('does not destroy native recognizer when stale instance is destroyed', async () => {
    const first = createSpeechRecognizer({});
    const second = createSpeechRecognizer({});

    await first.start('zh-CN');
    await second.start('zh-CN');
    voiceRecognition.destroy.mockClear();

    await first.destroy();
    expect(voiceRecognition.destroy).not.toHaveBeenCalled();

    await second.destroy();
    expect(voiceRecognition.destroy).toHaveBeenCalledTimes(1);
  });

  it('ignores stop on stale recognizer instance', async () => {
    const first = createSpeechRecognizer({});
    const second = createSpeechRecognizer({});

    await first.start('zh-CN');
    await second.start('zh-CN');
    voiceRecognition.stop.mockClear();

    await first.stop();
    expect(voiceRecognition.stop).not.toHaveBeenCalled();

    await second.stop();
    expect(voiceRecognition.stop).toHaveBeenCalledTimes(1);

    await second.destroy();
    await first.destroy();
  });
});
