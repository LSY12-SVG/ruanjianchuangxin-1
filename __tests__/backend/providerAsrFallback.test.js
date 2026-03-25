describe('provider ASR fallback config', () => {
  const ENV_BACKUP = {...process.env};

  beforeEach(() => {
    jest.resetModules();
    process.env = {...ENV_BACKUP};
  });

  afterAll(() => {
    process.env = ENV_BACKUP;
  });

  it('falls back to MODEL_* config when ASR_* vars are missing', async () => {
    process.env.MODEL_BASE_URL = 'https://example.com/v1';
    process.env.MODEL_API_KEY = 'model-key';
    process.env.MODEL_TIMEOUT_MS = '8000';
    process.env.ASR_BASE_URL = '';
    process.env.ASR_API_KEY = '';
    process.env.ASR_MODEL = '';

    const transcribeMock = jest.fn(async () => ({transcript: 'ok'}));
    jest.doMock('../../backend/src/providers/openaiCompat', () => ({
      interpretWithOpenAICompat: jest.fn(),
      transcribeWithOpenAICompat: transcribeMock,
    }));

    const {transcribeWithProvider} = require('../../backend/src/providers');
    await transcribeWithProvider({
      buffer: Buffer.from('audio'),
      mimeType: 'audio/mp4',
      fileName: 'voice.m4a',
      language: 'zh-CN',
    });

    expect(transcribeMock).toHaveBeenCalledTimes(1);
    const [, options] = transcribeMock.mock.calls[0];
    expect(options.baseUrl).toBe('https://example.com/v1');
    expect(options.apiKey).toBe('model-key');
    expect(options.timeoutMs).toBe(8000);
    expect(options.model).toBe('FunAudioLLM/SenseVoiceSmall');
  });
});
