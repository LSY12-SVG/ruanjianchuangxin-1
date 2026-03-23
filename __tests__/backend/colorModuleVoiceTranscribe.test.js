const makeResponse = () => {
  const response = {
    statusCode: 200,
    payload: null,
  };
  response.status = code => {
    response.statusCode = code;
    return response;
  };
  response.json = payload => {
    response.payload = payload;
    return response;
  };
  return response;
};

const flushAsync = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
};

const setupVirtualExpress = () => {
  jest.doMock(
    'express',
    () => {
      const expressMock = () => ({});
      expressMock.Router = () => {
        const routes = [];
        return {
          routes,
          post(path, handler) {
            routes.push({method: 'post', path, handler});
            return this;
          },
          get(path, handler) {
            routes.push({method: 'get', path, handler});
            return this;
          },
        };
      };
      return expressMock;
    },
    {virtual: true},
  );
};

const setupVirtualMulter = () => {
  jest.doMock(
    'multer',
    () => {
    class MulterError extends Error {
      constructor(code) {
        super(code);
        this.code = code;
      }
    }
    const multerMock = jest.fn(() => ({
      single: () => (req, _res, cb) => {
        if (req.__uploadError) {
          cb(req.__uploadError);
          return;
        }
        if (req.__mockFile) {
          req.file = req.__mockFile;
        }
        const result = cb();
        if (result && typeof result.catch === 'function') {
          result.catch(() => undefined);
        }
      },
    }));
    multerMock.memoryStorage = jest.fn(() => ({}));
    multerMock.MulterError = MulterError;
    return multerMock;
    },
    {virtual: true},
  );
};

const getRouteHandler = (router, method, path) => {
  const route = router.routes.find(item => item.path === path && item.method === method);
  if (!route) {
    throw new Error(`route ${method.toUpperCase()} ${path} not found`);
  }
  return route.handler;
};

const setupDeps = () => {
  const transcribeWithProvider = jest.fn(async () => ({
    transcript: '亮度加10',
    language: 'zh-CN',
    durationMs: 1100,
  }));
  const sendError = jest.fn((res, status, code, message, details) => {
    res.status(status).json({
      error: {
        code,
        message,
        details: details || null,
      },
    });
  });

  jest.doMock('../../backend/src/colorIntelligence', () => ({
    refreshModelHealth: jest.fn(async () => undefined),
    getRuntimeSnapshot: jest.fn(() => ({
      refineModelReady: true,
      missingModelIds: [],
      modelCheckError: '',
      lastCheckedAt: null,
    })),
  }));

  jest.doMock('../../backend/src/providers', () => ({
    transcribeWithProvider,
  }));

  jest.doMock('../../backend/src/colorIntelligence/services/interpretService', () => ({
    handleInterpret: jest.fn(async () => ({status: 200, payload: {actions: []}})),
  }));
  jest.doMock('../../backend/src/colorIntelligence/services/autoGradeService', () => ({
    handleAutoGrade: jest.fn(async () => ({status: 200, payload: {}})),
  }));
  jest.doMock('../../backend/src/colorIntelligence/services/segmentationService', () => ({
    handleSegmentation: jest.fn(() => ({status: 200, payload: {}})),
  }));
  jest.doMock('../../backend/src/modules/errorResponse', () => ({sendError}));

  return {transcribeWithProvider, sendError};
};

describe('color module voice transcribe route', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {...ORIGINAL_ENV};
    setupVirtualExpress();
    setupVirtualMulter();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns transcript when upload and ASR succeed', async () => {
    const {transcribeWithProvider} = setupDeps();
    const {createColorModule} = require('../../backend/src/modules/colorModule');
    const module = createColorModule();
    const handler = getRouteHandler(module.router, 'post', '/voice-transcribe');

    const req = {
      body: {locale: 'zh-CN'},
      __mockFile: {
        buffer: Buffer.from('audio-data'),
        mimetype: 'audio/mp4',
        originalname: 'voice.m4a',
        size: 10,
      },
    };
    const res = makeResponse();

    handler(req, res);
    await flushAsync();

    expect(transcribeWithProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: 'audio/mp4',
        fileName: 'voice.m4a',
        language: 'zh-CN',
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual(
      expect.objectContaining({
        transcript: '亮度加10',
      }),
    );
  });

  it('returns ASR_BAD_AUDIO when file is missing', async () => {
    const {sendError} = setupDeps();
    const {createColorModule} = require('../../backend/src/modules/colorModule');
    const module = createColorModule();
    const handler = getRouteHandler(module.router, 'post', '/voice-transcribe');
    const res = makeResponse();

    handler({body: {}}, res);
    await flushAsync();

    expect(sendError).toHaveBeenCalledWith(
      expect.any(Object),
      400,
      'ASR_BAD_AUDIO',
      expect.any(String),
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns ASR_BAD_AUDIO on upload size limit', async () => {
    setupDeps();
    const multer = require('multer');
    const {createColorModule} = require('../../backend/src/modules/colorModule');
    const module = createColorModule();
    const handler = getRouteHandler(module.router, 'post', '/voice-transcribe');
    const res = makeResponse();

    handler(
      {
        body: {},
        __uploadError: new multer.MulterError('LIMIT_FILE_SIZE'),
      },
      res,
    );
    await flushAsync();

    expect(res.statusCode).toBe(413);
    expect(res.payload).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({code: 'ASR_BAD_AUDIO'}),
      }),
    );
  });

  it('maps timeout and misconfig provider errors to expected codes', async () => {
    const {transcribeWithProvider} = setupDeps();
    const {createColorModule} = require('../../backend/src/modules/colorModule');
    const module = createColorModule();
    const handler = getRouteHandler(module.router, 'post', '/voice-transcribe');

    transcribeWithProvider.mockRejectedValueOnce(
      Object.assign(new Error('timeout'), {code: 'TIMEOUT'}),
    );
    const timeoutRes = makeResponse();
    handler(
      {
        body: {},
        __mockFile: {
          buffer: Buffer.from('audio-data'),
          mimetype: 'audio/mp4',
          originalname: 'voice.m4a',
          size: 10,
        },
      },
      timeoutRes,
    );
    await flushAsync();
    expect(timeoutRes.statusCode).toBe(504);
    expect(timeoutRes.payload.error.code).toBe('ASR_TIMEOUT');

    transcribeWithProvider.mockRejectedValueOnce(
      Object.assign(new Error('missing asr config'), {code: 'MISCONFIG'}),
    );
    const misconfigRes = makeResponse();
    handler(
      {
        body: {},
        __mockFile: {
          buffer: Buffer.from('audio-data'),
          mimetype: 'audio/mp4',
          originalname: 'voice.m4a',
          size: 10,
        },
      },
      misconfigRes,
    );
    await flushAsync();
    expect(misconfigRes.statusCode).toBe(500);
    expect(misconfigRes.payload.error.code).toBe('ASR_MISCONFIG');
  });
});
