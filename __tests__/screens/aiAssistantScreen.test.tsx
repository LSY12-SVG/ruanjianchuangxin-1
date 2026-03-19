import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../../App';
import {useAppStore} from '../../src/store/appStore';

describe('AI assistant screen migration', () => {
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

  it('renders app shell with floating assistant entry', async () => {
    await ReactTestRenderer.act(() => {
      ReactTestRenderer.create(<App />);
    });
  });
});
