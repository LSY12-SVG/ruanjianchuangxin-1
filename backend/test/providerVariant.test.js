const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSubmitPayload,
  getTencentMethodName,
} = require('../src/providers/tencentAi3dProvider');

test('uses rapid methods by default', () => {
  assert.equal(getTencentMethodName('rapid', 'submit'), 'SubmitHunyuanTo3DRapidJob');
  assert.equal(getTencentMethodName('rapid', 'query'), 'QueryHunyuanTo3DRapidJob');
});

test('uses pro methods when requested explicitly', () => {
  assert.equal(getTencentMethodName('pro', 'submit'), 'SubmitHunyuanTo3DProJob');
  assert.equal(getTencentMethodName('pro', 'query'), 'QueryHunyuanTo3DProJob');
});

test('omits the model parameter for rapid submissions', () => {
  const payload = buildSubmitPayload('rapid', '3.0', Buffer.from('abc'));

  assert.equal(payload.Model, undefined);
  assert.equal(payload.ImageBase64, Buffer.from('abc').toString('base64'));
});

test('includes the model parameter for pro submissions', () => {
  const payload = buildSubmitPayload('pro', '3.0', Buffer.from('abc'));

  assert.equal(payload.Model, '3.0');
  assert.equal(payload.ImageBase64, Buffer.from('abc').toString('base64'));
});