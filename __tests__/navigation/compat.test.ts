import {
  mapCreateRouteToLegacy,
  mapMainTabToLegacy,
  resolveAgentNavigationTarget,
} from '../../src/navigation/compat';

describe('navigation compatibility mapping', () => {
  it('maps legacy tabs to new 3-tab architecture', () => {
    expect(resolveAgentNavigationTarget({tab: 'home', route: 'grading'})).toMatchObject({
      mainTab: 'create',
      createRoute: 'editor',
    });
    expect(resolveAgentNavigationTarget({tab: 'community'})).toMatchObject({
      mainTab: 'works',
      worksSubPage: 'community',
    });
    expect(resolveAgentNavigationTarget({tab: 'profile'})).toMatchObject({
      mainTab: 'works',
      worksSubPage: 'settings',
      openSettingsSheet: true,
    });
    expect(resolveAgentNavigationTarget({tab: 'agent'})).toMatchObject({
      mainTab: 'create',
      openAssistantPanel: true,
    });
  });

  it('routes legacy modeling path into works tool page', () => {
    expect(resolveAgentNavigationTarget({tab: 'home', route: 'modeling'})).toMatchObject({
      mainTab: 'works',
      worksSubPage: 'modeling',
    });
  });

  it('maps new tabs to legacy API tabs', () => {
    expect(mapMainTabToLegacy('create')).toBe('home');
    expect(mapMainTabToLegacy('assistant')).toBe('agent');
    expect(mapMainTabToLegacy('works', 'community')).toBe('community');
    expect(mapMainTabToLegacy('works', 'settings')).toBe('profile');
    expect(mapMainTabToLegacy('works', 'library')).toBe('home');
    expect(mapMainTabToLegacy('works', 'modeling')).toBe('home');
    expect(mapCreateRouteToLegacy('editor')).toBe('grading');
  });
});
