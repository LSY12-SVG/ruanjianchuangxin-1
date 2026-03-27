import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {AuthGate} from '../../src/components/auth/AuthGate';
import {queryClient} from '../../src/providers/queryClient';

jest.mock('../../src/components/app/AppShell', () => {
  const React = require('react');
  const {Text} = require('react-native');
  return {
    AppShell: () => <Text testID="app-shell-mock">AppShellMock</Text>,
  };
});

jest.mock('../../src/profile/api', () => {
  const actual = jest.requireActual('../../src/profile/api');
  return {
    ...actual,
    restoreAuthToken: jest.fn(),
    clearAuthToken: jest.fn(async () => undefined),
    login: jest.fn(),
    register: jest.fn(),
  };
});

const profileApi = jest.requireMock('../../src/profile/api') as {
  restoreAuthToken: jest.Mock;
  clearAuthToken: jest.Mock;
  login: jest.Mock;
  register: jest.Mock;
};

describe('AuthGate', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
  });

  it('shows the auth screen when there is no stored token', async () => {
    profileApi.restoreAuthToken.mockResolvedValue('');

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<AuthGate />);
    });

    expect(renderer!.root.findByProps({testID: 'auth-screen-root'})).toBeTruthy();
    expect(() => renderer!.root.findByProps({testID: 'app-shell-mock'})).toThrow();
  });

  it('enters the app shell when a stored token is restored', async () => {
    profileApi.restoreAuthToken.mockResolvedValue('token-123');

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<AuthGate />);
    });

    expect(renderer!.root.findByProps({testID: 'app-shell-mock'})).toBeTruthy();
  });

  it('submits login credentials and transitions into the app on success', async () => {
    profileApi.restoreAuthToken.mockResolvedValue('');
    profileApi.login.mockResolvedValue({
      token: 'token-456',
      user: {
        id: 'user-1',
        username: 'visionary',
        displayName: 'Visionary',
        avatarUrl: '',
        tier: 'Vision Creator · Pro',
      },
    });

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<AuthGate />);
    });

    const root = renderer!.root;
    const usernameInput = root.findByProps({testID: 'auth-username-input'});
    const passwordInput = root.findByProps({testID: 'auth-password-input'});
    const submitButton = root.findByProps({testID: 'auth-submit-button'});

    await act(async () => {
      usernameInput.props.onChangeText('visionary');
      passwordInput.props.onChangeText('secret123');
    });

    await act(async () => {
      await submitButton.props.onPress();
    });

    expect(profileApi.login).toHaveBeenCalledWith({
      username: 'visionary',
      password: 'secret123',
    });
    expect(root.findByProps({testID: 'app-shell-mock'})).toBeTruthy();
  });
});
