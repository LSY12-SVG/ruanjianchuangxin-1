import {useAppStore} from '../../src/store/appStore';

describe('app store', () => {
  beforeEach(() => {
    useAppStore.setState({
      activeMainTab: 'create',
      createRoute: 'hub',
      worksSubPage: 'library',
      worksFilter: 'all',
      worksToolsOpen: false,
      worksSettingsOpen: false,
      motionEnabled: true,
      themeVariant: 'sunset',
      conversation: [],
      recentTasks: [],
    });
  });

  it('pushes conversation messages with generated metadata', () => {
    useAppStore.getState().pushConversation({
      role: 'assistant',
      content: 'test message',
      state: 'normal',
    });

    const state = useAppStore.getState();
    expect(state.conversation).toHaveLength(1);
    expect(state.conversation[0].id).toBeTruthy();
    expect(state.conversation[0].timestamp).toBeTruthy();
  });

  it('deduplicates recent tasks and keeps latest first', () => {
    const store = useAppStore.getState();
    store.addRecentTask('任务A');
    store.addRecentTask('任务B');
    store.addRecentTask('任务A');

    expect(useAppStore.getState().recentTasks).toEqual(['任务A', '任务B']);
  });
});
