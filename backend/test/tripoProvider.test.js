const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createTripoProvider,
  extractTripoMessage,
  normalizeTripoStatus,
  normalizeTripoOutput,
  getImageType,
} = require('../src/providers/tripoProvider');

const originalFetch = global.fetch;

test.afterEach(() => {
  global.fetch = originalFetch;
});

test('submits a Tripo image-to-model task after uploading the source image', async () => {
  const calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push({ url, init });

    if (url === 'https://api.tripo3d.ai/v2/openapi/upload') {
      return {
        ok: true,
        text: async () => JSON.stringify({ code: 0, data: { image_token: 'img-token-1' } }),
      };
    }

    if (url === 'https://api.tripo3d.ai/v2/openapi/task') {
      return {
        ok: true,
        text: async () => JSON.stringify({ code: 0, data: { task_id: 'task-123' } }),
      };
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const provider = createTripoProvider({
    apiKey: 'test-key',
    baseUrl: 'https://api.tripo3d.ai/v2/openapi',
    modelVersion: 'v3.0-20250812',
    outputFormat: 'glb',
    texture: true,
    pbr: false,
  });

  const result = await provider.submitJob({
    imageBuffer: Buffer.from('fake-image'),
    mimeType: 'image/png',
    fileName: 'input.png',
  });

  assert.equal(result.providerJobId, 'task-123');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.tripo3d.ai/v2/openapi/upload');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body instanceof FormData, true);
  assert.equal(calls[1].url, 'https://api.tripo3d.ai/v2/openapi/task');

  const createPayload = JSON.parse(calls[1].init.body);
  assert.deepEqual(createPayload, {
    type: 'image_to_model',
    file: {
      type: 'png',
      file_token: 'img-token-1',
    },
    model_version: 'v3.0-20250812',
    texture: true,
    pbr: false,
    out_format: 'glb',
  });
});

test('maps a successful Tripo task to a GLB output file', async () => {
  global.fetch = async () => ({
    ok: true,
    text: async () =>
      JSON.stringify({
        code: 0,
        data: {
          task_id: 'task-123',
          status: 'success',
          output: {
            model: 'https://cdn.tripo3d.ai/output/model.glb',
            rendered_image: 'https://cdn.tripo3d.ai/output/preview.png',
          },
        },
      }),
  });

  const provider = createTripoProvider({
    apiKey: 'test-key',
    baseUrl: 'https://api.tripo3d.ai/v2/openapi',
    modelVersion: 'v3.0-20250812',
    outputFormat: 'glb',
  });

  const result = await provider.getJob({ providerJobId: 'task-123' });

  assert.equal(result.rawStatus, 'SUCCESS');
  assert.equal(result.errorMessage, null);
  assert.deepEqual(result.files, [
    {
      Type: 'GLB',
      Url: 'https://cdn.tripo3d.ai/output/model.glb',
      PreviewImageUrl: 'https://cdn.tripo3d.ai/output/preview.png',
    },
  ]);
});

test('extracts readable Tripo error messages', () => {
  assert.equal(
    extractTripoMessage({ message: 'Insufficient balance.' }, 'fallback'),
    'Insufficient balance.'
  );
  assert.equal(normalizeTripoStatus('running'), 'RUNNING');
  assert.equal(getImageType('image/jpeg', 'demo.jpg'), 'jpg');
  assert.deepEqual(
    normalizeTripoOutput(
      {
        pbr_model: 'https://cdn.tripo3d.ai/output/model.glb?download=1',
        rendered_image: 'https://cdn.tripo3d.ai/output/preview.png',
      },
      'GLB'
    ),
    [
      {
        Type: 'GLB',
        Url: 'https://cdn.tripo3d.ai/output/model.glb?download=1',
        PreviewImageUrl: 'https://cdn.tripo3d.ai/output/preview.png',
      },
    ]
  );
});
