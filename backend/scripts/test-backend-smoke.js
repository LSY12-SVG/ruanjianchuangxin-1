/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const {spawn} = require('child_process');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const PORT = 8898;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP_DIR = path.resolve(__dirname, '../.tmp');

const createTempDbPath = prefix => {
  fs.mkdirSync(TMP_DIR, {recursive: true});
  return path.join(TMP_DIR, `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.sqlite`);
};

const createTempJsonPath = prefix => {
  fs.mkdirSync(TMP_DIR, {recursive: true});
  return path.join(TMP_DIR, `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.json`);
};

const request = async (url, init = {}) => {
  const response = await fetch(`${BASE}${url}`, init);
  const body = await response.json().catch(() => ({}));
  return {status: response.status, body};
};

const expectStatus = (result, expected, label) => {
  if (result.status !== expected) {
    throw new Error(`${label}_failed:${result.status}`);
  }
};

const startServer = () => {
  const communityDbPath = createTempDbPath('test-community');
  const accountDbPath = createTempDbPath('test-account');
  const agentMemoryPath = createTempJsonPath('test-agent-memory');
  const env = {
    ...process.env,
    PORT: String(PORT),
    COMMUNITY_ENABLE: 'true',
    AUTH_BYPASS: 'false',
    DB_CLIENT: 'sqlite',
    SQLITE_PATH: communityDbPath,
    SQLITE_DB_PATH: accountDbPath,
    AGENT_MEMORY_PATH: agentMemoryPath,
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
  const username = `smoke_user_${Date.now()}`;
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
    expectStatus(registerResult, 201, 'register');
    if (!registerResult.body.token) {
      throw new Error('register_missing_token');
    }

    const loginResult = await request('/v1/auth/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username, password: '123456'}),
    });
    expectStatus(loginResult, 200, 'login');
    const token = loginResult.body.token;
    if (!token) {
      throw new Error('login_missing_token');
    }

    const profileUnauthorized = await request('/v1/profile/me');
    expectStatus(profileUnauthorized, 401, 'profile_unauthorized');

    const feedResult = await request('/v1/community/feed');
    expectStatus(feedResult, 200, 'community_feed_public');
    if (!Array.isArray(feedResult.body.items)) {
      throw new Error('community_feed_items_invalid');
    }

    const draftUnauthorized = await request('/v1/community/drafts', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({title: 'unauthorized', content: 'test'}),
    });
    expectStatus(draftUnauthorized, 401, 'community_create_draft_unauthorized');

    const draftResult = await request('/v1/community/drafts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Smoke Draft',
        content: 'backend smoke test',
        tags: ['smoke', 'api'],
      }),
    });
    expectStatus(draftResult, 201, 'community_create_draft');
    const draftId = String(draftResult.body?.item?.id || '');
    if (!draftId) {
      throw new Error('community_draft_id_missing');
    }

    const publishResult = await request(`/v1/community/drafts/${draftId}/publish`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${token}`},
    });
    expectStatus(publishResult, 200, 'community_publish_draft');
    const postId = String(publishResult.body?.item?.id || '');
    if (!postId) {
      throw new Error('community_post_id_missing');
    }

    const likeResult = await request(`/v1/community/posts/${postId}/like`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({liked: true}),
    });
    expectStatus(likeResult, 200, 'community_like_post');

    const commentResult = await request(`/v1/community/posts/${postId}/comments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({content: 'smoke comment'}),
    });
    expectStatus(commentResult, 201, 'community_create_comment');

    const planResult = await request('/v1/agent/plan', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        intent: {goal: '请帮我发布社区帖子'},
        currentTab: 'agent',
        capabilities: [
          {domain: 'navigation', operation: 'navigate_tab'},
          {domain: 'community', operation: 'create_draft'},
          {domain: 'community', operation: 'publish_draft'},
          {domain: 'app', operation: 'summarize_current_page'},
        ],
      }),
    });
    expectStatus(planResult, 200, 'agent_plan');
    if (!Array.isArray(planResult.body.actions) || planResult.body.actions.length === 0) {
      throw new Error('agent_plan_actions_invalid');
    }

    const executeUnauthorized = await request('/v1/agent/execute', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        planId: 'plan_smoke',
        actions: [
          {
            actionId: 'action_smoke_1',
            domain: 'app',
            operation: 'summarize_current_page',
            requiredScopes: ['app:read'],
            riskLevel: 'low',
          },
        ],
      }),
    });
    expectStatus(executeUnauthorized, 401, 'agent_execute_unauthorized');

    const executeResult = await request('/v1/agent/execute', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-agent-scopes': 'app:read',
      },
      body: JSON.stringify({
        planId: 'plan_smoke',
        actions: [
          {
            actionId: 'action_smoke_1',
            domain: 'app',
            operation: 'summarize_current_page',
            requiredScopes: ['app:read'],
            riskLevel: 'low',
          },
        ],
      }),
    });
    expectStatus(executeResult, 200, 'agent_execute_authorized');
    if (executeResult.body.status !== 'applied') {
      throw new Error(`agent_execute_status_invalid:${String(executeResult.body.status || '')}`);
    }

    const upsertResult = await request('/v1/agent/memory/upsert', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        namespace: 'app.agent',
        key: 'smoke-key',
        value: {value: 'smoke'},
      }),
    });
    expectStatus(upsertResult, 200, 'agent_memory_upsert');
    if (!upsertResult.body.version) {
      throw new Error('agent_memory_version_missing');
    }

    const queryResult = await request('/v1/agent/memory/query', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        namespace: 'app.agent',
        key: 'smoke-key',
      }),
    });
    expectStatus(queryResult, 200, 'agent_memory_query');
    if (!queryResult.body.ok || !queryResult.body.value) {
      throw new Error('agent_memory_query_invalid');
    }

    console.log('test-backend-smoke: PASS');
  } finally {
    server.kill('SIGTERM');
  }
};

run().catch(error => {
  console.error('test-backend-smoke: FAIL', error);
  process.exit(1);
});
