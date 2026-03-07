const makeValidProviderPayload = (reasoning = 'ok') => ({
  actions: [
    {
      action: 'adjust_param',
      target: 'brightness',
      delta: 12,
    },
  ],
  confidence: 0.92,
  reasoning_summary: reasoning,
  fallback_used: false,
  needsConfirmation: true,
  message: 'ok',
  source: 'cloud',
});

describe('backend provider routing', () => {
  const ENV_BACKUP = {...process.env};

  beforeEach(() => {
    jest.resetModules();
    process.env = {...ENV_BACKUP};
    process.env.MODEL_PROVIDER = 'openai_compat';
    process.env.MODEL_PRIMARY_NAME = 'primary-model';
    process.env.MODEL_FALLBACK_NAME = 'fallback-model';
    process.env.MODEL_TIMEOUT_MS = '8000';
  });

  afterAll(() => {
    process.env = ENV_BACKUP;
  });

  it('switches to fallback model when primary times out', async () => {
    const providerMock = jest.fn(async (_request, options) => {
      if (options.model === 'primary-model') {
        const error = new Error('timeout');
        error.code = 'TIMEOUT';
        throw error;
      }
      return makeValidProviderPayload('fallback success');
    });
    const fallbackParserMock = jest.fn(() => ({
      actions: [],
      confidence: 0.2,
      reasoning_summary: 'fallback parser',
      fallback_used: true,
      needsConfirmation: true,
      message: 'fallback',
      source: 'fallback',
    }));

    jest.doMock('../../backend/src/providers/openaiCompat', () => ({
      interpretWithOpenAICompat: providerMock,
    }));
    jest.doMock('../../backend/src/providers/fallback', () => ({
      fallbackInterpret: fallbackParserMock,
    }));

    const {interpretWithProvider} = require('../../backend/src/providers');
    const result = await interpretWithProvider({
      transcript: '来点电影感',
      currentParams: {},
      locale: 'zh-CN',
    });

    expect(providerMock).toHaveBeenCalledTimes(2);
    expect(providerMock.mock.calls[0][1].model).toBe('primary-model');
    expect(providerMock.mock.calls[1][1].model).toBe('fallback-model');
    expect(fallbackParserMock).not.toHaveBeenCalled();
    expect(result.model_used).toBe('fallback-model');
    expect(result.fallback_used).toBe(true);
    expect(result.reasoning_summary).toContain('route:fallback_model');
  });

  it('treats schema invalid as retryable and uses fallback model', async () => {
    const providerMock = jest.fn(async (_request, options) => {
      if (options.model === 'primary-model') {
        return {
          actions: [{action: 'set_param', target: 'brightness'}],
          confidence: 0.6,
          reasoning_summary: 'invalid action payload',
          fallback_used: false,
          needsConfirmation: true,
          message: 'invalid',
          source: 'cloud',
        };
      }
      return makeValidProviderPayload('schema recovered');
    });

    jest.doMock('../../backend/src/providers/openaiCompat', () => ({
      interpretWithOpenAICompat: providerMock,
    }));
    jest.doMock('../../backend/src/providers/fallback', () => ({
      fallbackInterpret: jest.fn(),
    }));

    const {interpretWithProvider} = require('../../backend/src/providers');
    const result = await interpretWithProvider({
      transcript: '通透一些',
      currentParams: {},
      locale: 'zh-CN',
    });

    expect(providerMock).toHaveBeenCalledTimes(2);
    expect(result.model_used).toBe('fallback-model');
    expect(result.intent_actions).toHaveLength(1);
  });

  it('returns parser fallback when both cloud models fail', async () => {
    const providerMock = jest.fn(async () => {
      const error = new Error('provider status 503');
      error.code = 'HTTP_503';
      error.status = 503;
      throw error;
    });
    const fallbackParserMock = jest.fn(() => ({
      actions: [],
      confidence: 0.35,
      reasoning_summary: 'parser fallback',
      fallback_used: true,
      needsConfirmation: true,
      message: 'fallback',
      source: 'fallback',
    }));

    jest.doMock('../../backend/src/providers/openaiCompat', () => ({
      interpretWithOpenAICompat: providerMock,
    }));
    jest.doMock('../../backend/src/providers/fallback', () => ({
      fallbackInterpret: fallbackParserMock,
    }));

    const {interpretWithProvider} = require('../../backend/src/providers');
    const result = await interpretWithProvider({
      transcript: '随便调一下',
      currentParams: {},
      locale: 'zh-CN',
    });

    expect(providerMock).toHaveBeenCalledTimes(2);
    expect(fallbackParserMock).toHaveBeenCalledTimes(1);
    expect(result.model_used).toBe('local_fallback_parser');
    expect(result.reasoning_summary).toContain('route:fallback_parser');
    expect(result.fallback_used).toBe(true);
  });
});
