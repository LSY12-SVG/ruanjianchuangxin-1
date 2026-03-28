import Link from 'next/link';
import {redirect} from 'next/navigation';

import CommunityBreadcrumb from '../../../components/community/CommunityBreadcrumb';
import CommunityCreatePostClient from '../../../components/community/CommunityCreatePostClient';
import {getCurrentProfile, getDraftById} from '../../../lib/community';

export const dynamic = 'force-dynamic';

export default async function CommunityCreatePage({
  searchParams,
}: {
  searchParams?: Promise<{draftId?: string}>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect('/login?next=/community/create');
  }

  const resolvedSearchParams = (await searchParams) || {};
  const initialDraft = resolvedSearchParams.draftId
    ? await getDraftById(resolvedSearchParams.draftId)
    : null;

  return (
    <main className="forum-page">
      <div className="forum-topline">
        <div className="forum-topline-inner">
          <div className="forum-topline-links">
            <Link href="/">VisionGenie 首页</Link>
            <span>/</span>
            <Link href="/community">社区首页</Link>
            <span>/</span>
            <Link href="/community/create">发帖交流</Link>
            <span>/</span>
            <Link href="/community/me">创作者中心</Link>
          </div>
          <div className="forum-topline-links">
            <span>当前账号：{profile.displayName}</span>
            <span>/</span>
            <Link href="/community/me">返回我的</Link>
          </div>
        </div>
      </div>

      <section className="forum-header">
        <div className="forum-header-inner">
          <div className="forum-logo-area">
            <div className="forum-logo-mark">VG</div>
            <div className="forum-logo-copy">
              <span className="forum-domain">visiongenie community</span>
              <strong>{initialDraft ? '继续编辑草稿' : '发布帖子'}</strong>
              <p>发帖内容会直接进入当前统一社区后端，Web 与 App 会看到同一条数据</p>
            </div>
          </div>

          <div className="forum-search-area">
            <div className="forum-search-box">
              <input placeholder="支持图文发帖与草稿保存" readOnly value="" />
              <button type="button">创作中</button>
            </div>
            <div className="forum-hot-tags">
              <strong>已支持:</strong>
              <span>草稿保存</span>
              <span>统一发帖</span>
              <span>图片上传</span>
              <span>跨端同步</span>
            </div>
          </div>
        </div>
      </section>

      <nav className="forum-nav">
        <div className="forum-nav-inner">
          <Link className="forum-nav-link" href="/community">
            首页
          </Link>
          <Link className="forum-nav-link forum-nav-link-active" href="/community/create">
            发帖
          </Link>
          <Link className="forum-nav-link" href="/community/me">
            创作者中心
          </Link>
          <Link className="forum-nav-link" href="/login">
            登录入口
          </Link>
        </div>
      </nav>

      <CommunityBreadcrumb
        items={[
          {href: '/community', label: '首页'},
          {href: '/community/create', label: initialDraft ? '编辑草稿' : '发布帖子'},
        ]}
      />

      <section className="forum-content">
        <div className="forum-secondary-grid">
          <section className="forum-board forum-board-wide">
            <div className="forum-board-title">
              <h2>{initialDraft ? '编辑草稿' : '发布帖子'}</h2>
            </div>

            <CommunityCreatePostClient initialDraft={initialDraft} />
          </section>

          <aside className="forum-board">
            <div className="forum-board-title">
              <h2>发帖建议</h2>
            </div>
            <div className="forum-side-list">
              <div className="forum-side-item">
                <strong>先写一个明确标题</strong>
                <p>让用户一眼知道你是在分享技巧、求助还是展示作品。</p>
              </div>
              <div className="forum-side-item">
                <strong>支持双图兼容单图</strong>
                <p>你可以只发一张图，也可以上传 before/after 两张图，与移动端模型保持一致。</p>
              </div>
              <div className="forum-side-item">
                <strong>草稿与已发布共用同一套数据</strong>
                <p>保存草稿后，可以在“创作者中心”继续编辑，发布后会立即出现在 Web 与 App 社区里。</p>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
