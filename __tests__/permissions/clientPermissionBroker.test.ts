jest.mock('react-native', () => ({
  Linking: {
    openSettings: jest.fn(async () => undefined),
  },
  Platform: {
    OS: 'android',
    Version: 33,
  },
  PermissionsAndroid: {
    PERMISSIONS: {
      READ_MEDIA_IMAGES: 'READ_MEDIA_IMAGES',
      READ_EXTERNAL_STORAGE: 'READ_EXTERNAL_STORAGE',
      WRITE_EXTERNAL_STORAGE: 'WRITE_EXTERNAL_STORAGE',
      CAMERA: 'CAMERA',
      RECORD_AUDIO: 'RECORD_AUDIO',
      POST_NOTIFICATIONS: 'POST_NOTIFICATIONS',
    },
    RESULTS: {
      GRANTED: 'granted',
      DENIED: 'denied',
      NEVER_ASK_AGAIN: 'never_ask_again',
    },
    request: jest.fn(async () => 'granted'),
  },
}));

jest.mock('../../src/profile/api', () => ({
  getAuthToken: jest.fn(() => ''),
  hasAuthToken: jest.fn(() => false),
}));

import {
  ensureClientPermissions,
  getClientPermissionLabel,
  requestClientPermission,
} from '../../src/permissions/clientPermissionBroker';

const {PermissionsAndroid} = jest.requireMock('react-native') as {
  PermissionsAndroid: {
    request: jest.Mock;
    RESULTS: Record<string, string>;
  };
};
const {hasAuthToken} = jest.requireMock('../../src/profile/api') as {
  hasAuthToken: jest.Mock;
};

describe('clientPermissionBroker', () => {
  beforeEach(() => {
    PermissionsAndroid.request.mockReset();
    PermissionsAndroid.request.mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    hasAuthToken.mockReset();
    hasAuthToken.mockReturnValue(false);
  });

  it('maps notification permission on Android 13+', async () => {
    const result = await requestClientPermission('notifications');
    expect(result.granted).toBe(true);
    expect(result.permission).toBe('notifications');
  });

  it('surfaces blocked permission state', async () => {
    PermissionsAndroid.request.mockResolvedValueOnce(
      PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
    );
    const result = await requestClientPermission('camera');
    expect(result.granted).toBe(false);
    expect(result.state).toBe('blocked');
    expect(result.errorCode).toBe('PERMISSION_BLOCKED');
  });

  it('stops batch permission request on first failure', async () => {
    PermissionsAndroid.request
      .mockResolvedValueOnce(PermissionsAndroid.RESULTS.GRANTED)
      .mockResolvedValueOnce(PermissionsAndroid.RESULTS.DENIED);

    const result = await ensureClientPermissions(['photo_library', 'notifications']);
    expect(result.granted).toBe(false);
    expect(result.results).toHaveLength(2);
    expect(result.firstDenied?.permission).toBe('notifications');
  });

  it('returns readable permission labels', () => {
    expect(getClientPermissionLabel('photo_library_write')).toBe('相册写入');
  });

  it('reports missing auth session as denied', async () => {
    hasAuthToken.mockReturnValue(false);
    const result = await requestClientPermission('auth_session');
    expect(result.granted).toBe(false);
    expect(result.state).toBe('denied');
    expect(result.message).toContain('登录');
  });

  it('keeps file read unavailable until document picker is wired', async () => {
    const result = await requestClientPermission('file_read');
    expect(result.granted).toBe(false);
    expect(result.state).toBe('unavailable');
  });

  it('treats file_write as available once native save bridge is enabled', async () => {
    const result = await requestClientPermission('file_write');
    expect(result.granted).toBe(true);
    expect(result.state).toBe('granted');
  });
});
