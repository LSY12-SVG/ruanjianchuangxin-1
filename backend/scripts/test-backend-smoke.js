/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const {spawn} = require('child_process');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const PORT = Number(process.env.SMOKE_PORT || 8898);
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
    throw new Error(`${label}_failed:${result.status}:${JSON.stringify(result.body)}`);
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
    JWT_SECRET: process.env.JWT_SECRET || 'test-secret',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d',
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

const tinyPngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR42mP8/5+hHgAHggJ/PvN4WQAAAABJRU5ErkJggg==';
const tinyPngBuffer = Buffer.from(tinyPngBase64, 'base64');

const createImageForm = () => {
  const form = new FormData();
  form.append('image', new Blob([tinyPngBuffer], {type: 'image/png'}), 'smoke.png');
  return form;
};

const pollTaskUntilReady = async ({taskId, label}) => {
  const maxAttempts = Number(process.env.SMOKE_MODEL_POLL_ATTEMPTS || 24);
  const intervalMs = Number(process.env.SMOKE_MODEL_POLL_INTERVAL_MS || 5000);
  let latest = null;
  for (let i = 0; i < maxAttempts; i += 1) {
    latest = await request(`/v1/modules/modeling/jobs/${taskId}`);
    if (latest.status !== 200) {
      throw new Error(`${label}_poll_failed:${latest.status}`);
    }
    if (latest.body.status === 'succeeded') {
      return latest;
    }
    if (latest.body.status === 'failed' || latest.body.status === 'expired') {
      throw new Error(`${label}_status_${latest.body.status}`);
    }
    await wait(intervalMs);
  }
  throw new Error(`${label}_poll_timeout:${latest?.body?.status || 'unknown'}`);
};

const run = async () => {
  const username = `smoke_user_${Date.now()}`;
  const server = startServer();
  try {
    let healthy = false;
    for (let i = 0; i < 80; i += 1) {
      try {
        const health = await request('/v1/modules/health');
        if (health.status === 200 && health.body?.ok === true) {
          healthy = true;
          break;
        }
      } catch {
        // keep waiting
      }
      await wait(250);
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
    const token = registerResult.body.token;
    if (!token) {
      throw new Error('register_missing_token');
    }

    const initialSuggest = await request('/v1/modules/color/initial-suggest', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        locale: 'zh-CN',
        transcript: '',
        currentParams: {basic: {}},
        image: {
          mimeType: 'image/png',
          width: 256,
          height: 256,
          base64: tinyPngBase64,
        },
        imageStats: {
          lumaMean: 0.4,
          lumaStd: 0.2,
          highlightClipPct: 0.02,
          shadowClipPct: 0.03,
          saturationMean: 0.35,
        },
      }),
    });
    expectStatus(initialSuggest, 200, 'color_initial_suggest');

    const voiceRefine = await request('/v1/modules/color/voice-refine', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        locale: 'zh-CN',
        transcript: '高光降低一点，阴影拉一点',
        currentParams: {basic: {}},
        image: {
          mimeType: 'image/png',
          width: 256,
          height: 256,
          base64: tinyPngBase64,
        },
        imageStats: {
          lumaMean: 0.4,
          lumaStd: 0.2,
          highlightClipPct: 0.02,
          shadowClipPct: 0.03,
          saturationMean: 0.35,
        },
      }),
    });
    expectStatus(voiceRefine, 200, 'color_voice_refine');

    const autoGradeFast = await request('/v1/modules/color/pro/auto-grade', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        mode: 'upload_autograde',
        phase: 'fast',
        locale: 'zh-CN',
        currentParams: {},
        image: {
          mimeType: 'image/png',
          width: 256,
          height: 256,
          base64: tinyPngBase64,
        },
        imageStats: {
          lumaMean: 0.4,
          lumaStd: 0.2,
          highlightClipPct: 0.02,
          shadowClipPct: 0.03,
          saturationMean: 0.35,
        },
      }),
    });
    expectStatus(autoGradeFast, 200, 'pro_auto_grade_fast');

    const autoGradeRefine = await request('/v1/modules/color/pro/auto-grade', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        mode: 'upload_autograde',
        phase: 'refine',
        locale: 'zh-CN',
        currentParams: {},
        image: {
          mimeType: 'image/png',
          width: 256,
          height: 256,
          base64: tinyPngBase64,
        },
        imageStats: {
          lumaMean: 0.4,
          lumaStd: 0.2,
          highlightClipPct: 0.02,
          shadowClipPct: 0.03,
          saturationMean: 0.35,
        },
      }),
    });
    expectStatus(autoGradeRefine, 200, 'pro_auto_grade_refine');

    const createJob = await request('/v1/modules/modeling/jobs', {
      method: 'POST',
      body: createImageForm(),
    });
    expectStatus(createJob, 202, 'modeling_create_job');
    const taskId = String(createJob.body?.taskId || '');
    if (!taskId) {
      throw new Error('modeling_task_id_missing');
    }
    await pollTaskUntilReady({taskId, label: 'modeling_job'});

    const modelResult = await request(`/v1/modules/modeling/models/${taskId}`);
    expectStatus(modelResult, 200, 'modeling_model_fetch');

    const createSession = await request('/v1/modules/modeling/capture-sessions', {
      method: 'POST',
    });
    expectStatus(createSession, 201, 'modeling_create_capture_session');
    const sessionId = String(createSession.body?.id || '');
    if (!sessionId) {
      throw new Error('capture_session_id_missing');
    }

    const angleTags = ['front', 'front_right', 'right', 'back_right', 'back', 'back_left', 'left', 'front_left'];
    for (const angleTag of angleTags) {
      const frameForm = createImageForm();
      frameForm.append('angleTag', angleTag);
      frameForm.append('width', '256');
      frameForm.append('height', '256');
      frameForm.append('fileSize', String(tinyPngBuffer.length));
      const addFrame = await request(`/v1/modules/modeling/capture-sessions/${sessionId}/frames`, {
        method: 'POST',
        body: frameForm,
      });
      expectStatus(addFrame, 201, `capture_add_frame_${angleTag}`);
    }

    const generate = await request(`/v1/modules/modeling/capture-sessions/${sessionId}/generate`, {
      method: 'POST',
    });
    expectStatus(generate, 202, 'capture_generate');
    const captureTaskId = String(generate.body?.taskId || '');
    if (!captureTaskId) {
      throw new Error('capture_task_id_missing');
    }
    await pollTaskUntilReady({taskId: captureTaskId, label: 'capture_modeling_job'});

    const planResult = await request('/v1/modules/agent/plan', {
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

    const executeResult = await request('/v1/modules/agent/execute', {
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

    const feedResult = await request('/v1/modules/community/feed');
    expectStatus(feedResult, 200, 'community_feed_public');

    const draftResult = await request('/v1/modules/community/drafts', {
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

    const publishResult = await request(`/v1/modules/community/drafts/${draftId}/publish`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${token}`},
    });
    expectStatus(publishResult, 200, 'community_publish_draft');

    console.log('test-backend-smoke: PASS');
  } finally {
    server.kill('SIGTERM');
  }
};

run().catch(error => {
  console.error('test-backend-smoke: FAIL', error);
  process.exit(1);
});
