import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {AuthScreen} from '../../src/screens/AuthScreen';

describe('AuthScreen', () => {
  it('prevents register submission when passwords do not match', async () => {
    const onSubmitLogin = jest.fn();
    const onSubmitRegister = jest.fn();
    const onSwitchMode = jest.fn();

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <AuthScreen
          mode="register"
          submitting={false}
          errorMessage=""
          onSubmitLogin={onSubmitLogin}
          onSubmitRegister={onSubmitRegister}
          onSwitchMode={onSwitchMode}
        />,
      );
    });

    const root = renderer!.root;
    const usernameInput = root.findByProps({testID: 'auth-username-input'});
    const passwordInput = root.findByProps({testID: 'auth-password-input'});
    const confirmPasswordInput = root.findByProps({testID: 'auth-confirm-password-input'});
    const submitButton = root.findByProps({testID: 'auth-submit-button'});

    await act(async () => {
      usernameInput.props.onChangeText('new-user');
      passwordInput.props.onChangeText('secret123');
      confirmPasswordInput.props.onChangeText('secret456');
    });

    await act(async () => {
      submitButton.props.onPress();
    });

    expect(onSubmitLogin).not.toHaveBeenCalled();
    expect(onSubmitRegister).not.toHaveBeenCalled();
    expect(
      root.findAllByType('Text').some(node =>
        String(node.props.children).includes('两次输入的密码不一致，请重新确认。'),
      ),
    ).toBe(true);
  });

  it('submits trimmed login credentials in login mode', async () => {
    const onSubmitLogin = jest.fn();

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <AuthScreen
          mode="login"
          submitting={false}
          errorMessage=""
          onSubmitLogin={onSubmitLogin}
          onSubmitRegister={jest.fn()}
          onSwitchMode={jest.fn()}
        />,
      );
    });

    const root = renderer!.root;
    const usernameInput = root.findByProps({testID: 'auth-username-input'});
    const passwordInput = root.findByProps({testID: 'auth-password-input'});
    const submitButton = root.findByProps({testID: 'auth-submit-button'});

    await act(async () => {
      usernameInput.props.onChangeText('  visionary-user  ');
      passwordInput.props.onChangeText('secret123');
    });

    await act(async () => {
      submitButton.props.onPress();
    });

    expect(onSubmitLogin).toHaveBeenCalledWith({
      username: 'visionary-user',
      password: 'secret123',
    });
  });
});
