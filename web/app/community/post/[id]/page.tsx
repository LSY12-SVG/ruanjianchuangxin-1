import Link from 'next/link';

import CommunityAutoRefresh from '../../../../components/community/CommunityAutoRefresh';
import CommunityBreadcrumb from '../../../../components/community/CommunityBreadcrumb';
import CommunityPostInteractionClient from '../../../../components/community/CommunityPostInteractionClient';
import {
  formatLongDate,
  getCurrentProfile,
  getPostComments,
  getPostDetail,
} from '../../../../lib/community';

export default async function CommunityPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [post, comments, profile] = await Promise.all([
    getPostDetail(id),
    getPostComments(id),
    getCurrentProfile(),
  ]);

  if (!post) {
    return (
      <main className="forum-page">
        <section className="forum-content">
          <div className="forum-board forum-board-wide">
            <div className="forum-board-title">
              <h2>帖子不存在</h2>
            </div>
            <div className="forum-form-wrap">
              <p className="forum-board-intro">
                它可能已经被删除，或者当前主线社区服务还没有返回对应详情数据。
              </p>
              <div className="forum-button-row">
                <Link className="forum-action-button forum-action-primary" href="/community">
                  返回社区首页
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="forum-page">
      <div className="forum-topline">
        <div className="forum-topline-inner">
          <div className="forum-topline-links">
            <Link href="/">设为首页</Link>
            <span>/</span>
            <Link href="/community">收藏本站</Link>
            <span>/</span>
            <Link href="/community/create">发帖交流</Link>
            <span>/</span>
            <Link href="/community/me">创作者中心</Link>
          </div>
          <div className="forum-topline-links">
            {profile ? (
              <>
                <span>你好，{profile.displayName}</span>
                <span>/</span>
                <Link href="/community/me">我的主页</Link>
              </>
            ) : (
              <>
                <Link href="/login">登录</Link>
                <span>/</span>
                <Link href="/login">立即注册</Link>
                <span>/</span>
                <span>游客浏览</span>
              </>
            )}
          </div>
        </div>
      </div>

      <section className="forum-header">
        <div className="forum-header-inner">
          <div className="forum-logo-area">
            <div className="forum-logo-mark">VG</div>
            <div className="forum-logo-copy">
              <span className="forum-domain">visiongenie community</span>
              <strong>VisionGenie 创作社区</strong>
              <p>和移动端共用同一套账号与社区后端，帖子详情与互动状态实时同步</p>
            </div>
          </div>

          <div className="forum-search-area">
            <div className="forum-search-box">
              <input placeholder="请输入搜索内容" readOnly value="" />
              <button type="button">搜索</button>
            </div>
            <div className="forum-hot-tags">
              <strong>热搜:</strong>
              <span>夜景调色</span>
              <span>3D 建模</span>
              <span>灵感板</span>
              <span>作品展示</span>
            </div>
          </div>
        </div>
      </section>

      <nav className="forum-nav">
        <div className="forum-nav-inner">
          <Link className="forum-nav-link forum-nav-link-active" href="/community">
            首页
          </Link>
          <Link className="forum-nav-link" href="/community/create">
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
          {href: `/community/post/${post.id}`, label: '帖子内容'},
        ]}
      />

      <section className="forum-content">
        <CommunityAutoRefresh label="帖子详情自动同步中，适合和手机端联调查看最新互动状态。" />

        <div className="forum-secondary-grid">
          <article className="forum-board forum-board-wide">
            <div className="forum-board-title">
              <h2>{post.title}</h2>
            </div>

            <div className="forum-post-meta">
              <span>{post.author.name}</span>
              <span>{formatLongDate(post.publishedAt)}</span>
              <span>{post.images.length} 张图片</span>
            </div>

            {post.images.length > 0 ? (
              <div className="forum-detail-image-grid">
                {post.images.map(image => (
                  <div
                    key={image.id}
                    className="forum-detail-image"
                    style={{ backgroundImage: `url(${image.url})` }}
                  />
                ))}
              </div>
            ) : null}

            <CommunityPostInteractionClient
              initialComments={comments}
              initialPost={post}
              postId={post.id}
            />
          </article>

          <aside className="forum-board">
            <div className="forum-board-title">
              <h2>作者卡片</h2>
            </div>
            <div className="forum-side-list">
              <div className="forum-side-item">
                <strong>{post.author.name}</strong>
                <p>{post.author.bio ?? '这位创作者还没有填写个人简介。'}</p>
              </div>
            </div>

            <div className="forum-board-title forum-board-title-sub">
              <h2>互动说明</h2>
            </div>
            <div className="forum-side-list">
              <div className="forum-side-item">
              <strong>点赞、评论、收藏已接入当前社区服务</strong>
              <p>点击正文下方的交互按钮后，帖子会立即刷新交互状态，评论也会写入当前社区数据源。</p>
            </div>
            <div className="forum-side-item">
              <strong>Web 与 App 已共享同一社区身份</strong>
              <p>使用同一个账号登录后，发帖、点赞、收藏和评论都会在两端保持一致。</p>
            </div>
            <div className="forum-side-item">
              <strong>帖子图片结构已经对齐主线协议</strong>
              <p>当前详情页会把主线接口的 before/after 图片映射成 Web 端的双图展示，方便继续扩展更多图文样式。</p>
            </div>
          </div>
        </aside>
        </div>
      </section>
    </main>
  );
}
