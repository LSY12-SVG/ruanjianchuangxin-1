import Link from 'next/link';
import {redirect} from 'next/navigation';

import CommunityBreadcrumb from '../../../components/community/CommunityBreadcrumb';
import CommunityLogoutButton from '../../../components/community/CommunityLogoutButton';
import {
  formatPublishDate,
  getCurrentProfile,
  getFavoritePosts,
  getLikedPosts,
  getMyDraftPosts,
  getMyPublishedPosts,
} from '../../../lib/community';

export const dynamic = 'force-dynamic';

export default async function CommunityMePage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect('/login?next=/community/me');
  }

  const [drafts, published, favorites, liked] = await Promise.all([
    getMyDraftPosts(),
    getMyPublishedPosts(),
    getFavoritePosts(),
    getLikedPosts(),
  ]);

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
            <Link href="/community/create">继续发帖</Link>
          </div>
        </div>
      </div>

      <section className="forum-header">
        <div className="forum-header-inner">
          <div className="forum-logo-area">
            <div className="forum-logo-mark">VG</div>
            <div className="forum-logo-copy">
              <span className="forum-domain">visiongenie community</span>
              <strong>{profile.displayName}</strong>
              <p>统一账号已经接入 Web 与 App，可在这里查看资料、草稿、点赞与收藏</p>
            </div>
          </div>

          <div className="forum-search-area">
            <div className="forum-search-box">
              <input placeholder={`@${profile.handle}`} readOnly value="" />
              <button type="button">{profile.roleLabel}</button>
            </div>
            <div className="forum-hot-tags">
              <strong>当前能力:</strong>
              <span>用户名资料</span>
              <span>最近点赞</span>
              <span>最近收藏</span>
              <span>草稿管理</span>
            </div>
          </div>
        </div>
      </section>

      <nav className="forum-nav">
        <div className="forum-nav-inner">
          <Link className="forum-nav-link" href="/community">
            首页
          </Link>
          <Link className="forum-nav-link" href="/community/create">
            发帖
          </Link>
          <Link className="forum-nav-link forum-nav-link-active" href="/community/me">
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
          {href: '/community/me', label: '创作者中心'},
        ]}
      />

      <section className="forum-content">
        <div className="forum-secondary-grid">
          <section className="forum-board forum-board-wide">
            <div className="forum-board-title">
              <h2>账号概览</h2>
            </div>
            <div className="forum-profile-summary">
              <p>
                @{profile.handle} · {profile.roleLabel} · {profile.city}
              </p>
              <p>{profile.bio}</p>
            </div>
            <div className="forum-stat-grid forum-stat-grid-wide">
              <div className="forum-stat-box">
                <strong>{profile.stats.postCount}</strong>
                <span>已发布</span>
              </div>
              <div className="forum-stat-box">
                <strong>{profile.stats.draftCount}</strong>
                <span>草稿</span>
              </div>
              <div className="forum-stat-box">
                <strong>{profile.stats.likedCount}</strong>
                <span>最近点赞</span>
              </div>
              <div className="forum-stat-box">
                <strong>{profile.stats.favoriteCount}</strong>
                <span>最近收藏</span>
              </div>
            </div>

            <div className="forum-button-row">
              <Link className="forum-action-button forum-action-primary" href="/community/create">
                发布新帖子
              </Link>
              <CommunityLogoutButton />
            </div>

            <div className="forum-subsection-title">我的草稿</div>
            <div className="forum-thread-list">
              {drafts.length > 0 ? (
                drafts.map(post => (
                  <Link
                    key={post.id}
                    className="forum-thread-item"
                    href={`/community/create?draftId=${post.id}`}>
                    <div className="forum-thread-main">
                      <h3>{post.title}</h3>
                      <p>{post.summary}</p>
                    </div>
                    <div className="forum-thread-meta">
                      <span>草稿</span>
                      <span>{formatPublishDate(post.publishedAt)}</span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="forum-empty-state">
                  <strong>还没有草稿</strong>
                  <span>去发帖页保存一篇草稿吧，之后可以继续编辑再发布。</span>
                </div>
              )}
            </div>

            <div className="forum-subsection-title">已发布内容</div>
            <div className="forum-thread-list">
              {published.length > 0 ? (
                published.map(post => (
                  <Link key={post.id} className="forum-thread-item" href={`/community/post/${post.id}`}>
                    <div className="forum-thread-main">
                      <h3>{post.title}</h3>
                      <p>{post.summary}</p>
                    </div>
                    <div className="forum-thread-meta">
                      <span>{formatPublishDate(post.publishedAt)}</span>
                      <span>{post.stats.commentCount} 条评论</span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="forum-empty-state">
                  <strong>还没有已发布内容</strong>
                  <span>写下第一篇帖子后，Web 与 App 社区都能看到它。</span>
                </div>
              )}
            </div>
          </section>

          <aside className="forum-board">
            <div className="forum-board-title">
              <h2>最近点赞</h2>
            </div>
            <div className="forum-side-list">
              {liked.length > 0 ? (
                liked.slice(0, 6).map(post => (
                  <Link key={post.id} className="forum-side-item forum-side-link" href={`/community/post/${post.id}`}>
                    <strong>{post.title}</strong>
                    <p>{post.author.name} · {post.stats.likeCount} 赞</p>
                  </Link>
                ))
              ) : (
                <div className="forum-empty-state">
                  <strong>还没有点赞记录</strong>
                  <span>去社区里点个赞，这里就会同步显示。</span>
                </div>
              )}
            </div>

            <div className="forum-board-title forum-board-title-sub">
              <h2>最近收藏</h2>
            </div>
            <div className="forum-side-list">
              {favorites.length > 0 ? (
                favorites.slice(0, 6).map(post => (
                  <Link key={post.id} className="forum-side-item forum-side-link" href={`/community/post/${post.id}`}>
                    <strong>{post.title}</strong>
                    <p>{post.author.name} · {post.stats.favoriteCount} 收藏</p>
                  </Link>
                ))
              ) : (
                <div className="forum-empty-state">
                  <strong>还没有收藏记录</strong>
                  <span>收藏感兴趣的帖子后，Web 与 App 两边都会同步。</span>
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
