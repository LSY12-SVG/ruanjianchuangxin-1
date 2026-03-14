const http = require('node:http');
const express = require('../../backend/node_modules/express');
const {createCommunityRouter} = require('../../backend/src/community/routes');

const startServer = app =>
  new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });

const stopServer = server =>
  new Promise((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

const requestJson = (server, {method, path, headers, body}) =>
  new Promise((resolve, reject) => {
    const address = server.address();
    const request = http.request(
      {
        method,
        host: '127.0.0.1',
        port: address.port,
        path,
        headers: {
          'Content-Type': 'application/json',
          ...(headers || {}),
        },
      },
      response => {
        let raw = '';
        response.on('data', chunk => {
          raw += String(chunk);
        });
        response.on('end', () => {
          let json = {};
          try {
            json = raw ? JSON.parse(raw) : {};
          } catch {
            json = {};
          }
          resolve({
            status: Number(response.statusCode || 0),
            body: json,
          });
        });
      },
    );
    request.on('error', reject);
    if (body !== undefined) {
      request.write(JSON.stringify(body));
    }
    request.end();
  });

const createAuthMiddleware = () => (req, res, next) => {
  if (req.header('Authorization') !== 'Bearer valid-token') {
    res.status(401).json({error: 'unauthorized'});
    return;
  }
  req.user = {id: 7, username: 'alice'};
  next();
};

const createOptionalAuthMiddleware = () => (req, _res, next) => {
  if (req.header('Authorization') === 'Bearer valid-token') {
    req.user = {id: 7, username: 'alice'};
  }
  next();
};

describe('community auth routing', () => {
  let server;
  let repo;

  beforeEach(async () => {
    repo = {
      getFeed: jest.fn(async () => ({items: [], page: 1, size: 10, total: 0, hasMore: false})),
      getMyPosts: jest.fn(async () => ({items: [], page: 1, size: 10, total: 0, hasMore: false})),
      createDraft: jest.fn(async () => ({id: '1', title: 'hello'})),
      updateDraft: jest.fn(),
      publishDraft: jest.fn(),
      toggleLike: jest.fn(),
      toggleSave: jest.fn(),
      getComments: jest.fn(async () => ({items: [], page: 1, size: 10, total: 0, hasMore: false})),
      createComment: jest.fn(),
    };

    const app = express();
    app.use(express.json());
    app.use(
      '/v1/community',
      createCommunityRouter({
        repo,
        authMiddleware: createAuthMiddleware(),
        optionalAuthMiddleware: createOptionalAuthMiddleware(),
        pageSizeDefault: 10,
        pageSizeMax: 30,
      }),
    );
    server = await startServer(app);
  });

  afterEach(async () => {
    await stopServer(server);
  });

  test('allows public feed reads in guest mode', async () => {
    const response = await requestJson(server, {
      method: 'GET',
      path: '/v1/community/feed?page=1&size=10&filter=all',
    });

    expect(response.status).toBe(200);
    expect(repo.getFeed).toHaveBeenCalledWith(
      'guest',
      expect.objectContaining({page: 1, size: 10, filter: 'all'}),
    );
  });

  test('rejects write without JWT', async () => {
    const response = await requestJson(server, {
      method: 'POST',
      path: '/v1/community/drafts',
      body: {title: 'test', content: '', tags: []},
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({error: 'unauthorized'});
    expect(repo.createDraft).not.toHaveBeenCalled();
  });

  test('accepts write with JWT and passes sub as author id', async () => {
    const response = await requestJson(server, {
      method: 'POST',
      path: '/v1/community/drafts',
      headers: {Authorization: 'Bearer valid-token'},
      body: {title: 'test', content: '', tags: []},
    });

    expect(response.status).toBe(201);
    expect(repo.createDraft).toHaveBeenCalledWith(
      '7',
      expect.objectContaining({title: 'test'}),
    );
  });
});
