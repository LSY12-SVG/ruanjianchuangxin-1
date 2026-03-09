const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildViewerPayload,
  mapProviderStatus,
  pickPreferredFile,
} = require('../src/jobMapper');

test('maps Tencent and Tripo provider statuses to app statuses', () => {
  assert.equal(mapProviderStatus('WAIT'), 'queued');
  assert.equal(mapProviderStatus('RUN'), 'processing');
  assert.equal(mapProviderStatus('DONE'), 'succeeded');
  assert.equal(mapProviderStatus('FAIL'), 'failed');
  assert.equal(mapProviderStatus('pending'), 'queued');
  assert.equal(mapProviderStatus('running'), 'processing');
  assert.equal(mapProviderStatus('success'), 'succeeded');
  assert.equal(mapProviderStatus('failed'), 'failed');
});

test('prefers GLB files when multiple model outputs exist', () => {
  const file = pickPreferredFile([
    { Type: 'OBJ', Url: 'https://example.com/model.obj' },
    { Type: 'GLB', Url: 'https://example.com/model.glb' },
  ]);

  assert.equal(file.type, 'GLB');
  assert.equal(file.url, 'https://example.com/model.glb');
});

test('builds OBJ viewer metadata when no GLB file exists', () => {
  const payload = buildViewerPayload([
    {
      Type: 'OBJ',
      Url: 'https://example.com/model.obj',
      PreviewImageUrl: 'https://example.com/model.webp',
    },
    {
      Type: 'MTL',
      Url: 'https://example.com/model.mtl',
    },
  ]);

  assert.equal(payload.viewerFormat, 'obj');
  assert.equal(payload.previewUrl, 'https://example.com/model.obj');
  assert.equal(payload.previewImageUrl, 'https://example.com/model.webp');
  assert.equal(payload.viewerFiles.length, 2);
});
