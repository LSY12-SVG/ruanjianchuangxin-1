const {createTokenTools} = require('../../backend/src/account/token');
const {createAuthMiddleware} = require('../../backend/src/account/middleware');

describe('account auth scopes compatibility', () => {
  const envBackup = {...process.env};

  afterEach(() => {
    process.env = {...envBackup};
  });

  test('signed jwt includes default scopes when user scopes are not provided', () => {
    process.env.AGENT_DEFAULT_SCOPES = 'app:read,app:navigate,community:write';
    const tokenTools = createTokenTools({
      jwtSecret: 'test-secret',
      jwtExpiresIn: '1h',
    });
    const token = tokenTools.sign({
      id: 100,
      username: 'scope_user',
    });
    const payload = tokenTools.verify(token);

    expect(payload.scopes).toEqual(['app:read', 'app:navigate', 'community:write']);
  });

  test('middleware injects fallback scopes for legacy token without scopes field', () => {
    process.env.AGENT_DEFAULT_SCOPES = 'app:navigate,convert:write';
    const middleware = createAuthMiddleware({
      verify: jest.fn(() => ({
        sub: '3',
        username: 'legacy_user',
      })),
    });
    const req = {
      header: jest.fn(() => 'Bearer legacy.token'),
    };
    const json = jest.fn();
    const res = {
      status: jest.fn(() => ({json})),
    };
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual(
      expect.objectContaining({
        id: 3,
        username: 'legacy_user',
        scopes: ['app:navigate', 'convert:write'],
      }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });
});
