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

const getRouteHandler = (router, method, path) => {
  const route = router.routes.find(item => item.path === path && item.method === method);
  if (!route) {
    throw new Error(`route ${method.toUpperCase()} ${path} not found`);
  }
  return route.handler;
};

const setupColorModuleDeps = () => {
  const handleInterpret = jest.fn(async (_request, options) => {
    if (options?.strictMode) {
      return {
        status: 502,
        payload: {
          error: {
            code: 'REAL_MODEL_REQUIRED',
            message: 'strict reject',
          },
        },
      };
    }
    return {
      status: 200,
      payload: {
        actions: [{action: 'apply_style', target: 'style', style: 'fresh_bright'}],
      },
    };
  });

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

  jest.doMock('../../backend/src/colorIntelligence/services/interpretService', () => ({
    handleInterpret,
  }));

  jest.doMock('../../backend/src/colorIntelligence/services/autoGradeService', () => ({
    handleAutoGrade: jest.fn(async () => ({
      status: 200,
      payload: {},
    })),
  }));

  jest.doMock('../../backend/src/colorIntelligence/services/segmentationService', () => ({
    handleSegmentation: jest.fn(() => ({
      status: 200,
      payload: {},
    })),
  }));

  jest.doMock('../../backend/src/modules/errorResponse', () => ({
    sendError,
  }));

  return {
    handleInterpret,
    sendError,
  };
};

describe('color module initial suggest strict config', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {...ORIGINAL_ENV};
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('uses strict initial suggest by default', async () => {
    delete process.env.COLOR_INITIAL_STRICT_MODE;
    setupVirtualExpress();
    const {handleInterpret, sendError} = setupColorModuleDeps();

    const {createColorModule} = require('../../backend/src/modules/colorModule');
    const module = createColorModule();
    const handler = getRouteHandler(module.router, 'post', '/initial-suggest');
    const res = makeResponse();

    await handler({body: {image: {base64: 'x', mimeType: 'image/jpeg'}}}, res);

    expect(handleInterpret).toHaveBeenCalledWith(
      expect.objectContaining({mode: 'initial_visual_suggest'}),
      expect.objectContaining({strictMode: true, responseShape: 'module'}),
    );
    expect(sendError).toHaveBeenCalled();
    expect(res.statusCode).toBe(502);
    expect(res.payload).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({code: 'REAL_MODEL_REQUIRED'}),
      }),
    );
  });

  it('allows fallback initial suggest only when COLOR_INITIAL_STRICT_MODE=false', async () => {
    process.env.COLOR_INITIAL_STRICT_MODE = 'false';
    setupVirtualExpress();
    const {handleInterpret} = setupColorModuleDeps();

    const {createColorModule} = require('../../backend/src/modules/colorModule');
    const module = createColorModule();
    const handler = getRouteHandler(module.router, 'post', '/initial-suggest');
    const res = makeResponse();

    await handler({body: {image: {base64: 'x', mimeType: 'image/jpeg'}}}, res);

    expect(handleInterpret).toHaveBeenCalledWith(
      expect.objectContaining({mode: 'initial_visual_suggest'}),
      expect.objectContaining({strictMode: false, responseShape: 'module'}),
    );
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual(expect.objectContaining({actions: expect.any(Array)}));
  });
});
