import {create} from 'zustand';
import {createJSONStorage, persist} from 'zustand/middleware';
import type {ConversationMessage} from '../types/conversation';
import type {HomeRouteKey, MainTabKey} from '../types/navigation';
import type {
  ColorEngineMode,
  ResolvedColorEngineMode,
  WorkingColorSpace,
} from '../types/colorEngine';
import {mmkvStorage} from './mmkvStorage';

let warnedPersistStorageUnavailable = false;

const warnPersistUnavailableOnce = (error: unknown): void => {
  if (warnedPersistStorageUnavailable) {
    return;
  }
  warnedPersistStorageUnavailable = true;
  console.warn(
    '[store] persist storage unavailable, using in-memory fallback for this session:',
    (error as {message?: string})?.message ?? String(error),
  );
};

const safePersistStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await mmkvStorage.getItem(name);
    } catch (error) {
      warnPersistUnavailableOnce(error);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await mmkvStorage.setItem(name, value);
    } catch (error) {
      warnPersistUnavailableOnce(error);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await mmkvStorage.removeItem(name);
    } catch (error) {
      warnPersistUnavailableOnce(error);
    }
  },
};

interface AppStoreState {
  activeMainTab: MainTabKey;
  homeRoute: HomeRouteKey;
  motionEnabled: boolean;
  themeVariant: 'sunset' | 'editorial';
  colorEngineMode: ColorEngineMode;
  resolvedColorEngineMode: ResolvedColorEngineMode;
  preferredWorkingSpace: WorkingColorSpace;
  lastColorEngineFallbackReason: string | null;
  conversation: ConversationMessage[];
  recentTasks: string[];
  setActiveMainTab: (tab: MainTabKey) => void;
  setHomeRoute: (route: HomeRouteKey) => void;
  setMotionEnabled: (enabled: boolean) => void;
  setThemeVariant: (variant: 'sunset' | 'editorial') => void;
  setColorEngineMode: (mode: ColorEngineMode) => void;
  setResolvedColorEngineMode: (mode: ResolvedColorEngineMode) => void;
  setPreferredWorkingSpace: (space: WorkingColorSpace) => void;
  setLastColorEngineFallbackReason: (reason: string | null) => void;
  pushConversation: (message: Omit<ConversationMessage, 'id' | 'timestamp'>) => void;
  clearConversation: () => void;
  addRecentTask: (task: string) => void;
}

export const useAppStore = create<AppStoreState>()(
  persist(
    (set, get) => ({
      activeMainTab: 'home',
      homeRoute: 'hub',
      motionEnabled: true,
      themeVariant: 'sunset',
      colorEngineMode: 'auto',
      resolvedColorEngineMode: 'pro',
      preferredWorkingSpace: 'linear_prophoto',
      lastColorEngineFallbackReason: null,
      conversation: [],
      recentTasks: [],
      setActiveMainTab: tab => {
        set(state => {
          if (tab === 'home') {
            return {
              ...state,
              activeMainTab: tab,
              homeRoute: 'hub',
            };
          }
          return {...state, activeMainTab: tab};
        });
      },
      setHomeRoute: route => set({homeRoute: route}),
      setMotionEnabled: enabled => set({motionEnabled: enabled}),
      setThemeVariant: variant => set({themeVariant: variant}),
      setColorEngineMode: mode => set({colorEngineMode: mode}),
      setResolvedColorEngineMode: mode => set({resolvedColorEngineMode: mode}),
      setPreferredWorkingSpace: space => set({preferredWorkingSpace: space}),
      setLastColorEngineFallbackReason: reason => set({lastColorEngineFallbackReason: reason}),
      pushConversation: message => {
        const next: ConversationMessage = {
          ...message,
          id: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
        };
        set(state => ({
          conversation: [...state.conversation.slice(-39), next],
        }));
      },
      clearConversation: () => set({conversation: []}),
      addRecentTask: task => {
        const normalized = task.trim();
        if (!normalized) {
          return;
        }
        const current = get().recentTasks.filter(item => item !== normalized);
        set({recentTasks: [normalized, ...current].slice(0, 8)});
      },
    }),
    {
      name: 'visiongenie.app.store',
      storage: createJSONStorage(() => safePersistStorage),
      partialize: state => ({
        motionEnabled: state.motionEnabled,
        themeVariant: state.themeVariant,
        colorEngineMode: state.colorEngineMode,
        preferredWorkingSpace: state.preferredWorkingSpace,
        lastColorEngineFallbackReason: state.lastColorEngineFallbackReason,
        conversation: state.conversation,
        recentTasks: state.recentTasks,
      }),
    },
  ),
);
