describe('provider strict mode', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.MODEL_PROVIDER = 'openai_compat';
  });

  it('throws MODEL_UNAVAILABLE instead of fallback in strict mode', async () => {
    jest.doMock('../../backend/src/providers/openaiCompat', () => ({
      interpretWithOpenAICompat: jest.fn(async () => {
        const error = new Error('Model does not exist. Please check it carefully.');
        error.code = 'MODEL_UNAVAILABLE';
        error.status = 400;
        throw error;
      }),
    }));

    const {interpretWithProvider} = require('../../backend/src/providers');
    await expect(
      interpretWithProvider(
        {
          mode: 'voice_refine',
          transcript: 'test',
          locale: 'zh-CN',
          currentParams: {},
          image: {mimeType: 'image/png', width: 10, height: 10, base64: 'ZmFrZQ=='},
          imageStats: {
            lumaMean: 0.3,
            lumaStd: 0.2,
            highlightClipPct: 0.01,
            shadowClipPct: 0.02,
            saturationMean: 0.4,
          },
        },
        {
          strictMode: true,
          modelChain: ['strict-model'],
          timeoutMs: 2000,
          totalBudgetMs: 3000,
        },
      ),
    ).rejects.toMatchObject({
      code: 'MODEL_UNAVAILABLE',
      status: 503,
    });
  });

  it('keeps fallback behavior when strict mode is disabled', async () => {
    jest.doMock('../../backend/src/providers/openaiCompat', () => ({
      interpretWithOpenAICompat: jest.fn(async () => {
        const error = new Error('provider status 503');
        error.code = 'HTTP_503';
        error.status = 503;
        throw error;
      }),
    }));

    const {interpretWithProvider} = require('../../backend/src/providers');
    const result = await interpretWithProvider(
      {
        mode: 'voice_refine',
        transcript: 'test',
        locale: 'zh-CN',
        currentParams: {},
        image: {mimeType: 'image/png', width: 10, height: 10, base64: 'ZmFrZQ=='},
        imageStats: {
          lumaMean: 0.3,
          lumaStd: 0.2,
          highlightClipPct: 0.01,
          shadowClipPct: 0.02,
          saturationMean: 0.4,
        },
      },
      {
        strictMode: false,
        modelChain: ['fallback-model'],
        timeoutMs: 2000,
        totalBudgetMs: 3000,
      },
    );
    expect(result.source).toBe('fallback');
    expect(result.fallback_used).toBe(true);
  });
});
