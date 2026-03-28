import {NextResponse} from 'next/server';

import {backendFetch, formatWebBackendError} from '../../../../../../lib/backend';

export async function POST(
  request: Request,
  context: {params: Promise<{postId: string}>},
) {
  try {
    const {postId} = await context.params;
    const body = (await request.json()) as {content?: string};
    const response = await backendFetch<{item: unknown}>(
      `/v1/modules/community/posts/${encodeURIComponent(postId)}/comments`,
      {
        method: 'POST',
        auth: true,
        body: {
          content: String(body.content || '').trim(),
        },
      },
    );

    return NextResponse.json(response.item, {status: 201});
  } catch (error) {
    const {message, status} = formatWebBackendError(error, '评论发送失败，请稍后再试。');
    return NextResponse.json({message}, {status});
  }
}
