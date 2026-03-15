const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');

const originalFetch = global.fetch;

test.afterEach(() => {
  global.fetch = originalFetch;
});

function createTestInstance(configOverrides = {}) {
  const dbPath = path.join(
    os.tmpdir(),
    `image-to-3d-${Date.now()}-${Math.floor(Math.random() * 100000)}.db`
  );
  const instance = createApp({
    config: {
      databasePath: dbPath,
      providerName: 'mock',
      mockResultUrl: 'https://modelviewer.dev/shared-assets/models/Astronaut.glb',
      ...configOverrides,
    },
  });

  return {
    ...instance,
    cleanup() {
      instance.dependencies.db.close();
      if (fs.existsSync(dbPath)) {
        fs.rmSync(dbPath, { force: true });
      }
      const walPath = `${dbPath}-wal`;
      const shmPath = `${dbPath}-shm`;
      if (fs.existsSync(walPath)) {
        fs.rmSync(walPath, { force: true });
      }
      if (fs.existsSync(shmPath)) {
        fs.rmSync(shmPath, { force: true });
      }
    },
  };
}

test('creates a job and progresses to a successful GLB result', async () => {
  const instance = createTestInstance();

  try {
    const createResponse = await request(instance.app)
      .post('/api/v1/image-to-3d/jobs')
      .attach('image', Buffer.from('fake image'), {
        filename: 'input.png',
        contentType: 'image/png',
      })
      .expect(202);

    assert.equal(createResponse.body.status, 'queued');
    assert.equal(createResponse.body.pollAfterMs, 5000);

    const taskId = createResponse.body.taskId;

    const firstPoll = await request(instance.app)
      .get(`/api/v1/image-to-3d/jobs/${taskId}`)
      .expect(200);
    assert.equal(firstPoll.body.status, 'queued');

    const secondPoll = await request(instance.app)
      .get(`/api/v1/image-to-3d/jobs/${taskId}`)
      .expect(200);
    assert.equal(secondPoll.body.status, 'processing');

    const thirdPoll = await request(instance.app)
      .get(`/api/v1/image-to-3d/jobs/${taskId}`)
      .expect(200);
    assert.equal(thirdPoll.body.status, 'succeeded');
    assert.equal(thirdPoll.body.fileType, 'GLB');
    assert.equal(thirdPoll.body.viewerFormat, 'glb');
    assert.equal(thirdPoll.body.viewerFiles.length, 1);
    assert.match(
      thirdPoll.body.downloadUrl,
      new RegExp(`^http://127\\.0\\.0\\.1:\\d+/api/v1/image-to-3d/jobs/${taskId}/assets/0$`)
    );
    assert.equal(thirdPoll.body.downloadUrl, thirdPoll.body.viewerFiles[0].url);
    assert.match(thirdPoll.body.previewImageUrl, /poster-astronaut/i);
  } finally {
    instance.cleanup();
  }
});

test('proxies generated assets through the backend with CORS headers', async () => {
  const instance = createTestInstance();

  try {
    const now = new Date().toISOString();
    instance.dependencies.repository.insert({
      taskId: 'asset-task',
      provider: 'tripo',
      providerJobId: 'provider-job',
      status: 'succeeded',
      rawStatus: 'SUCCESS',
      sourceImageRef: 'seed:image/png:100',
      previewUrl: 'https://example.com/model.glb',
      previewImageUrl: 'https://example.com/model.webp',
      downloadUrl: 'https://example.com/model.glb',
      fileType: 'GLB',
      viewerFormat: 'glb',
      viewerFiles: [{type: 'GLB', url: 'https://example.com/model.glb'}],
      errorCode: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    global.fetch = async url => {
      assert.equal(url, 'https://example.com/model.glb');
      return {
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'model/gltf-binary',
          'content-length': '3',
        }),
        arrayBuffer: async () => Uint8Array.from(Buffer.from('glb')).buffer,
      };
    };

    const response = await request(instance.app)
      .get('/api/v1/image-to-3d/jobs/asset-task/assets/0')
      .buffer(true)
      .parse((res, callback) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    assert.equal(response.headers['access-control-allow-origin'], '*');
    assert.equal(response.headers['content-type'], 'model/gltf-binary');
    assert.equal(response.body.toString('utf8'), 'glb');
  } finally {
    instance.cleanup();
  }
});

test('rejects unsupported upload mime types', async () => {
  const instance = createTestInstance();

  try {
    const response = await request(instance.app)
      .post('/api/v1/image-to-3d/jobs')
      .attach('image', Buffer.from('not an image'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      })
      .expect(400);

    assert.equal(response.body.error.code, 'UNSUPPORTED_IMAGE_TYPE');
    assert.match(response.body.error.message, /Only JPEG, PNG, and WebP images are supported/i);
    assert.deepEqual(response.body.error.details.allowedMimeTypes, [
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
  } finally {
    instance.cleanup();
  }
});

test('serializes public asset urls with the configured public base url', async () => {
  const instance = createTestInstance({
    publicBaseUrl: 'http://192.168.0.8:3001/',
  });

  try {
    const createResponse = await request(instance.app)
      .post('/api/v1/image-to-3d/jobs')
      .attach('image', Buffer.from('fake image'), {
        filename: 'input.png',
        contentType: 'image/png',
      })
      .expect(202);

    const taskId = createResponse.body.taskId;
    await request(instance.app).get(`/api/v1/image-to-3d/jobs/${taskId}`).expect(200);
    await request(instance.app).get(`/api/v1/image-to-3d/jobs/${taskId}`).expect(200);
    const response = await request(instance.app)
      .get(`/api/v1/image-to-3d/jobs/${taskId}`)
      .expect(200);

    assert.match(
      response.body.downloadUrl,
      new RegExp(`^http://192\\.168\\.0\\.8:3001/api/v1/image-to-3d/jobs/${taskId}/assets/0$`),
    );
  } finally {
    instance.cleanup();
  }
});

test('returns structured business errors for missing capture sessions', async () => {
  const instance = createTestInstance();

  try {
    const response = await request(instance.app)
      .get('/api/capture-sessions/missing-session')
      .expect(404);

    assert.equal(response.body.error.code, 'CAPTURE_SESSION_NOT_FOUND');
    assert.match(response.body.error.message, /Capture session not found/i);
  } finally {
    instance.cleanup();
  }
});

test('returns expired for succeeded jobs whose download url timed out', async () => {
  const instance = createTestInstance();

  try {
    const now = new Date().toISOString();
    instance.dependencies.repository.insert({
      taskId: 'expired-task',
      provider: 'mock',
      providerJobId: 'mock-job',
      status: 'succeeded',
      rawStatus: 'DONE',
      sourceImageRef: 'seed:image/png:100',
      previewUrl: 'https://example.com/model.glb',
      previewImageUrl: 'https://example.com/model.webp',
      downloadUrl: 'https://example.com/model.glb',
      fileType: 'GLB',
      viewerFormat: 'glb',
      viewerFiles: [{type: 'GLB', url: 'https://example.com/model.glb'}],
      errorCode: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const response = await request(instance.app)
      .get('/api/v1/image-to-3d/jobs/expired-task')
      .expect(200);

    assert.equal(response.body.status, 'expired');
    assert.equal(response.body.downloadUrl, null);
    assert.equal(response.body.viewerFormat, null);
    assert.equal(response.body.previewImageUrl, null);
  } finally {
    instance.cleanup();
  }
});

test('creates a capture session, uploads frames, and returns a model asset after generation', async () => {
  const instance = createTestInstance();

  try {
    const sessionResponse = await request(instance.app)
      .post('/api/capture-sessions')
      .expect(201);

    const sessionId = sessionResponse.body.id;
    assert.equal(sessionResponse.body.status, 'collecting');
    assert.equal(sessionResponse.body.suggestedAngleTag, 'front');

    const angles = [
      'front',
      'front_right',
      'right',
      'back_right',
      'back',
      'back_left',
      'left',
      'front_left',
    ];

    for (const angleTag of angles) {
      const frameResponse = await request(instance.app)
        .post(`/api/capture-sessions/${sessionId}/frames`)
        .field('angleTag', angleTag)
        .field('width', '2200')
        .field('height', '2200')
        .field('fileSize', '420000')
        .attach('image', Buffer.from('fake image'), {
          filename: `${angleTag}.png`,
          contentType: 'image/png',
        })
        .expect(201);

      assert.equal(frameResponse.body.frame.accepted, true);
    }

    const readySession = await request(instance.app)
      .get(`/api/capture-sessions/${sessionId}`)
      .expect(200);
    assert.equal(readySession.body.status, 'ready');
    assert.equal(readySession.body.acceptedFrameCount, 8);

    const generateResponse = await request(instance.app)
      .post(`/api/capture-sessions/${sessionId}/generate`)
      .expect(202);

    const taskId = generateResponse.body.taskId;

    await request(instance.app)
      .get(`/api/reconstruction-tasks/${taskId}`)
      .expect(200);

    await request(instance.app)
      .get(`/api/reconstruction-tasks/${taskId}`)
      .expect(200);

    const finalTask = await request(instance.app)
      .get(`/api/reconstruction-tasks/${taskId}`)
      .expect(200);

    assert.equal(finalTask.body.status, 'succeeded');
    assert.equal(finalTask.body.modelId, taskId);

    const modelResponse = await request(instance.app)
      .get(`/api/models/${taskId}`)
      .expect(200);

    assert.equal(modelResponse.body.id, taskId);
    assert.equal(modelResponse.body.sessionId, sessionId);
    assert.equal(modelResponse.body.viewerFormat, 'glb');
    assert.match(modelResponse.body.glbUrl, /\/api\/v1\/image-to-3d\/jobs\//);
  } finally {
    instance.cleanup();
  }
});


