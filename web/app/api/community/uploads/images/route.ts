import {NextResponse} from 'next/server';

import {backendFetch, formatWebBackendError} from '../../../../../lib/backend';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('image');

    if (!(file instanceof File)) {
      return NextResponse.json({message: '请选择要上传的图片。'}, {status: 400});
    }

    const backendForm = new FormData();
    backendForm.append('image', file, file.name);

    const payload = await backendFetch<{url: string}>('/v1/modules/community/uploads/images', {
      method: 'POST',
      auth: true,
      body: backendForm,
    });

    return NextResponse.json(payload, {status: 201});
  } catch (error) {
    const {message, status} = formatWebBackendError(error, '图片上传失败，请稍后重试。');
    return NextResponse.json({message}, {status});
  }
}
