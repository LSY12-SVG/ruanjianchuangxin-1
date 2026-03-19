export type MainTabKey = 'create' | 'assistant' | 'works';

export type CreateRouteKey = 'hub' | 'editor';

export type WorksSubPageKey = 'library' | 'community' | 'modeling' | 'settings';

// Legacy keys kept for compatibility with old modules and backend planner payloads.
export type LegacyMainTabKey = 'home' | 'agent' | 'community' | 'profile';
export type LegacyHomeRouteKey = 'hub' | 'grading' | 'modeling';
export type HomeRouteKey = LegacyHomeRouteKey;
