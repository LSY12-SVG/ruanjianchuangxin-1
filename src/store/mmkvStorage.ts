import AsyncStorage from '@react-native-async-storage/async-storage';
import {MMKV} from 'react-native-mmkv';

const fallbackMemory = new Map<string, string>();
let mmkvAvailable = true;
let warnedUnavailable = false;
let warnedAsyncUnavailable = false;

const warnUnavailableOnce = (error: unknown): void => {
  if (warnedUnavailable) {
    return;
  }
  warnedUnavailable = true;
  console.warn(
    '[storage] MMKV unavailable, fallback to AsyncStorage/memory:',
    (error as {message?: string})?.message ?? String(error),
  );
};

const warnAsyncUnavailableOnce = (error: unknown): void => {
  if (warnedAsyncUnavailable) {
    return;
  }
  warnedAsyncUnavailable = true;
  console.warn(
    '[storage] AsyncStorage unavailable, fallback to memory only:',
    (error as {message?: string})?.message ?? String(error),
  );
};

let mmkvInstance: MMKV | null = null;
try {
  mmkvInstance = new MMKV({id: 'visiongenie.app'});
} catch (error) {
  mmkvAvailable = false;
  warnUnavailableOnce(error);
}

const trySetMMKV = (name: string, value: string): boolean => {
  if (!mmkvAvailable || !mmkvInstance) {
    return false;
  }
  try {
    mmkvInstance.set(name, value);
    return true;
  } catch (error) {
    mmkvAvailable = false;
    warnUnavailableOnce(error);
    return false;
  }
};

const tryGetMMKV = (name: string): string | null => {
  if (!mmkvAvailable || !mmkvInstance) {
    return null;
  }
  try {
    return mmkvInstance.getString(name) ?? null;
  } catch (error) {
    mmkvAvailable = false;
    warnUnavailableOnce(error);
    return null;
  }
};

const tryDeleteMMKV = (name: string): boolean => {
  if (!mmkvAvailable || !mmkvInstance) {
    return false;
  }
  try {
    mmkvInstance.delete(name);
    return true;
  } catch (error) {
    mmkvAvailable = false;
    warnUnavailableOnce(error);
    return false;
  }
};

export const appMMKV = {
  set: (name: string, value: string): void => {
    if (!trySetMMKV(name, value)) {
      fallbackMemory.set(name, value);
      AsyncStorage.setItem(name, value).catch(() => {
        // keep in-memory fallback when persistent storage is unavailable
      });
    }
  },
  getString: (name: string): string | undefined => {
    const mmkvValue = tryGetMMKV(name);
    if (mmkvValue !== null) {
      return mmkvValue;
    }
    return fallbackMemory.get(name);
  },
  delete: (name: string): void => {
    if (!tryDeleteMMKV(name)) {
      fallbackMemory.delete(name);
      AsyncStorage.removeItem(name).catch(() => {
        // keep silent for storage cleanup failures
      });
    }
  },
};

export const mmkvStorage = {
  setItem: async (name: string, value: string): Promise<void> => {
    if (trySetMMKV(name, value)) {
      return;
    }
    fallbackMemory.set(name, value);
    try {
      await AsyncStorage.setItem(name, value);
    } catch (error) {
      warnAsyncUnavailableOnce(error);
    }
  },
  getItem: async (name: string): Promise<string | null> => {
    const mmkvValue = tryGetMMKV(name);
    if (mmkvValue !== null) {
      return mmkvValue;
    }
    try {
      const asyncValue = await AsyncStorage.getItem(name);
      if (asyncValue !== null) {
        fallbackMemory.set(name, asyncValue);
        return asyncValue;
      }
    } catch (error) {
      warnAsyncUnavailableOnce(error);
    }
    return fallbackMemory.get(name) ?? null;
  },
  removeItem: async (name: string): Promise<void> => {
    if (tryDeleteMMKV(name)) {
      return;
    }
    fallbackMemory.delete(name);
    try {
      await AsyncStorage.removeItem(name);
    } catch (error) {
      warnAsyncUnavailableOnce(error);
    }
  },
};
