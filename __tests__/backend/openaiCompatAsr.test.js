const {transcribeWithOpenAICompat} = require('../../backend/src/providers/openaiCompat');

describe('openaiCompat ASR adapter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('parses transcript from successful response', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        text: '亮度加10',
        language: 'zh',
        duration: 1.23,
      }),
    }));

    const result = await transcribeWithOpenAICompat(
      {
        buffer: Buffer.from('audio-data'),
        mimeType: 'audio/mp4',
        fileName: 'voice.m4a',
        language: 'zh-CN',
      },
      {
        baseUrl: 'https://example.com/v1',
        apiKey: 'k',
        model: 'asr-model',
        timeoutMs: 1000,
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        transcript: '亮度加10',
        language: 'zh',
      }),
    );
    expect(result.durationMs).toBeCloseTo(1230, 0);
  });

  it('maps timeout error to TIMEOUT', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch = jest.fn(async () => {
      throw abortError;
    });

    await expect(
      transcribeWithOpenAICompat(
        {
          buffer: Buffer.from('audio-data'),
        },
        {
          baseUrl: 'https://example.com/v1',
          apiKey: 'k',
          model: 'asr-model',
          timeoutMs: 1000,
        },
      ),
    ).rejects.toMatchObject({code: 'TIMEOUT'});
  });

  it('maps 400 model errors to MODEL_UNAVAILABLE', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          message: 'model not found',
        },
      }),
    }));

    await expect(
      transcribeWithOpenAICompat(
        {
          buffer: Buffer.from('audio-data'),
        },
        {
          baseUrl: 'https://example.com/v1',
          apiKey: 'k',
          model: 'asr-model',
          timeoutMs: 1000,
        },
      ),
    ).rejects.toMatchObject({code: 'MODEL_UNAVAILABLE'});
  });
});

