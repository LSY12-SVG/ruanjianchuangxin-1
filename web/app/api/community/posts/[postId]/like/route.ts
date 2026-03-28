import {NextResponse} from 'next/server';

import {backendFetch, formatWebBackendError} from '../../../../../../lib/backend';

async function updateLike(postId: string, liked: boolean) {
  return backendFetch<{likesCount: number; liked: boolean}>(
    `/v1/modules/community/posts/${encodeURIComponent(postId)}/like`,
    {
      method: 'POST',
      auth: true,
      body: {liked},
    },
  );
}

export async function POST(
  _request: Request,
  context: {params: Promise<{postId: string}>},
) {
  try {
    const {postId} = await context.params;
    const response = await updateLike(postId, true);
    return NextResponse.json(response);
  } catch (error) {
    const {message, status} = formatWebBackendError(error, '点赞失败，请稍后重试。');
    return NextResponse.json({message}, {status});
  }
}

export async function DELETE(
  _request: Request,
  context: {params: Promise<{postId: string}>},
) {
  try {
    const {postId} = await context.params;
    const response = await updateLike(postId, false);
    return NextResponse.json(response);
  } catch (error) {
    const {message, status} = formatWebBackendError(error, '取消点赞失败，请稍后重试。');
    return NextResponse.json({message}, {status});
  }
}
