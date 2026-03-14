import {NativeModules} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AuthRegisterRequest {
  username: string;
  password: string;
}

export interface AuthLoginRequest {
  username: string;
  password: string;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  tier: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface MyProfileResponse {
  profile: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    tier: string;
  };
  settings: {
    syncOnWifi: boolean;
    communityNotify: boolean;
    voiceAutoApply: boolean;
  };
  stats: {
    modelTasksCount: number;
    communityPostsCount: number;
  };
}

export interface UpdateProfileRequest {
  displayName?: string;
  avatarUrl?: string;
  tier?: string;
}

export interface UpdateSettingsRequest {
  syncOnWifi?: boolean;
  communityNotify?: boolean;
  voiceAutoApply?: boolean;
}

const TOKEN_KEY = 'visiongenie.auth.token';
const DEFAULT_BASE_URL = 'http://127.0.0.1:8787';
const DEBUG_AUTH_BYPASS = typeof __DEV__ === 'boolean' && __DEV__;

let authTokenCache = '';

const isIpv4Host = (hostname: string): boolean =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);

const isUsableDevHost = (hostname: string): boolean => {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '10.0.2.2' ||
    normalized === '10.0.3.2'
  ) {
    return true;
  }
  if (isIpv4Host(normalized)) {
    return true;
  }
  return normalized.includes('.');
};

const buildBaseFromScriptURL = (): string | null => {
  const scriptURL = NativeModules?.SourceCode?.scriptURL;
  if (typeof scriptURL !== 'string' || scriptURL.length === 0) {
    return null;
  }
  try {
    const parsed = new URL(scriptURL);
    const hostname = parsed.hostname || '';
    if (!isUsableDevHost(hostname)) {
      return null;
    }
    return `${parsed.protocol}//${hostname}:8787`;
  } catch {
    return null;
  }
};

const resolveBaseCandidates = (): string[] => {
  const set = new Set<string>();
  set.add(DEFAULT_BASE_URL);
  set.add('http://localhost:8787');
  set.add('http://10.0.2.2:8787');
  set.add('http://10.0.3.2:8787');
  const fromScript = buildBaseFromScriptURL();
  if (fromScript) {
    set.add(fromScript);
  }
  return Array.from(set);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseErrorCode = (value: unknown): string => {
  if (isObject(value) && typeof value.error === 'string') {
    return value.error;
  }
  return 'unknown_error';
};

export class ProfileApiError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const requestProfile = async (path: string, init: RequestInit): Promise<unknown> => {
  const candidates = resolveBaseCandidates();
  let lastError: Error | null = null;

  for (const base of candidates) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string>),
      };
      if (authTokenCache) {
        headers.Authorization = `Bearer ${authTokenCache}`;
      }
      const response = await fetch(`${base}${path}`, {
        ...init,
        headers,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new ProfileApiError(parseErrorCode(data));
      }
      return data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('profile_request_failed');
      if (error instanceof ProfileApiError) {
        throw error;
      }
    }
  }

  throw lastError || new Error('profile_request_failed');
};

const normalizeAuthResponse = (value: unknown): AuthResponse | null => {
  if (!isObject(value) || typeof value.token !== 'string' || !isObject(value.user)) {
    return null;
  }
  return {
    token: value.token,
    user: {
      id: String(value.user.id || ''),
      username: String(value.user.username || ''),
      displayName: String(value.user.displayName || ''),
      avatarUrl: String(value.user.avatarUrl || ''),
      tier: String(value.user.tier || 'Vision Creator · Pro'),
    },
  };
};

const normalizeMyProfileResponse = (value: unknown): MyProfileResponse | null => {
  if (!isObject(value) || !isObject(value.profile) || !isObject(value.settings) || !isObject(value.stats)) {
    return null;
  }
  return {
    profile: {
      id: String(value.profile.id || ''),
      username: String(value.profile.username || ''),
      displayName: String(value.profile.displayName || ''),
      avatarUrl: String(value.profile.avatarUrl || ''),
      tier: String(value.profile.tier || 'Vision Creator · Pro'),
    },
    settings: {
      syncOnWifi: Boolean(value.settings.syncOnWifi),
      communityNotify: Boolean(value.settings.communityNotify),
      voiceAutoApply: Boolean(value.settings.voiceAutoApply),
    },
    stats: {
      modelTasksCount: Number(value.stats.modelTasksCount || 0),
      communityPostsCount: Number(value.stats.communityPostsCount || 0),
    },
  };
};

const persistToken = async (token: string): Promise<void> => {
  authTokenCache = token;
  await AsyncStorage.setItem(TOKEN_KEY, token);
};

export const clearAuthToken = async (): Promise<void> => {
  authTokenCache = '';
  await AsyncStorage.removeItem(TOKEN_KEY);
};

export const restoreAuthToken = async (): Promise<string> => {
  const token = (await AsyncStorage.getItem(TOKEN_KEY)) || '';
  authTokenCache = token;
  return token;
};

export const hasAuthToken = (): boolean => Boolean(authTokenCache) || DEBUG_AUTH_BYPASS;
export const getAuthToken = (): string => authTokenCache;

export const register = async (
  payload: AuthRegisterRequest,
): Promise<AuthResponse> => {
  const response = await requestProfile('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const normalized = normalizeAuthResponse(response);
  if (!normalized) {
    throw new Error('invalid_auth_response');
  }
  await persistToken(normalized.token);
  return normalized;
};

export const login = async (payload: AuthLoginRequest): Promise<AuthResponse> => {
  const response = await requestProfile('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const normalized = normalizeAuthResponse(response);
  if (!normalized) {
    throw new Error('invalid_auth_response');
  }
  await persistToken(normalized.token);
  return normalized;
};

export const fetchMyProfile = async (): Promise<MyProfileResponse> => {
  const response = await requestProfile('/v1/profile/me', {method: 'GET'});
  const normalized = normalizeMyProfileResponse(response);
  if (!normalized) {
    throw new Error('invalid_profile_response');
  }
  return normalized;
};

export const updateMyProfile = async (
  payload: UpdateProfileRequest,
): Promise<MyProfileResponse['profile']> => {
  const response = await requestProfile('/v1/profile/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!isObject(response) || !isObject(response.profile)) {
    throw new Error('invalid_profile_response');
  }
  return {
    id: String(response.profile.id || ''),
    username: String(response.profile.username || ''),
    displayName: String(response.profile.displayName || ''),
    avatarUrl: String(response.profile.avatarUrl || ''),
    tier: String(response.profile.tier || 'Vision Creator · Pro'),
  };
};

export const updateMySettings = async (
  payload: UpdateSettingsRequest,
): Promise<MyProfileResponse['settings']> => {
  const response = await requestProfile('/v1/profile/me/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!isObject(response) || !isObject(response.settings)) {
    throw new Error('invalid_settings_response');
  }
  return {
    syncOnWifi: Boolean(response.settings.syncOnWifi),
    communityNotify: Boolean(response.settings.communityNotify),
    voiceAutoApply: Boolean(response.settings.voiceAutoApply),
  };
};
