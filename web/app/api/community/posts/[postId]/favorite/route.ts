import {NextResponse} from 'next/server';

import {backendFetch, formatWebBackendError} from '../../../../../../lib/backend';

async function updateFavorite(postId: string, saved: boolean) {
  return backendFetch<{savesCount: number; saved: boolean}>(
    `/v1/modules/community/posts/${encodeURIComponent(postId)}/save`,
    {
      method: 'POST',
      auth: true,
      body: {saved},
    },
  );
}

export async function POST(
  _request: Request,
  context: {params: Promise<{postId: string}>},
) {
  try {
    const {postId} = await context.params;
    const response = await updateFavorite(postId, true);
    return NextResponse.json(response);
  } catch (error) {
    const {message, status} = formatWebBackendError(error, '收藏失败，请稍后重试。');
    return NextResponse.json({message}, {status});
  }
}

export async function DELETE(
  _request: Request,
  context: {params: Promise<{postId: string}>},
) {
  try {
    const {postId} = await context.params;
    const response = await updateFavorite(postId, false);
    return NextResponse.json(response);
  } catch (error) {
    const {message, status} = formatWebBackendError(error, '取消收藏失败，请稍后重试。');
    return NextResponse.json({message}, {status});
  }
}
