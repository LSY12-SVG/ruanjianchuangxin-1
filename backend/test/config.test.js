const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const configModulePath = path.join(__dirname, '..', 'src', 'config.js');

function loadConfigWithEnv(overrides) {
  const previousEnv = {
    IMAGE_TO_3D_HOST: process.env.IMAGE_TO_3D_HOST,
    IMAGE_TO_3D_PUBLIC_BASE_URL: process.env.IMAGE_TO_3D_PUBLIC_BASE_URL,
  };

  if (overrides.IMAGE_TO_3D_HOST === undefined) {
    delete process.env.IMAGE_TO_3D_HOST;
  } else {
    process.env.IMAGE_TO_3D_HOST = overrides.IMAGE_TO_3D_HOST;
  }

  if (overrides.IMAGE_TO_3D_PUBLIC_BASE_URL === undefined) {
    delete process.env.IMAGE_TO_3D_PUBLIC_BASE_URL;
  } else {
    process.env.IMAGE_TO_3D_PUBLIC_BASE_URL = overrides.IMAGE_TO_3D_PUBLIC_BASE_URL;
  }

  delete require.cache[require.resolve(configModulePath)];
  const config = require(configModulePath);

  if (previousEnv.IMAGE_TO_3D_HOST === undefined) {
    delete process.env.IMAGE_TO_3D_HOST;
  } else {
    process.env.IMAGE_TO_3D_HOST = previousEnv.IMAGE_TO_3D_HOST;
  }

  if (previousEnv.IMAGE_TO_3D_PUBLIC_BASE_URL === undefined) {
    delete process.env.IMAGE_TO_3D_PUBLIC_BASE_URL;
  } else {
    process.env.IMAGE_TO_3D_PUBLIC_BASE_URL = previousEnv.IMAGE_TO_3D_PUBLIC_BASE_URL;
  }

  delete require.cache[require.resolve(configModulePath)];
  return config;
}

test('reads host and public base url from env', () => {
  const config = loadConfigWithEnv({
    IMAGE_TO_3D_HOST: '0.0.0.0',
    IMAGE_TO_3D_PUBLIC_BASE_URL: 'http://192.168.0.8:3001/',
  });

  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.publicBaseUrl, 'http://192.168.0.8:3001');
});

test('falls back to default host when env vars are absent', () => {
  const config = loadConfigWithEnv({
    IMAGE_TO_3D_HOST: undefined,
    IMAGE_TO_3D_PUBLIC_BASE_URL: undefined,
  });

  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.publicBaseUrl, null);
});
