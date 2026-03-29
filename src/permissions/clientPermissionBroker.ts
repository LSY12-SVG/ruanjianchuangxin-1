import {Linking, PermissionsAndroid, Platform} from 'react-native';
import {hasAuthToken, getAuthToken} from '../profile/api';
import type {ClientPermissionKey, ClientPermissionState} from '../modules/api/types';

export type {ClientPermissionKey, ClientPermissionState};

export interface ClientPermissionResult {
  permission: ClientPermissionKey;
  granted: boolean;
  state: ClientPermissionState;
  canOpenSettings: boolean;
  errorCode?: 'PERMISSION_DENIED' | 'PERMISSION_BLOCKED';
  message?: string;
}

export interface ClientPermissionBatchResult {
  granted: boolean;
  results: ClientPermissionResult[];
  firstDenied?: ClientPermissionResult;
}

const grantedResult = (permission: ClientPermissionKey): ClientPermissionResult => ({
  permission,
  granted: true,
  state: 'granted',
  canOpenSettings: false,
});

const deniedResult = (
  permission: ClientPermissionKey,
  state: Exclude<ClientPermissionState, 'granted'>,
  message: string,
): ClientPermissionResult => ({
  permission,
  granted: false,
  state,
  canOpenSettings: state === 'blocked',
  errorCode: state === 'blocked' ? 'PERMISSION_BLOCKED' : 'PERMISSION_DENIED',
  message,
});

const unavailableResult = (
  permission: ClientPermissionKey,
  message: string,
): ClientPermissionResult => ({
  permission,
  granted: false,
  state: 'unavailable',
  canOpenSettings: false,
  message,
});

const normalizeAndroidPermission = (
  permission: ClientPermissionKey,
  result: string,
  deniedMessage: string,
  blockedMessage: string,
): ClientPermissionResult => {
  if (result === PermissionsAndroid.RESULTS.GRANTED) {
    return grantedResult(permission);
  }
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    return deniedResult(permission, 'blocked', blockedMessage);
  }
  return deniedResult(permission, 'denied', deniedMessage);
};

export const getClientPermissionLabel = (permission: ClientPermissionKey): string => {
  switch (permission) {
    case 'photo_library':
      return '相册读取';
    case 'photo_library_write':
      return '相册写入';
    case 'camera':
      return '相机';
    case 'microphone':
      return '麦克风';
    case 'notifications':
      return '通知';
    case 'auth_session':
      return '登录态';
    case 'file_read':
      return '文件读取';
    case 'file_write':
      return '文件写入';
    case 'system_settings':
      return '系统设置';
    default:
      return permission;
  }
};

export const requestClientPermission = async (
  permission: ClientPermissionKey,
): Promise<ClientPermissionResult> => {
  if (permission === 'auth_session') {
    return hasAuthToken() || Boolean(getAuthToken())
      ? grantedResult(permission)
      : deniedResult(permission, 'denied', '需要先登录账号后才能继续执行当前任务。');
  }

  if (permission === 'file_read') {
    return unavailableResult(
      permission,
      '当前版本暂未接入系统文件读取代理，请优先使用相册或应用内上传入口。',
    );
  }

  if (permission === 'file_write') {
    return grantedResult(permission);
  }

  if (permission === 'system_settings') {
    return deniedResult(
      permission,
      'blocked',
      '需要打开系统设置继续，请前往设置完成后返回应用。',
    );
  }

  if (Platform.OS !== 'android') {
    return grantedResult(permission);
  }

  try {
    if (permission === 'photo_library') {
      const targetPermission =
        Platform.Version >= 33
          ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
          : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
      const result = await PermissionsAndroid.request(targetPermission);
      return normalizeAndroidPermission(
        permission,
        result,
        '需要相册权限才能继续选择图片。',
        '相册权限已被永久拒绝，请到系统设置中开启后继续。',
      );
    }

    if (permission === 'photo_library_write') {
      if (Platform.Version >= 29) {
        return grantedResult(permission);
      }
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      );
      return normalizeAndroidPermission(
        permission,
        result,
        '需要相册写入权限才能保存结果。',
        '相册写入权限已被永久拒绝，请到系统设置中开启后继续。',
      );
    }

    if (permission === 'camera') {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: '相机权限',
          message: '需要使用相机拍摄照片',
          buttonPositive: '允许',
          buttonNegative: '取消',
        },
      );
      return normalizeAndroidPermission(
        permission,
        result,
        '需要相机权限才能继续拍照。',
        '相机权限已被永久拒绝，请到系统设置中开启后继续。',
      );
    }

    if (permission === 'notifications') {
      if (Platform.Version < 33) {
        return grantedResult(permission);
      }
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        {
          title: '通知权限',
          message: '允许通知后，我可以在后台任务完成时提醒你。',
          buttonPositive: '允许',
          buttonNegative: '取消',
        },
      );
      return normalizeAndroidPermission(
        permission,
        result,
        '需要通知权限才能在后台任务完成时提醒你。',
        '通知权限已被永久拒绝，请到系统设置中开启后继续。',
      );
    }

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: '麦克风权限',
        message: '需要麦克风权限才能继续语音输入。',
        buttonPositive: '允许',
        buttonNegative: '取消',
      },
    );
    return normalizeAndroidPermission(
      permission,
      result,
      '需要麦克风权限才能继续语音输入。',
      '麦克风权限已被永久拒绝，请到系统设置中开启后继续。',
    );
  } catch (error) {
    return deniedResult(
      permission,
      'denied',
      error instanceof Error ? error.message : '权限请求失败',
    );
  }
};

export const ensureClientPermissions = async (
  permissions: ClientPermissionKey[],
): Promise<ClientPermissionBatchResult> => {
  const uniquePermissions = Array.from(new Set(permissions));
  const results: ClientPermissionResult[] = [];
  for (const permission of uniquePermissions) {
    const next = await requestClientPermission(permission);
    results.push(next);
    if (!next.granted) {
      return {
        granted: false,
        results,
        firstDenied: next,
      };
    }
  }
  return {
    granted: true,
    results,
  };
};

export const openClientPermissionSettings = async (): Promise<void> => {
  await Linking.openSettings();
};
