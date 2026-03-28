import {NextResponse} from 'next/server';

import {clearWebAuthCookie} from '../../../../lib/auth';

export async function POST() {
  const response = NextResponse.json({ok: true});
  clearWebAuthCookie(response);
  return response;
}
