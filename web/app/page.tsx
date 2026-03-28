import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero-card landing-hero">
        <div className="hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">VisionGenie Community</span>
            <h1>Web 社区已经并入主线账号与社区体系，现在可以和 App 共用同一份身份与内容。</h1>
            <p>
              现在登录、注册、浏览帖子、图文发帖、收藏、点赞和“我的”主页都直接走主线后端。
              这不再是独立演示站，而是和移动端互通的 Web 社区入口。
            </p>
            <div className="hero-actions">
              <Link className="primary-link" href="/community">
                进入社区首页
              </Link>
              <Link className="secondary-link" href="/login">
                登录或注册
              </Link>
            </div>
          </div>

          <div className="hero-spotlight">
            <span className="section-kicker">Unified Community</span>
            <h2>Web 和 App 现在读取的是同一套社区数据</h2>
            <p>
              你可以在电脑上浏览社区、在手机上继续互动，帖子详情、点赞、收藏、评论和“我的”内容会一起同步。
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
