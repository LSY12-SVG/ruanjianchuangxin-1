import {NativeModules} from 'react-native';
import {resolveBackendBaseCandidates} from '../../src/cloud/backendBase';

describe('resolveBackendBaseCandidates', () => {
  const originalScriptUrl = NativeModules.SourceCode?.scriptURL;

  afterEach(() => {
    NativeModules.SourceCode = {
      ...(NativeModules.SourceCode || {}),
      scriptURL: originalScriptUrl,
    };
  });

  it('prioritizes LAN dev host before loopback on real device sessions', () => {
    NativeModules.SourceCode = {
      ...(NativeModules.SourceCode || {}),
      scriptURL: 'http://192.168.50.10:8081/index.bundle?platform=android&dev=true',
    };

    expect(resolveBackendBaseCandidates()).toEqual([
      'http://192.168.50.10:8787',
      'http://127.0.0.1:8787',
      'http://localhost:8787',
      'http://10.0.2.2:8787',
      'http://10.0.3.2:8787',
    ]);
  });

  it('keeps loopback-first order when Metro itself is already loopback', () => {
    NativeModules.SourceCode = {
      ...(NativeModules.SourceCode || {}),
      scriptURL: 'http://127.0.0.1:8081/index.bundle?platform=android&dev=true',
    };

    expect(resolveBackendBaseCandidates()).toEqual([
      'http://127.0.0.1:8787',
      'http://localhost:8787',
      'http://10.0.2.2:8787',
      'http://10.0.3.2:8787',
    ]);
  });
});