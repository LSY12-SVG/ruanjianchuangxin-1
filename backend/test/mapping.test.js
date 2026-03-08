const test = require('node:test');
const assert = require('node:assert/strict');
const { mapProviderStatus, pickPreferredFile } = require('../src/jobMapper');

test('maps Tencent provider statuses to app statuses', () => {
  assert.equal(mapProviderStatus('WAIT'), 'queued');
  assert.equal(mapProviderStatus('RUN'), 'processing');
  assert.equal(mapProviderStatus('DONE'), 'succeeded');
  assert.equal(mapProviderStatus('FAIL'), 'failed');
});

test('prefers GLB files when multiple model outputs exist', () => {
  const file = pickPreferredFile([
    { Type: 'OBJ', Url: 'https://example.com/model.obj' },
    { Type: 'GLB', Url: 'https://example.com/model.glb' },
  ]);

  assert.equal(file.type, 'GLB');
  assert.equal(file.url, 'https://example.com/model.glb');
});
