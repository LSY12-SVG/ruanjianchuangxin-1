import React, {useEffect, useState} from 'react';
import {AppShell} from '../app/AppShell';
import {
  ProfileApiError,
  clearAuthToken,
  login,
  register,
  restoreAuthToken,
  type AuthUser,
} from '../../profile/api';
import {queryClient} from '../../providers/queryClient';
import {AuthBootstrapScreen, AuthScreen} from '../../screens/AuthScreen';
import type {AuthFormMode, AuthSessionState} from '../../types/auth';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: '用户名或密码错误，请重新输入。',
  validation_failed: '请完整填写用户名和密码。',
  username_taken: '该用户名已被占用，请更换后重试。',
  invalid_auth_response: '登录服务返回数据异常，请稍后重试。',
  profile_request_failed: '登录服务暂时不可用，请检查网络或后端连接。',
  unknown_error: '登录服务暂时不可用，请稍后重试。',
};

const initialSessionState: AuthSessionState = {
  status: 'bootstrapping',
  mode: 'login',
  user: null,
  errorMessage: '',
};

const toAuthErrorMessage = (error: unknown, mode: AuthFormMode): string => {
  const fallback =
    mode === 'register'
      ? '注册失败，请检查网络或稍后重试。'
      : '登录失败，请检查网络或稍后重试。';

  if (error instanceof ProfileApiError) {
    return AUTH_ERROR_MESSAGES[error.code] || fallback;
  }

  if (error instanceof Error) {
    return AUTH_ERROR_MESSAGES[error.message] || fallback;
  }

  return fallback;
};

const markAuthenticated = (user: AuthUser | null) => {
  void queryClient.invalidateQueries({queryKey: ['profile']});
  return {
    status: 'authenticated' as const,
    errorMessage: '',
    user,
  };
};

export const AuthGate: React.FC = () => {
  const [session, setSession] = useState<AuthSessionState>(initialSessionState);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const token = await restoreAuthToken();
        if (!active) {
          return;
        }
        if (token) {
          setSession(prev => ({
            ...prev,
            ...markAuthenticated(prev.user),
          }));
          return;
        }
        setSession(prev => ({
          ...prev,
          status: 'unauthenticated',
          errorMessage: '',
          user: null,
        }));
      } catch {
        await clearAuthToken().catch(() => undefined);
        if (!active) {
          return;
        }
        setSession(prev => ({
          ...prev,
          status: 'unauthenticated',
          errorMessage: '',
          user: null,
        }));
      }
    };

    bootstrap().catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const handleSwitchMode = (mode: AuthFormMode) => {
    if (session.status === 'submitting') {
      return;
    }
    setSession(prev => ({
      ...prev,
      mode,
      errorMessage: '',
    }));
  };

  const handleAuthSuccess = (user: AuthUser) => {
    setSession(prev => ({
      ...prev,
      ...markAuthenticated(user),
    }));
  };

  const handleLogin = async (payload: {username: string; password: string}) => {
    setSession(prev => ({
      ...prev,
      status: 'submitting',
      errorMessage: '',
    }));

    try {
      const response = await login(payload);
      handleAuthSuccess(response.user);
    } catch (error) {
      setSession(prev => ({
        ...prev,
        status: 'unauthenticated',
        errorMessage: toAuthErrorMessage(error, 'login'),
      }));
    }
  };

  const handleRegister = async (payload: {
    username: string;
    password: string;
    confirmPassword: string;
  }) => {
    setSession(prev => ({
      ...prev,
      status: 'submitting',
      errorMessage: '',
    }));

    try {
      const response = await register({
        username: payload.username,
        password: payload.password,
      });
      handleAuthSuccess(response.user);
    } catch (error) {
      setSession(prev => ({
        ...prev,
        status: 'unauthenticated',
        errorMessage: toAuthErrorMessage(error, 'register'),
      }));
    }
  };

  if (session.status === 'bootstrapping') {
    return <AuthBootstrapScreen />;
  }

  if (session.status === 'authenticated') {
    return <AppShell />;
  }

  return (
    <AuthScreen
      mode={session.mode}
      submitting={session.status === 'submitting'}
      errorMessage={session.errorMessage}
      onSubmitLogin={handleLogin}
      onSubmitRegister={handleRegister}
      onSwitchMode={handleSwitchMode}
    />
  );
};
