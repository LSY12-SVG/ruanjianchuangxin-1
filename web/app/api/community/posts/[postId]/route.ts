import { NextResponse } from 'next/server';

export async function DELETE() {
  return NextResponse.json(
    {
      message:
        '当前整合版本暂未开放 Web 端删除帖子入口，请在后续治理能力完成后再接入。',
    },
    { status: 405 },
  );
}
