import Link from 'next/link';
import {redirect} from 'next/navigation';

import CommunityAuthClient from '../../components/community/CommunityAuthClient';
import {getCurrentProfile} from '../../lib/community';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const profile = await getCurrentProfile();
  if (profile) {
    redirect('/community/me');
  }

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
            <Link href="/login">登录</Link>
            <span>/</span>
            <Link href="/login">立即注册</Link>
            <span>/</span>
            <Link href="/community">浏览社区</Link>
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
              <p>Web 与 App 共用一套账号、社区内容和互动状态</p>
            </div>
          </div>

          <div className="forum-search-area">
            <div className="forum-search-box">
              <input placeholder="登录后开始浏览、发帖与收藏" readOnly value="" />
              <button type="button">社区入口</button>
            </div>
            <div className="forum-hot-tags">
              <strong>当前支持:</strong>
              <span>真实注册</span>
              <span>真实登录</span>
              <span>统一社区</span>
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
          <Link className="forum-nav-link" href="/community/create">
            发帖
          </Link>
          <Link className="forum-nav-link" href="/community/me">
            创作者中心
          </Link>
          <Link className="forum-nav-link forum-nav-link-active" href="/login">
            登录入口
          </Link>
        </div>
      </nav>

      <div className="forum-breadcrumb">
        <div className="forum-breadcrumb-inner">
          <span>首页</span>
          <span>&gt;</span>
          <span>登录入口</span>
        </div>
      </div>

      <section className="forum-content">
        <div className="forum-secondary-grid">
          <section className="forum-board forum-board-wide">
            <div className="forum-board-title">
              <h2>账号登录 / 注册</h2>
            </div>
            <CommunityAuthClient />
          </section>

          <aside className="forum-board">
            <div className="forum-board-title">
              <h2>统一说明</h2>
            </div>
            <div className="forum-side-list">
              <div className="forum-side-item">
                <strong>同一账号，跨端同步</strong>
                <p>Web 与 App 使用同一套账号体系，帖子、收藏、点赞和草稿会保持一致。</p>
              </div>
              <div className="forum-side-item">
                <strong>登录后可直接进入创作者中心</strong>
                <p>完成登录后，能查看“我的”数据，也能继续发图文帖子。</p>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
