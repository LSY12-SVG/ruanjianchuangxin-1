const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');

function createTestInstance() {
  const dbPath = path.join(
    os.tmpdir(),
    `image-to-3d-${Date.now()}-${Math.floor(Math.random() * 100000)}.db`
  );
  const instance = createApp({
    config: {
      databasePath: dbPath,
      providerName: 'mock',
      mockResultUrl: 'https://modelviewer.dev/shared-assets/models/Astronaut.glb',
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
    assert.match(thirdPoll.body.downloadUrl, /\.glb$/i);
    assert.match(thirdPoll.body.previewImageUrl, /poster-astronaut/i);
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

    assert.match(response.body.error.message, /Only JPEG, PNG, and WebP images are supported/i);
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