import {NextResponse} from 'next/server';

import {applyWebAuthCookie} from '../../../../lib/auth';
import {VISIONGENIE_API_BASE_URL, formatWebBackendError} from '../../../../lib/backend';

type AuthSuccess = {
  token: string;
  user: {
    id: string;
    username: string;
    displayName: string;
  };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {username?: string; password?: string};
    const response = await fetch(`${VISIONGENIE_API_BASE_URL}/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: String(body.username || '').trim(),
        password: String(body.password || ''),
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as
      | AuthSuccess
      | {error?: string; message?: string};

    if (!response.ok || !('token' in payload) || typeof payload.token !== 'string') {
      const error = new Error(
        payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : '登录失败，请稍后重试。',
      );
      throw error;
    }

    const result = NextResponse.json({
      user: payload.user,
    });
    applyWebAuthCookie(result, payload.token);
    return result;
  } catch (error) {
    let normalized = error;
    if (error instanceof Error && error.message === 'invalid_credentials') {
      normalized = new Error('用户名或密码错误。');
    } else if (error instanceof Error && error.message === 'validation_failed') {
      normalized = new Error('请输入完整的用户名和密码。');
    }
    const {message, status} = formatWebBackendError(normalized, '登录失败，请稍后重试。');
    return NextResponse.json({message}, {status: status === 500 ? 400 : status});
  }
}
