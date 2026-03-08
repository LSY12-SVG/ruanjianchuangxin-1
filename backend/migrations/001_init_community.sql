CREATE TABLE IF NOT EXISTS community_users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS community_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  before_url TEXT NOT NULL DEFAULT '',
  after_url TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL,
  grading_params_json TEXT NOT NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  saves_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES community_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_post_likes (
  post_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES community_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_post_saves (
  post_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES community_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  author_id TEXT NOT NULL,
  parent_id INTEGER NULL,
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES community_users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES community_comments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_community_posts_status_created_at
  ON community_posts(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_posts_author_status
  ON community_posts(author_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_comments_post_created_at
  ON community_comments(post_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_community_comments_parent_id
  ON community_comments(parent_id);
