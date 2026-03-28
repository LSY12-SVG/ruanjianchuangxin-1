import {
  CommentItem,
  CommunityComment,
  CommunityFeedSort,
  CommunityPostDetail,
  CommunityPostSummary,
  CommunityUser,
  LocalCreateCommentInput,
  LocalCreatePostInput,
} from './contracts';

export const demoCurrentUser: CommunityUser = {
  id: 'user-demo',
  name: 'Vision Genie 创作者',
  avatarText: 'VG',
  bio: '热爱 AI 创作、配色和社区交流。',
};

const demoUsers: Record<string, CommunityUser> = {
  [demoCurrentUser.id]: demoCurrentUser,
  'user-luna': {
    id: 'user-luna',
    name: 'Luna',
    avatarText: 'LU',
    bio: '偏爱胶片色调和夜景拍摄。',
  },
  'user-mars': {
    id: 'user-mars',
    name: 'Mars',
    avatarText: 'MA',
    bio: '正在尝试把建模流程做得更轻量。',
  },
  'user-nova': {
    id: 'user-nova',
    name: 'Nova',
    avatarText: 'NO',
    bio: '喜欢收集创意灵感和画面结构。',
  },
};

export const demoCommunityPostDetails: Record<string, CommunityPostDetail> = {
  'post-01': {
    id: 'post-01',
    author: demoUsers['user-luna'],
    publishedAt: '2026-03-18T10:30:00.000Z',
    title: '把夜景照片调成电影蓝调的三个步骤',
    summary: '我用 Vision Genie 做了一次夜景改色，发现先压暗高光再提亮中间调很稳。',
    content:
      '我用 Vision Genie 做了一次夜景改色，发现先压暗高光再提亮中间调很稳。第一步先把画面的高光区域压下来，避免霓虹灯直接炸掉；第二步用偏青蓝的中间调覆盖街景，让主体和背景的关系更统一；第三步再轻微提一点肤色或主体的暖色，画面会更有层次。',
    images: [
      {
        id: 'post-01-image-01',
        url: 'https://images.example.com/community/post-01.jpg',
        alt: '夜景蓝调示例图',
      },
    ],
    stats: {
      likeCount: 18,
      commentCount: 2,
      favoriteCount: 6,
    },
    viewerContext: {
      liked: false,
      favorited: false,
    },
  },
  'post-02': {
    id: 'post-02',
    author: demoUsers['user-mars'],
    publishedAt: '2026-03-19T04:20:00.000Z',
    title: '3D 建模功能适合拿来做产品草模吗？',
    summary: '今天试着用手机快速扫了个摆件，想讨论一下这套流程更适合概念验证还是成品输出。',
    content:
      '今天试着用手机快速扫了个摆件，想讨论一下这套流程更适合概念验证还是成品输出。目前我的感受是，作为灵感验证非常快，尤其适合和调色、画面包装一起走。但如果要直接给工业级精度，还是需要后面再做一次精修。',
    images: [],
    stats: {
      likeCount: 11,
      commentCount: 1,
      favoriteCount: 3,
    },
    viewerContext: {
      liked: true,
      favorited: false,
    },
  },
  'post-03': {
    id: 'post-03',
    author: demoUsers['user-nova'],
    publishedAt: '2026-03-19T13:45:00.000Z',
    title: '把灵感板变成一个可执行的拍摄清单',
    summary: '我最近会先在社区里记录构图和关键词，再反推拍摄顺序，效率提升不少。',
    content:
      '我最近会先在社区里记录构图和关键词，再反推拍摄顺序，效率提升不少。先把想要的情绪、颜色和主体动作写下来，再标记哪些需要 AI 调色、哪些要靠实拍完成，最后组合成真正可执行的拍摄清单。',
    images: [
      {
        id: 'post-03-image-01',
        url: 'https://images.example.com/community/post-03-01.jpg',
        alt: '灵感板示意图',
      },
      {
        id: 'post-03-image-02',
        url: 'https://images.example.com/community/post-03-02.jpg',
        alt: '拍摄清单示意图',
      },
    ],
    stats: {
      likeCount: 26,
      commentCount: 3,
      favoriteCount: 12,
    },
    viewerContext: {
      liked: false,
      favorited: true,
    },
  },
};

export const demoCommunityCommentsByPostId: Record<string, CommunityComment[]> = {
  'post-01': [
    {
      id: 'comment-01',
      postId: 'post-01',
      author: demoUsers['user-mars'],
      content: '这个分步思路很清晰，我回头也试试先压高光。',
      publishedAt: '2026-03-18T11:00:00.000Z',
    },
    {
      id: 'comment-02',
      postId: 'post-01',
      author: demoUsers['user-nova'],
      content: '最后补一点暖色真的很关键，不然人物会显得有点冷。',
      publishedAt: '2026-03-18T12:10:00.000Z',
    },
  ],
  'post-02': [
    {
      id: 'comment-03',
      postId: 'post-02',
      author: demoUsers['user-luna'],
      content: '我更偏向概念验证，不过前期出稿真的非常快。',
      publishedAt: '2026-03-19T05:05:00.000Z',
    },
  ],
  'post-03': [
    {
      id: 'comment-04',
      postId: 'post-03',
      author: demoUsers['user-luna'],
      content: '这个方法很适合团队协作时统一目标。',
      publishedAt: '2026-03-19T14:20:00.000Z',
    },
    {
      id: 'comment-05',
      postId: 'post-03',
      author: demoUsers['user-mars'],
      content: '想看你后面是怎么把清单映射到拍摄流程里的。',
      publishedAt: '2026-03-19T15:00:00.000Z',
    },
    {
      id: 'comment-06',
      postId: 'post-03',
      author: demoCurrentUser,
      content: '这个思路和灵感采集功能也能接起来。',
      publishedAt: '2026-03-19T15:40:00.000Z',
    },
  ],
};

export const demoCommunityPosts: CommunityPostSummary[] = Object.values(
  demoCommunityPostDetails,
).map(toPostSummary);

export const demoCommunityFeedBySort: Record<
  CommunityFeedSort,
  CommunityPostSummary[]
> = {
  recommended: buildDemoFeedFromDetails(demoCommunityPostDetails, 'recommended'),
  latest: buildDemoFeedFromDetails(demoCommunityPostDetails, 'latest'),
  hot: buildDemoFeedFromDetails(demoCommunityPostDetails, 'hot'),
};

export const demoCommunityFeed = demoCommunityFeedBySort.recommended;
export const demoCommunityComments = demoCommunityCommentsByPostId;

export function createInitialCommunityPostDetails() {
  return clonePostDetails(demoCommunityPostDetails);
}

export function createInitialCommunityCommentsByPostId() {
  return cloneCommentsByPostId(demoCommunityCommentsByPostId);
}

export function buildDemoFeedFromDetails(
  postDetails: Record<string, CommunityPostDetail>,
  feedSort: CommunityFeedSort,
): CommunityPostSummary[] {
  const posts = Object.values(postDetails).map(toPostSummary);

  if (feedSort === 'latest') {
    return posts.sort(
      (left, right) =>
        new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime(),
    );
  }

  if (feedSort === 'hot') {
    return posts.sort((left, right) => {
      const leftScore =
        left.stats.likeCount * 3 +
        left.stats.commentCount * 2 +
        left.stats.favoriteCount * 4;
      const rightScore =
        right.stats.likeCount * 3 +
        right.stats.commentCount * 2 +
        right.stats.favoriteCount * 4;
      return rightScore - leftScore;
    });
  }

  return posts.sort((left, right) => {
    const rightDate = new Date(right.publishedAt).getTime();
    const leftDate = new Date(left.publishedAt).getTime();
    const rightScore =
      right.stats.likeCount * 2 +
      right.stats.favoriteCount * 3 +
      right.stats.commentCount * 2;
    const leftScore =
      left.stats.likeCount * 2 +
      left.stats.favoriteCount * 3 +
      left.stats.commentCount * 2;

    if (rightScore === leftScore) {
      return rightDate - leftDate;
    }

    return rightScore - leftScore;
  });
}

export function createLocalComment(
  input: LocalCreateCommentInput,
): CommunityComment {
  const now = new Date().toISOString();

  return {
    id: `comment-local-${Date.now()}`,
    postId: input.postId,
    author: demoCurrentUser,
    content: input.content,
    publishedAt: now,
  };
}

export function createLocalPostDetail(
  input: LocalCreatePostInput,
): CommunityPostDetail {
  const createdAt = new Date().toISOString();
  const postId = `post-local-${Date.now()}`;
  const summary =
    input.content.length > 80
      ? `${input.content.slice(0, 80).trim()}...`
      : input.content;

  return {
    id: postId,
    author: demoCurrentUser,
    publishedAt: createdAt,
    title: input.title,
    summary,
    content: input.content,
    images: input.imageUrl
      ? [
          {
            id: `${postId}-image-01`,
            url: input.imageUrl,
            alt: `${input.title} 配图`,
          },
        ]
      : [],
    stats: {
      likeCount: 0,
      commentCount: 0,
      favoriteCount: 0,
    },
    viewerContext: {
      liked: false,
      favorited: false,
    },
  };
}

export function getDemoPostDetail(
  postId: string,
): CommunityPostDetail | undefined {
  const post = demoCommunityPostDetails[postId];
  return post ? { ...post, images: [...post.images] } : undefined;
}

export function getDemoComments(postId: string): CommentItem[] {
  return [...(demoCommunityCommentsByPostId[postId] ?? [])];
}

function toPostSummary(post: CommunityPostDetail): CommunityPostSummary {
  return {
    id: post.id,
    author: post.author,
    publishedAt: post.publishedAt,
    title: post.title,
    summary: post.summary,
    images: [...post.images],
    stats: { ...post.stats },
    viewerContext: { ...post.viewerContext },
  };
}

function clonePostDetails(
  source: Record<string, CommunityPostDetail>,
): Record<string, CommunityPostDetail> {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      {
        ...value,
        author: { ...value.author },
        images: value.images.map(image => ({ ...image })),
        stats: { ...value.stats },
        viewerContext: { ...value.viewerContext },
      },
    ]),
  );
}

function cloneCommentsByPostId(
  source: Record<string, CommunityComment[]>,
): Record<string, CommunityComment[]> {
  return Object.fromEntries(
    Object.entries(source).map(([key, comments]) => [
      key,
      comments.map(comment => ({
        ...comment,
        author: { ...comment.author },
      })),
    ]),
  );
}
