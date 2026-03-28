import type {NextResponse} from 'next/server';
import {cookies} from 'next/headers';

export const WEB_AUTH_COOKIE = 'visiongenie.web.token';
const WEB_AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export async function readWebAuthToken(): Promise<string> {
  const store = await cookies();
  return store.get(WEB_AUTH_COOKIE)?.value || '';
}

export function applyWebAuthCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: WEB_AUTH_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: WEB_AUTH_COOKIE_MAX_AGE,
    secure: false,
  });
}

export function clearWebAuthCookie(response: NextResponse) {
  response.cookies.set({
    name: WEB_AUTH_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
    secure: false,
  });
}
