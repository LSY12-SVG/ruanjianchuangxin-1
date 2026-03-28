import Link from 'next/link';

import CommunityAutoRefresh from '../../components/community/CommunityAutoRefresh';
import CommunityBreadcrumb from '../../components/community/CommunityBreadcrumb';
import {
  formatPublishDate,
  getCommunityFeed,
  getCurrentProfile,
  getFavoritePosts,
  searchCommunityPosts,
} from '../../lib/community';

export const dynamic = 'force-dynamic';

const hotSearches = ['夜景调色', '3D 建模', '灵感板', '作品展示', '跨端同步'];

export default async function CommunityPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const searchQuery = resolvedSearchParams?.q?.trim() ?? '';
  const profilePromise = getCurrentProfile();
  const [recommendedFeed, latestFeed, profile, searchResults] = await Promise.all([
    getCommunityFeed('recommended'),
    getCommunityFeed('latest'),
    profilePromise,
    searchQuery ? searchCommunityPosts(searchQuery) : Promise.resolve([]),
  ]);
  const favorites = profile ? await getFavoritePosts() : [];
  const hasSearchQuery = searchQuery.length > 0;

  const headlinePost = recommendedFeed.items[0];
  const headlineList = recommendedFeed.items.slice(1, 6);
  const topicPosts = latestFeed.items.slice(0, 3);

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
              <p>同一套账号、同一套后端，Web 与 App 的社区内容已经真正连通</p>
            </div>
          </div>

          <div className="forum-search-area">
            <form className="forum-search-box" action="/community" method="get">
              <input
                aria-label="搜索社区帖子"
                defaultValue={searchQuery}
                name="q"
                placeholder="搜索帖子标题、作者、正文或标签"
                type="search"
              />
              <button type="submit">{hasSearchQuery ? '重新搜索' : '搜索帖子'}</button>
            </form>
            <div className="forum-hot-tags">
              <strong>热搜:</strong>
              {hotSearches.map(keyword => (
                <Link key={keyword} href={`/community?q=${encodeURIComponent(keyword)}`}>
                  {keyword}
                </Link>
              ))}
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
          {label: '社区导航'},
        ]}
      />

      <section className="forum-content">
        <CommunityAutoRefresh label="社区首页自动同步中，Web 与 App 的发帖、点赞、收藏和评论会持续刷新。" />

        {hasSearchQuery ? (
          <section className="forum-board forum-board-wide">
            <div className="forum-board-title">
              <h2>搜索结果</h2>
            </div>
            <div className="forum-profile-summary">
              <p>
                关键词“{searchQuery}”共匹配到 {searchResults.length} 条帖子。
              </p>
            </div>
            <div className="forum-thread-list">
              {searchResults.length > 0 ? (
                searchResults.slice(0, 12).map(post => (
                  <Link key={post.id} className="forum-thread-item" href={`/community/post/${post.id}`}>
                    <div className="forum-thread-main">
                      <h3>{post.title}</h3>
                      <p>{post.summary}</p>
                    </div>
                    <div className="forum-thread-meta">
                      <span>{post.author.name}</span>
                      <span>{formatPublishDate(post.publishedAt)}</span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="forum-empty-state">
                  <strong>没有找到匹配内容</strong>
                  <span>试试更短的关键词，或者点击下方热搜词继续浏览。</span>
                </div>
              )}
            </div>
          </section>
        ) : null}

        <div className="forum-main-grid">
          <section className="forum-board forum-board-wide">
            <div className="forum-board-title">
              <h2>{hasSearchQuery ? '继续浏览精华帖子' : '精华帖子'}</h2>
            </div>

            <div className="forum-featured-layout">
              <article className="forum-featured-card">
                {headlinePost?.images[0] ? (
                  <div
                    className="forum-featured-image"
                    style={{backgroundImage: `url(${headlinePost.images[0].url})`}}
                  />
                ) : (
                  <div className="forum-featured-image forum-featured-image-fallback">
                    <span>{headlinePost?.author.avatarText ?? 'VG'}</span>
                  </div>
                )}
                <div className="forum-featured-overlay">
                  <h3>{headlinePost?.title ?? '社区焦点内容'}</h3>
                  <div className="forum-featured-meta">
                    <span>{headlinePost?.author.name ?? 'VisionGenie 用户'}</span>
                    <span>
                      {headlinePost ? formatPublishDate(headlinePost.publishedAt) : '刚刚'}
                    </span>
                  </div>
                </div>
              </article>

              <div className="forum-headline-list">
                {headlineList.map(post => (
                  <Link key={post.id} className="forum-headline-item" href={`/community/post/${post.id}`}>
                    <h3>{post.title}</h3>
                    <p>{post.summary}</p>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          <aside className="forum-board forum-board-side">
            <div className="forum-board-title">
              <h2>精选专题</h2>
            </div>

            <div className="forum-topic-list">
              {topicPosts.map(post => (
                <Link key={post.id} className="forum-topic-item" href={`/community/post/${post.id}`}>
                  {post.images[0] ? (
                    <div
                      className="forum-topic-image"
                      style={{backgroundImage: `url(${post.images[0].url})`}}
                    />
                  ) : (
                    <div className="forum-topic-image forum-topic-image-fallback">
                      <span>{post.author.avatarText}</span>
                    </div>
                  )}
                  <strong>{post.title}</strong>
                </Link>
              ))}
            </div>
          </aside>
        </div>

        <div className="forum-secondary-grid">
          <section className="forum-board">
            <div className="forum-board-title">
              <h2>{hasSearchQuery ? '最新帖子' : '最新帖子'}</h2>
            </div>
            <div className="forum-thread-list">
              {latestFeed.items.slice(0, 8).map(post => (
                <Link key={post.id} className="forum-thread-item" href={`/community/post/${post.id}`}>
                  <div className="forum-thread-main">
                    <h3>{post.title}</h3>
                    <p>{post.summary}</p>
                  </div>
                  <div className="forum-thread-meta">
                    <span>{post.author.name}</span>
                    <span>{formatPublishDate(post.publishedAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <aside className="forum-board">
            <div className="forum-board-title">
              <h2>社区数据</h2>
            </div>
            <div className="forum-stat-grid">
              <div className="forum-stat-box">
                <strong>{recommendedFeed.items.length}</strong>
                <span>精华帖</span>
              </div>
              <div className="forum-stat-box">
                <strong>{profile?.stats.postCount ?? 0}</strong>
                <span>我的帖子</span>
              </div>
              <div className="forum-stat-box">
                <strong>{profile?.stats.likedCount ?? 0}</strong>
                <span>最近点赞</span>
              </div>
              <div className="forum-stat-box">
                <strong>{favorites.length}</strong>
                <span>我的收藏</span>
              </div>
            </div>
            <div className="forum-profile-card">
              <h3>{profile?.displayName ?? '游客模式'}</h3>
              <p>{profile ? `@${profile.handle}` : '登录后查看个人主页与草稿'}</p>
              <p>
                {profile
                  ? profile.bio
                  : '当前你可以先浏览社区内容；登录后就能在 Web 与 App 间共享发帖、收藏和点赞状态。'}
              </p>
              <div className="forum-profile-actions">
                <Link
                  className="forum-action-button forum-action-primary"
                  href={profile ? '/community/create' : '/login'}>
                  {profile ? '发布帖子' : '登录账号'}
                </Link>
                <Link className="forum-action-button" href={profile ? '/community/me' : '/community'}>
                  {profile ? '进入主页' : '继续浏览'}
                </Link>
              </div>
            </div>
          </aside>
        </div>

        <div className="forum-footer-bar">
          <span>今日: {latestFeed.items.length}</span>
          <span>|</span>
          <span>帖子: {recommendedFeed.items.length + latestFeed.items.length}</span>
          <span>|</span>
          <span>会员: 15998</span>
          <span>|</span>
          <span>欢迎新会员: {profile?.displayName ?? 'VisionGenie 用户'}</span>
        </div>
      </section>
    </main>
  );
}
