-- Mock seed for community sqlite
-- Import example:
-- sqlite3 backend/data/community.sqlite ".read backend/data/mock-community/community-mock.seed.sql"

DELETE FROM community_comments;
DELETE FROM community_post_likes;
DELETE FROM community_post_saves;
DELETE FROM community_posts;
DELETE FROM community_users;

INSERT INTO community_users(id, display_name, avatar_url) VALUES
('1', '小北调色', ''),
('2', '胶片控阿木', ''),
('3', '夜景研究所', ''),
('4', '旅行剪辑师Mia', '');

INSERT INTO community_posts(author_id, status, title, content, before_url, after_url, tags_json, grading_params_json, likes_count, saves_count, comments_count, published_at) VALUES
('1', 'published', '阴天街景转电影青橙', '原图灰雾感偏重，目标是保留路面细节并做青橙电影氛围。', 'images/post-001-before.svg', 'images/post-001-after.svg', '["cinema","street","青橙"]', '{"basic":{"exposure":-6,"contrast":14,"highlights":-24,"shadows":16,"saturation":8}}', 26, 9, 2, CURRENT_TIMESTAMP),
('2', 'published', '人像暖肤胶片风', '目标是做轻复古胶片，不要过分磨皮和过饱和。', 'images/post-002-before.svg', 'images/post-002-after.svg', '["portrait","vintage","肤色"]', '{"basic":{"exposure":4,"contrast":6,"highlights":-18,"shadows":10,"saturation":6}}', 18, 7, 2, CURRENT_TIMESTAMP),
('3', 'published', '夜景霓虹通透提升', '原图噪点明显且偏灰，目标是保持霓虹色彩并提升通透。', 'images/post-003-before.svg', 'images/post-003-after.svg', '["night","neon","city"]', '{"basic":{"exposure":3,"contrast":18,"highlights":-12,"shadows":8,"saturation":12}}', 33, 15, 2, CURRENT_TIMESTAMP),
('4', 'published', '海边旅行清透日系', '让海水更通透、天空更干净，同时保留肤色健康感。', 'images/post-004-before.svg', 'images/post-004-after.svg', '["travel","fresh","japanese"]', '{"basic":{"exposure":5,"contrast":9,"highlights":-10,"shadows":6,"saturation":7}}', 21, 12, 2, CURRENT_TIMESTAMP);

INSERT INTO community_comments(post_id, author_id, parent_id, content) VALUES
(1, '2', NULL, '天空层次明显好了，建议暗部再提 2-3 点。'),
(1, '3', NULL, '路灯高光控制得不错，电影感已经出来。'),
(2, '4', NULL, '肤色很自然，暗部的红色可以再收一点。'),
(2, '1', NULL, '这个复古感舒服，作为预设很适合婚礼短片。'),
(3, '2', NULL, '霓虹层次非常好，建议再压一点高光保细节。'),
(3, '4', NULL, '人物提亮很有效，画面更有主次。'),
(4, '1', NULL, '这个风格很适合旅行Vlog，色彩干净。'),
(4, '3', NULL, '海水质感出来了，建议加一点轻微颗粒更有质感。');
