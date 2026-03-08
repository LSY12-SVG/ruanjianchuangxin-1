/* eslint-disable no-console */
const path = require('path');
const {spawn} = require('child_process');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const PORT = 8899;
const BASE = `http://127.0.0.1:${PORT}`;

const request = async (url, init = {}) => {
  const response = await fetch(`${BASE}${url}`, init);
  const body = await response.json().catch(() => ({}));
  return {status: response.status, body};
};

const startServer = () => {
  const env = {
    ...process.env,
    PORT: String(PORT),
    COMMUNITY_ENABLE: 'true',
    DB_CLIENT: 'sqlite',
    SQLITE_PATH: path.resolve(__dirname, '../data/test-community.sqlite'),
    SQLITE_DB_PATH: path.resolve(__dirname, '../data/test-account.sqlite'),
    JWT_SECRET: 'test-secret',
    JWT_EXPIRES_IN: '1d',
  };
  const child = spawn('node', ['src/server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', data => {
    process.stdout.write(String(data));
  });
  child.stderr.on('data', data => {
    process.stderr.write(String(data));
  });
  return child;
};

const run = async () => {
  const username = `demo_user_${Date.now()}`;
  const server = startServer();
  try {
    let healthy = false;
    for (let i = 0; i < 50; i += 1) {
      try {
        const health = await request('/health');
        if (health.status === 200) {
          healthy = true;
          break;
        }
      } catch {
        // keep waiting
      }
      await wait(200);
    }
    if (!healthy) {
      throw new Error('server_not_ready');
    }

    const registerResult = await request('/v1/auth/register', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username, password: '123456'}),
    });
    if (registerResult.status !== 201 || !registerResult.body.token) {
      throw new Error(`register_failed:${registerResult.status}`);
    }

    const dupResult = await request('/v1/auth/register', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username, password: '123456'}),
    });
    if (dupResult.status !== 409 || dupResult.body.error !== 'username_taken') {
      throw new Error(`duplicate_check_failed:${dupResult.status}`);
    }

    const loginOk = await request('/v1/auth/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username, password: '123456'}),
    });
    if (loginOk.status !== 200 || !loginOk.body.token) {
      throw new Error(`login_failed:${loginOk.status}`);
    }
    const token = loginOk.body.token;

    const loginBad = await request('/v1/auth/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username, password: 'bad'}),
    });
    if (loginBad.status !== 401 || loginBad.body.error !== 'invalid_credentials') {
      throw new Error(`invalid_credentials_check_failed:${loginBad.status}`);
    }

    const unauthorized = await request('/v1/profile/me');
    if (unauthorized.status !== 401 || unauthorized.body.error !== 'unauthorized') {
      throw new Error(`unauthorized_check_failed:${unauthorized.status}`);
    }

    const me = await request('/v1/profile/me', {
      headers: {Authorization: `Bearer ${token}`},
    });
    if (me.status !== 200 || !me.body.settings) {
      throw new Error(`profile_fetch_failed:${me.status}`);
    }

    const settingsUpdated = await request('/v1/profile/me/settings', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({syncOnWifi: false}),
    });
    if (settingsUpdated.status !== 200 || settingsUpdated.body.settings.syncOnWifi !== false) {
      throw new Error(`settings_update_failed:${settingsUpdated.status}`);
    }

    const profileUpdated = await request('/v1/profile/me', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({displayName: 'Demo User', avatarUrl: 'https://example.com/a.png'}),
    });
    if (
      profileUpdated.status !== 200 ||
      profileUpdated.body.profile.displayName !== 'Demo User'
    ) {
      throw new Error(`profile_update_failed:${profileUpdated.status}`);
    }

    console.log('test-account-flow: PASS');
  } finally {
    server.kill('SIGTERM');
  }
};

run().catch(error => {
  console.error('test-account-flow: FAIL', error);
  process.exit(1);
});
