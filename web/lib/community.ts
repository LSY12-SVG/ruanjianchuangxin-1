import 'server-only';

import type {
  CommunityComment,
  CommunityFeedSort,
  CommunityPostDetail,
  CommunityPostSummary,
} from '../../shared/community/contracts';
import {backendFetch, normalizeBackendAssetUrl, WebBackendError} from './backend';

type BackendAuthor = {
  id: string;
  name: string;
  avatarUrl: string;
};

type BackendPost = {
  id: string;
  author: BackendAuthor;
  status: 'draft' | 'published';
  title: string;
  content: string;
  beforeUrl: string;
  afterUrl: string;
  tags: string[];
  likesCount: number;
  savesCount: number;
  commentsCount: number;
  isLiked: boolean;
  isSaved: boolean;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type BackendComment = {
  id: string;
  postId: string;
  parentId: string | null;
  author: BackendAuthor;
  content: string;
  createdAt: string;
  updatedAt: string;
};

type BackendPagination<T> = {
  items: T[];
  page: number;
  size: number;
  total: number;
  hasMore: boolean;
};

type BackendMyProfileResponse = {
  profile: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    tier: string;
  };
  settings: {
    syncOnWifi: boolean;
    communityNotify: boolean;
    voiceAutoApply: boolean;
  };
  stats: {
    modelTasksCount: number;
    communityPostsCount: number;
  };
};

export type CommunityFeedResponse = {
  items: CommunityPostSummary[];
  nextCursor: string | null;
  sort: CommunityFeedSort;
};

export type CommunityProfile = {
  id: string;
  displayName: string;
  handle: string;
  bio: string;
  roleLabel: string;
  city: string;
  stats: {
    postCount: number;
    commentCount: number;
    favoriteCount: number;
    likedCount: number;
    draftCount: number;
  };
};

export type CommunityEditableDraft = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  imageUrls: string[];
};

const COMMUNITY_PAGE_SIZE = 24;

const trimSummary = (content: string): string => {
  const normalized = content.trim();
  if (normalized.length <= 110) {
    return normalized;
  }
  return `${normalized.slice(0, 107)}...`;
};

const toAvatarText = (name: string): string => name.replace(/\s+/g, '').slice(0, 2).toUpperCase();

const sortWeight = (post: CommunityPostSummary): number =>
  post.stats.likeCount * 4 + post.stats.commentCount * 3 + post.stats.favoriteCount * 2;

const sortPosts = (
  posts: CommunityPostSummary[],
  sort: CommunityFeedSort,
): CommunityPostSummary[] => {
  const copied = [...posts];
  if (sort === 'latest') {
    return copied.sort(
      (left, right) =>
        new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime(),
    );
  }
  if (sort === 'hot') {
    return copied.sort((left, right) => sortWeight(right) - sortWeight(left));
  }
  return copied.sort((left, right) => {
    const weightGap = sortWeight(right) - sortWeight(left);
    if (weightGap !== 0) {
      return weightGap;
    }
    return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
  });
};

const mapAuthor = (author: BackendAuthor, fallbackBio = '') => ({
  id: author.id,
  name: author.name || 'VisionGenie 用户',
  bio: fallbackBio || undefined,
  avatarText: toAvatarText(author.name || 'VG'),
});

const mapImages = (post: BackendPost) =>
  [post.beforeUrl, post.afterUrl]
    .filter(Boolean)
    .map((url, index) => ({
      id: `${post.id}-image-${index + 1}`,
      alt: `${post.title} 配图 ${index + 1}`,
      url: normalizeBackendAssetUrl(url),
    }));

const mapPostSummary = (post: BackendPost): CommunityPostSummary => ({
  id: post.id,
  author: mapAuthor(post.author),
  publishedAt: post.publishedAt || post.updatedAt || post.createdAt,
  title: post.title,
  summary: trimSummary(post.content),
  images: mapImages(post),
  stats: {
    likeCount: post.likesCount,
    commentCount: post.commentsCount,
    favoriteCount: post.savesCount,
  },
  viewerContext: {
    liked: post.isLiked,
    favorited: post.isSaved,
    canDelete: false,
  },
});

const mapPostDetail = (post: BackendPost): CommunityPostDetail => ({
  ...mapPostSummary(post),
  content: post.content,
});

const mapComment = (comment: BackendComment): CommunityComment => ({
  id: comment.id,
  postId: comment.postId,
  author: mapAuthor(comment.author),
  content: comment.content,
  publishedAt: comment.updatedAt || comment.createdAt,
});

const mapEditableDraft = (post: BackendPost): CommunityEditableDraft => ({
  id: post.id,
  title: post.title,
  content: post.content,
  tags: Array.isArray(post.tags) ? post.tags : [],
  imageUrls: [post.beforeUrl, post.afterUrl].filter(Boolean).map(normalizeBackendAssetUrl),
});

const buildHandle = (username: string): string => username.toLowerCase().replace(/\s+/g, '-');

async function fetchCommunityPostsByStatus(
  status: 'draft' | 'published',
): Promise<CommunityPostSummary[]> {
  const payload = await backendFetch<BackendPagination<BackendPost>>(
    `/v1/modules/community/me/posts?status=${status}&page=1&size=${COMMUNITY_PAGE_SIZE}`,
    {auth: true},
  );
  return payload.items.map(mapPostSummary);
}

export async function getCurrentProfile(): Promise<CommunityProfile | null> {
  try {
    const [profilePayload, publishedPayload, savedPayload, likedPayload, draftPayload] =
      await Promise.all([
        backendFetch<BackendMyProfileResponse>('/v1/profile/me', {auth: true}),
        backendFetch<BackendPagination<BackendPost>>(
          `/v1/modules/community/me/posts?status=published&page=1&size=${COMMUNITY_PAGE_SIZE}`,
          {auth: true},
        ),
        backendFetch<BackendPagination<BackendPost>>(
          `/v1/modules/community/me/saved?page=1&size=${COMMUNITY_PAGE_SIZE}`,
          {auth: true},
        ),
        backendFetch<BackendPagination<BackendPost>>(
          `/v1/modules/community/me/liked?page=1&size=${COMMUNITY_PAGE_SIZE}`,
          {auth: true},
        ),
        backendFetch<BackendPagination<BackendPost>>(
          `/v1/modules/community/me/posts?status=draft&page=1&size=${COMMUNITY_PAGE_SIZE}`,
          {auth: true},
        ),
      ]);

    return {
      id: profilePayload.profile.id,
      displayName: profilePayload.profile.displayName || profilePayload.profile.username,
      handle: buildHandle(profilePayload.profile.username || profilePayload.profile.displayName),
      bio: `统一账号 ${profilePayload.profile.username}，可在 Web 与 App 间共享社区内容与互动记录。`,
      roleLabel: profilePayload.profile.tier || 'Vision Creator',
      city: 'Shanghai',
      stats: {
        postCount: publishedPayload.items.length,
        commentCount: 0,
        favoriteCount: savedPayload.items.length,
        likedCount: likedPayload.items.length,
        draftCount: draftPayload.items.length,
      },
    };
  } catch (error) {
    if (error instanceof WebBackendError && error.status === 401) {
      return null;
    }
    if (error instanceof WebBackendError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function getMyProfile(): Promise<CommunityProfile> {
  const profile = await getCurrentProfile();
  if (!profile) {
    throw new WebBackendError('UNAUTHORIZED', 401, '请先登录后查看创作者中心。');
  }
  return profile;
}

export async function getCommunityFeed(
  sort: CommunityFeedSort = 'recommended',
): Promise<CommunityFeedResponse> {
  const payload = await backendFetch<BackendPagination<BackendPost>>(
    `/v1/modules/community/feed?page=1&size=${COMMUNITY_PAGE_SIZE}&filter=all`,
  );
  const items = sortPosts(payload.items.map(mapPostSummary), sort);
  return {
    items,
    nextCursor: payload.hasMore ? String(payload.page + 1) : null,
    sort,
  };
}

export async function searchCommunityPosts(
  query: string,
): Promise<CommunityPostSummary[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const payload = await backendFetch<BackendPagination<BackendPost>>(
    `/v1/modules/community/feed?page=1&size=80&filter=all`,
  );

  const matchedPosts = payload.items.filter(post => {
    const haystacks = [
      post.title,
      post.content,
      post.author.name,
      ...(Array.isArray(post.tags) ? post.tags : []),
    ];

    return haystacks.some(value =>
      String(value || '')
        .toLowerCase()
        .includes(normalizedQuery),
    );
  });

  return sortPosts(matchedPosts.map(mapPostSummary), 'recommended');
}

export async function getPostDetail(postId: string): Promise<CommunityPostDetail | null> {
  try {
    const post = await backendFetch<BackendPost>(
      `/v1/modules/community/posts/${encodeURIComponent(postId)}`,
    );
    return mapPostDetail(post);
  } catch (error) {
    if (error instanceof WebBackendError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function getPostComments(postId: string): Promise<CommunityComment[]> {
  const payload = await backendFetch<BackendPagination<BackendComment>>(
    `/v1/modules/community/posts/${encodeURIComponent(postId)}/comments?page=1&size=50`,
  );
  return payload.items.map(mapComment);
}

export async function getMyPublishedPosts(): Promise<CommunityPostSummary[]> {
  return fetchCommunityPostsByStatus('published');
}

export async function getMyDraftPosts(): Promise<CommunityPostSummary[]> {
  return fetchCommunityPostsByStatus('draft');
}

export async function getFavoritePosts(): Promise<CommunityPostSummary[]> {
  const payload = await backendFetch<BackendPagination<BackendPost>>(
    `/v1/modules/community/me/saved?page=1&size=${COMMUNITY_PAGE_SIZE}`,
    {auth: true},
  );
  return payload.items.map(mapPostSummary);
}

export async function getLikedPosts(): Promise<CommunityPostSummary[]> {
  const payload = await backendFetch<BackendPagination<BackendPost>>(
    `/v1/modules/community/me/liked?page=1&size=${COMMUNITY_PAGE_SIZE}`,
    {auth: true},
  );
  return payload.items.map(mapPostSummary);
}

export async function getDraftById(draftId: string): Promise<CommunityEditableDraft | null> {
  try {
    const post = await backendFetch<BackendPost>(
      `/v1/modules/community/posts/${encodeURIComponent(draftId)}`,
      {auth: true},
    );
    if (post.status !== 'draft') {
      return null;
    }
    return mapEditableDraft(post);
  } catch (error) {
    if (error instanceof WebBackendError && error.status === 404) {
      return null;
    }
    if (error instanceof WebBackendError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export function summarizePostCard(post: CommunityPostSummary) {
  return `${post.author.name} · ${post.stats.likeCount} 赞 · ${post.stats.commentCount} 评论`;
}

export function formatPublishDate(isoDate: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(isoDate));
}

export function formatLongDate(isoDate: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(isoDate));
}
