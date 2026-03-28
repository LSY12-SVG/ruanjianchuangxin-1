import {NextResponse} from 'next/server';

import {backendFetch, formatWebBackendError} from '../../../../lib/backend';

type CreatePostBody = {
  title?: string;
  content?: string;
  tags?: string[];
  imageUrls?: string[];
  mode?: 'draft' | 'publish';
  draftId?: string;
};

type BackendPost = {
  id: string;
};

const normalizeTags = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map(item => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreatePostBody;
    const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls.filter(Boolean).slice(0, 2) : [];
    const draftPayload = {
      title: String(body.title || '').trim(),
      content: String(body.content || '').trim(),
      tags: normalizeTags(body.tags),
      beforeUrl: imageUrls[0] || '',
      afterUrl: imageUrls[1] || '',
    };

    let draftResponse: {item: BackendPost};
    if (body.draftId) {
      draftResponse = await backendFetch<{item: BackendPost}>(
        `/v1/modules/community/drafts/${encodeURIComponent(body.draftId)}`,
        {
          method: 'PUT',
          auth: true,
          body: draftPayload,
        },
      );
    } else {
      draftResponse = await backendFetch<{item: BackendPost}>('/v1/modules/community/drafts', {
        method: 'POST',
        auth: true,
        body: draftPayload,
      });
    }

    if (body.mode === 'draft') {
      return NextResponse.json({
        id: draftResponse.item.id,
        status: 'draft',
      });
    }

    const published = await backendFetch<{item: BackendPost}>(
      `/v1/modules/community/drafts/${encodeURIComponent(draftResponse.item.id)}/publish`,
      {
        method: 'POST',
        auth: true,
      },
    );

    return NextResponse.json({
      id: published.item.id,
      status: 'published',
    });
  } catch (error) {
    const {message, status} = formatWebBackendError(error, '发布失败，请稍后重试。');
    return NextResponse.json({message}, {status});
  }
}
