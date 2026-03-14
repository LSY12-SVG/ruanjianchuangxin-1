const {
  createAuthMiddleware,
  createOptionalAuthMiddleware,
} = require('../../backend/src/account/middleware');

describe('account auth middleware bypass', () => {
  const envBackup = {...process.env};

  afterEach(() => {
    process.env = {...envBackup};
  });

  test('createAuthMiddleware allows debug access when AUTH_BYPASS=true', () => {
    process.env.AUTH_BYPASS = 'true';
    const middleware = createAuthMiddleware({
      verify: jest.fn(() => {
        throw new Error('invalid token');
      }),
    });

    const req = {
      header: jest.fn(() => ''),
    };
    const res = {
      status: jest.fn(() => ({
        json: jest.fn(),
      })),
    };
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual(
      expect.objectContaining({
        id: 1,
        isBypass: true,
      }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  test('createOptionalAuthMiddleware injects debug user without token', () => {
    process.env.AUTH_BYPASS = 'true';
    const middleware = createOptionalAuthMiddleware({
      verify: jest.fn(() => {
        throw new Error('invalid token');
      }),
    });

    const req = {
      header: jest.fn(() => ''),
    };
    const next = jest.fn();

    middleware(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual(
      expect.objectContaining({
        id: 1,
        isBypass: true,
      }),
    );
  });
});
