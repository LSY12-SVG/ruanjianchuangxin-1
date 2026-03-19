import type {
  CreateRouteKey,
  LegacyHomeRouteKey,
  LegacyMainTabKey,
  MainTabKey,
  WorksSubPageKey,
} from '../types/navigation';

const isMainTab = (value: unknown): value is MainTabKey =>
  value === 'create' || value === 'assistant' || value === 'works';

const asLegacyMainTab = (value: unknown): LegacyMainTabKey | null => {
  if (value === 'home' || value === 'agent' || value === 'community' || value === 'profile') {
    return value;
  }
  return null;
};

const asLegacyHomeRoute = (value: unknown): LegacyHomeRouteKey | null => {
  if (value === 'hub' || value === 'grading' || value === 'modeling') {
    return value;
  }
  return null;
};

const resolveWorksSubPage = (value: unknown): WorksSubPageKey | null => {
  const raw = typeof value === 'string' ? value.toLowerCase() : '';
  if (!raw) {
    return null;
  }
  if (raw.includes('setting') || raw.includes('profile') || raw.includes('prefs')) {
    return 'settings';
  }
  if (raw.includes('community') || raw.includes('social')) {
    return 'community';
  }
  if (raw.includes('model') || raw.includes('3d') || raw.includes('convert')) {
    return 'modeling';
  }
  if (raw.includes('library') || raw.includes('work') || raw.includes('history')) {
    return 'library';
  }
  return null;
};

const resolveCreateRoute = (value: unknown): CreateRouteKey | null => {
  if (value === 'editor' || value === 'grading') {
    return 'editor';
  }
  if (value === 'hub' || value === 'create') {
    return 'hub';
  }
  return null;
};

export interface AgentNavigationTarget {
  mainTab: MainTabKey;
  createRoute?: CreateRouteKey;
  worksSubPage?: WorksSubPageKey;
  openSettingsSheet?: boolean;
}

export const resolveAgentNavigationTarget = (args: Record<string, unknown>): AgentNavigationTarget => {
  const tabValue = args.mainTab ?? args.tab;
  const routeValue = args.homeRoute ?? args.route;
  const explicitWorksHint = args.action ?? args.page ?? args.panel;

  if (isMainTab(tabValue)) {
    if (tabValue === 'create') {
      return {
        mainTab: 'create',
        createRoute: resolveCreateRoute(routeValue) || 'hub',
      };
    }
    if (tabValue === 'works') {
      const worksSubPage = resolveWorksSubPage(explicitWorksHint ?? routeValue) || 'library';
      return {
        mainTab: 'works',
        worksSubPage,
        openSettingsSheet: worksSubPage === 'settings',
      };
    }
    return {mainTab: 'assistant'};
  }

  const legacyTab = asLegacyMainTab(tabValue);
  if (legacyTab === 'home') {
    const legacyRoute = asLegacyHomeRoute(routeValue);
    if (legacyRoute === 'modeling') {
      return {mainTab: 'works', worksSubPage: 'modeling'};
    }
    return {
      mainTab: 'create',
      createRoute: legacyRoute === 'grading' ? 'editor' : 'hub',
    };
  }
  if (legacyTab === 'community') {
    return {mainTab: 'works', worksSubPage: 'community'};
  }
  if (legacyTab === 'profile') {
    return {mainTab: 'works', worksSubPage: 'settings', openSettingsSheet: true};
  }
  if (legacyTab === 'agent') {
    return {mainTab: 'assistant'};
  }

  const worksSubPage = resolveWorksSubPage(explicitWorksHint ?? routeValue);
  if (worksSubPage) {
    return {
      mainTab: 'works',
      worksSubPage,
      openSettingsSheet: worksSubPage === 'settings',
    };
  }

  return {mainTab: 'assistant'};
};

export const mapMainTabToLegacy = (
  tab: MainTabKey,
  worksSubPage: WorksSubPageKey = 'library',
): LegacyMainTabKey => {
  if (tab === 'create') {
    return 'home';
  }
  if (tab === 'assistant') {
    return 'agent';
  }
  if (worksSubPage === 'settings') {
    return 'profile';
  }
  if (worksSubPage === 'community') {
    return 'community';
  }
  return 'home';
};

export const mapCreateRouteToLegacy = (route: CreateRouteKey): LegacyHomeRouteKey =>
  route === 'editor' ? 'grading' : 'hub';
