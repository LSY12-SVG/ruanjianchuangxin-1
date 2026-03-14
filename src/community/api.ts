import {NativeModules} from 'react-native';
import type {ColorGradingParams} from '../types/colorGrading';
import {getAuthToken} from '../profile/api';

export type FeedFilter = 'all' | 'portrait' | 'cinema' | 'vintage';
export type PostStatus = 'draft' | 'published';

export interface CommunityAuthor {
  id: string;
  name: string;
  avatarUrl: string;
}

export interface CommunityPost {
  id: string;
  author: CommunityAuthor;
  status: PostStatus;
  title: string;
  content: string;
  beforeUrl: string;
  afterUrl: string;
  tags: string[];
  gradingParams: Partial<ColorGradingParams>;
  likesCount: number;
  savesCount: number;
  commentsCount: number;
  isLiked: boolean;
  isSaved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityComment {
  id: string;
  postId: string;
  parentId: string | null;
  author: CommunityAuthor;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityPaginationResponse<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
  hasMore: boolean;
}

interface CommunityDraftPayload {
  title: string;
  content: string;
  tags: string[];
  beforeUrl?: string;
  afterUrl?: string;
  gradingParams?: Partial<ColorGradingParams>;
}

interface MockUserRecord {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

interface MockCommentRecord {
  id?: string;
  authorId?: string;
  content?: string;
}

interface MockPostRecord {
  id?: string;
  authorId?: string;
  status?: PostStatus;
  title?: string;
  content?: string;
  beforeImage?: string;
  afterImage?: string;
  tags?: string[];
  styleSuggestions?: string[];
  gradingParams?: Partial<ColorGradingParams>;
  appComments?: MockCommentRecord[];
}

interface MockCommunityPayload {
  users?: MockUserRecord[];
  posts?: MockPostRecord[];
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:8787';
const DEFAULT_USER_ID = 'lsy-local-user';
const MOCK_FALLBACK_ENABLED = typeof __DEV__ === 'boolean' && __DEV__;
const MOCK_COMMUNITY_DATA = require('../../backend/data/mock-community/community-mock.json') as MockCommunityPayload;

let mockReady = false;
let mockSequence = 1000;
let mockPublishedPosts: CommunityPost[] = [];
const mockDraftByUserId = new Map<string, CommunityPost>();
const mockCommentsByPostId = new Map<string, CommunityComment[]>();
const mockLikeByUserId = new Map<string, Set<string>>();
const mockSaveByUserId = new Map<string, Set<string>>();
const mockUsers = new Map<string, CommunityAuthor>();

const isIpv4Host = (hostname: string): boolean => /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);

const isUsableDevHost = (hostname: string): boolean => {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '10.0.2.2' ||
    normalized === '10.0.3.2'
  ) {
    return true;
  }
  if (isIpv4Host(normalized)) {
    return true;
  }
  return normalized.includes('.');
};

const buildBaseFromScriptURL = (): string | null => {
  const scriptURL = NativeModules?.SourceCode?.scriptURL;
  if (typeof scriptURL !== 'string' || scriptURL.length === 0) {
    return null;
  }
  try {
    const parsed = new URL(scriptURL);
    const hostname = parsed.hostname || '';
    if (!isUsableDevHost(hostname)) {
      return null;
    }
    return `${parsed.protocol}//${hostname}:8787`;
  } catch {
    return null;
  }
};

const resolveBaseCandidates = (): string[] => {
  const set = new Set<string>();
  set.add(DEFAULT_BASE_URL);
  set.add('http://localhost:8787');
  set.add('http://10.0.2.2:8787');
  set.add('http://10.0.3.2:8787');
  const fromScript = buildBaseFromScriptURL();
  if (fromScript) {
    set.add(fromScript);
  }
  return Array.from(set);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseErrorCode = (value: unknown): string => {
  if (isObject(value) && typeof value.error === 'string') {
    return value.error;
  }
  return '';
};

const parsePost = (value: unknown): CommunityPost | null => {
  if (!isObject(value) || !isObject(value.author)) {
    return null;
  }
  const tags = Array.isArray(value.tags)
    ? value.tags.filter((item): item is string => typeof item === 'string')
    : [];
  const gradingParams =
    value.gradingParams && isObject(value.gradingParams)
      ? (value.gradingParams as Partial<ColorGradingParams>)
      : {};

  return {
    id: String(value.id || ''),
    author: {
      id: String(value.author.id || ''),
      name: String(value.author.name || ''),
      avatarUrl: String(value.author.avatarUrl || ''),
    },
    status: value.status === 'draft' ? 'draft' : 'published',
    title: String(value.title || ''),
    content: String(value.content || ''),
    beforeUrl: String(value.beforeUrl || ''),
    afterUrl: String(value.afterUrl || ''),
    tags,
    gradingParams,
    likesCount: Number(value.likesCount || 0),
    savesCount: Number(value.savesCount || 0),
    commentsCount: Number(value.commentsCount || 0),
    isLiked: Boolean(value.isLiked),
    isSaved: Boolean(value.isSaved),
    createdAt: String(value.createdAt || ''),
    updatedAt: String(value.updatedAt || ''),
  };
};

const parseComment = (value: unknown): CommunityComment | null => {
  if (!isObject(value) || !isObject(value.author)) {
    return null;
  }
  return {
    id: String(value.id || ''),
    postId: String(value.postId || ''),
    parentId: value.parentId ? String(value.parentId) : null,
    author: {
      id: String(value.author.id || ''),
      name: String(value.author.name || ''),
      avatarUrl: String(value.author.avatarUrl || ''),
    },
    content: String(value.content || ''),
    createdAt: String(value.createdAt || ''),
    updatedAt: String(value.updatedAt || ''),
  };
};

const parsePagination = <T>(
  value: unknown,
  parseItem: (item: unknown) => T | null,
): CommunityPaginationResponse<T> => {
  if (!isObject(value)) {
    return {items: [], page: 1, size: 10, total: 0, hasMore: false};
  }
  const itemsRaw = Array.isArray(value.items) ? value.items : [];
  const items = itemsRaw.map(parseItem).filter((item): item is T => Boolean(item));
  return {
    items,
    page: Number(value.page || 1),
    size: Number(value.size || 10),
    total: Number(value.total || 0),
    hasMore: Boolean(value.hasMore),
  };
};

const requestCommunity = async (
  path: string,
  init: RequestInit,
  _userId?: string,
): Promise<unknown> => {
  const candidates = resolveBaseCandidates();
  let lastError: Error | null = null;

  for (const base of candidates) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string>),
      };
      const token = getAuthToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await fetch(`${base}${path}`, {
        ...init,
        headers,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(parseErrorCode(data) || `community_http_${response.status}`);
      }
      return data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('community_request_failed');
    }
  }

  throw lastError || new Error('community_request_failed');
};

const normalizeUserId = (userId: string | undefined): string => {
  const normalized = String(userId || DEFAULT_USER_ID).trim();
  return normalized || DEFAULT_USER_ID;
};

const nowIso = () => new Date().toISOString();

const getOrCreateUser = (userId: string): CommunityAuthor => {
  const normalized = normalizeUserId(userId);
  const existing = mockUsers.get(normalized);
  if (existing) {
    return existing;
  }
  const created: CommunityAuthor = {
    id: normalized,
    name: `user_${normalized}`,
    avatarUrl: '',
  };
  mockUsers.set(normalized, created);
  return created;
};

const getUserPostSet = (map: Map<string, Set<string>>, userId: string): Set<string> => {
  const normalized = normalizeUserId(userId);
  const existing = map.get(normalized);
  if (existing) {
    return existing;
  }
  const created = new Set<string>();
  map.set(normalized, created);
  return created;
};

const resolveMockImageUrl = (postId: string, phase: 'before' | 'after'): string =>
  `https://picsum.photos/seed/${encodeURIComponent(`${postId}-${phase}`)}/1080/720`;

const composeMockContent = (base: string, suggestions: string[]): string => {
  if (!suggestions.length) {
    return base;
  }
  return `${base}\n\n风格建议：\n${suggestions.map((item, index) => `${index + 1}. ${item}`).join('\n')}`;
};

const ensureMockStore = (): void => {
  if (mockReady) {
    return;
  }
  mockReady = true;

  const users = Array.isArray(MOCK_COMMUNITY_DATA.users) ? MOCK_COMMUNITY_DATA.users : [];
  for (const user of users) {
    const id = String(user.id || '').trim();
    if (!id) {
      continue;
    }
    mockUsers.set(id, {
      id,
      name: String(user.displayName || `user_${id}`),
      avatarUrl: String(user.avatarUrl || ''),
    });
  }

  const posts = Array.isArray(MOCK_COMMUNITY_DATA.posts) ? MOCK_COMMUNITY_DATA.posts : [];
  for (let index = 0; index < posts.length; index += 1) {
    const raw = posts[index];
    const postId = String(raw.id || `mock-post-${index + 1}`);
    const author = getOrCreateUser(String(raw.authorId || DEFAULT_USER_ID));
    const status: PostStatus = raw.status === 'draft' ? 'draft' : 'published';
    const createdAt = new Date(Date.now() - index * 60 * 60 * 1000).toISOString();
    const updatedAt = createdAt;
    const suggestions = Array.isArray(raw.styleSuggestions)
      ? raw.styleSuggestions.filter((item): item is string => typeof item === 'string')
      : [];

    const post: CommunityPost = {
      id: postId,
      author,
      status,
      title: String(raw.title || `社区样例 ${index + 1}`),
      content: composeMockContent(String(raw.content || ''), suggestions),
      beforeUrl: raw.beforeImage ? resolveMockImageUrl(postId, 'before') : '',
      afterUrl: raw.afterImage ? resolveMockImageUrl(postId, 'after') : '',
      tags: Array.isArray(raw.tags) ? raw.tags.filter((item): item is string => typeof item === 'string') : [],
      gradingParams: isObject(raw.gradingParams) ? raw.gradingParams : {},
      likesCount: 12 + index * 7,
      savesCount: 5 + index * 4,
      commentsCount: Array.isArray(raw.appComments) ? raw.appComments.length : 0,
      isLiked: false,
      isSaved: false,
      createdAt,
      updatedAt,
    };

    const comments: CommunityComment[] = Array.isArray(raw.appComments)
      ? raw.appComments.map((comment, commentIndex) => {
          const commentAuthor = getOrCreateUser(String(comment.authorId || author.id));
          const commentTime = new Date(Date.now() - (index * 10 + commentIndex) * 60 * 1000).toISOString();
          return {
            id: String(comment.id || `mock-comment-${postId}-${commentIndex + 1}`),
            postId: post.id,
            parentId: null,
            author: commentAuthor,
            content: String(comment.content || ''),
            createdAt: commentTime,
            updatedAt: commentTime,
          };
        })
      : [];

    mockCommentsByPostId.set(post.id, comments);
    if (post.status === 'draft') {
      mockDraftByUserId.set(post.author.id, post);
    } else {
      mockPublishedPosts.push(post);
    }
  }
};

const matchFilter = (post: CommunityPost, filter: FeedFilter): boolean => {
  if (filter === 'all') {
    return true;
  }
  const tags = post.tags.map(tag => tag.toLowerCase());
  if (filter === 'portrait') {
    return tags.includes('portrait') || post.tags.includes('人像');
  }
  if (filter === 'cinema') {
    return tags.includes('cinema') || post.tags.includes('电影感');
  }
  if (filter === 'vintage') {
    return tags.includes('vintage') || post.tags.includes('复古');
  }
  return true;
};

const paginate = <T>(items: T[], page = 1, size = 10): CommunityPaginationResponse<T> => {
  const safePage = Math.max(1, Math.floor(page || 1));
  const safeSize = Math.max(1, Math.floor(size || 10));
  const total = items.length;
  const offset = (safePage - 1) * safeSize;
  return {
    items: items.slice(offset, offset + safeSize),
    page: safePage,
    size: safeSize,
    total,
    hasMore: offset + safeSize < total,
  };
};

const toUserViewPost = (post: CommunityPost, userId: string): CommunityPost => {
  const likeSet = getUserPostSet(mockLikeByUserId, userId);
  const saveSet = getUserPostSet(mockSaveByUserId, userId);
  return {
    ...post,
    isLiked: likeSet.has(post.id),
    isSaved: saveSet.has(post.id),
  };
};

const mockFetchFeed = (
  filter: FeedFilter,
  page: number,
  size: number,
  userId: string,
): CommunityPaginationResponse<CommunityPost> => {
  ensureMockStore();
  const filtered = mockPublishedPosts.filter(post => matchFilter(post, filter));
  const sorted = [...filtered].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const paged = paginate(sorted, page, size);
  return {
    ...paged,
    items: paged.items.map(post => toUserViewPost(post, userId)),
  };
};

const mockFetchMyPosts = (
  status: PostStatus,
  page: number,
  size: number,
  userId: string,
): CommunityPaginationResponse<CommunityPost> => {
  ensureMockStore();
  const normalizedUserId = normalizeUserId(userId);
  let items: CommunityPost[] = [];
  if (status === 'draft') {
    const draft = mockDraftByUserId.get(normalizedUserId);
    items = draft ? [draft] : [];
  } else {
    items = mockPublishedPosts.filter(post => post.author.id === normalizedUserId);
  }
  const paged = paginate(items, page, size);
  return {
    ...paged,
    items: paged.items.map(post => toUserViewPost(post, normalizedUserId)),
  };
};

const mockCreateDraft = (payload: CommunityDraftPayload, userId: string): CommunityPost => {
  ensureMockStore();
  const normalizedUserId = normalizeUserId(userId);
  const author = getOrCreateUser(normalizedUserId);
  const draftId = `mock-draft-${normalizedUserId}-${Date.now()}`;
  const createdAt = nowIso();
  const draft: CommunityPost = {
    id: draftId,
    author,
    status: 'draft',
    title: payload.title,
    content: payload.content || '',
    beforeUrl: payload.beforeUrl || '',
    afterUrl: payload.afterUrl || '',
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    gradingParams: payload.gradingParams || {},
    likesCount: 0,
    savesCount: 0,
    commentsCount: 0,
    isLiked: false,
    isSaved: false,
    createdAt,
    updatedAt: createdAt,
  };
  mockDraftByUserId.set(normalizedUserId, draft);
  return draft;
};

const mockUpdateDraft = (
  draftId: string,
  payload: CommunityDraftPayload,
  userId: string,
): CommunityPost | null => {
  ensureMockStore();
  const normalizedUserId = normalizeUserId(userId);
  const existing = mockDraftByUserId.get(normalizedUserId);
  if (!existing || existing.id !== draftId) {
    return null;
  }
  const updated: CommunityPost = {
    ...existing,
    title: payload.title,
    content: payload.content || '',
    beforeUrl: payload.beforeUrl || '',
    afterUrl: payload.afterUrl || '',
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    gradingParams: payload.gradingParams || {},
    updatedAt: nowIso(),
  };
  mockDraftByUserId.set(normalizedUserId, updated);
  return updated;
};

const mockPublishDraft = (draftId: string, userId: string): CommunityPost | null => {
  ensureMockStore();
  const normalizedUserId = normalizeUserId(userId);
  const existing = mockDraftByUserId.get(normalizedUserId);
  if (!existing || existing.id !== draftId) {
    return null;
  }
  const published: CommunityPost = {
    ...existing,
    status: 'published',
    updatedAt: nowIso(),
  };
  mockDraftByUserId.delete(normalizedUserId);
  mockPublishedPosts = [published, ...mockPublishedPosts];
  if (!mockCommentsByPostId.has(published.id)) {
    mockCommentsByPostId.set(published.id, []);
  }
  return published;
};

const getMutablePublishedPost = (postId: string): CommunityPost | null => {
  const index = mockPublishedPosts.findIndex(post => post.id === postId);
  if (index < 0) {
    return null;
  }
  return mockPublishedPosts[index];
};

const mockToggleLike = (postId: string, liked: boolean, userId: string) => {
  ensureMockStore();
  const post = getMutablePublishedPost(postId);
  if (!post) {
    throw new Error('post_not_found');
  }
  const likeSet = getUserPostSet(mockLikeByUserId, userId);
  const hadLiked = likeSet.has(postId);
  if (liked && !hadLiked) {
    likeSet.add(postId);
    post.likesCount += 1;
  } else if (!liked && hadLiked) {
    likeSet.delete(postId);
    post.likesCount = Math.max(0, post.likesCount - 1);
  }
  post.updatedAt = nowIso();
  return {
    likesCount: post.likesCount,
    liked: likeSet.has(postId),
  };
};

const mockToggleSave = (postId: string, saved: boolean, userId: string) => {
  ensureMockStore();
  const post = getMutablePublishedPost(postId);
  if (!post) {
    throw new Error('post_not_found');
  }
  const saveSet = getUserPostSet(mockSaveByUserId, userId);
  const hadSaved = saveSet.has(postId);
  if (saved && !hadSaved) {
    saveSet.add(postId);
    post.savesCount += 1;
  } else if (!saved && hadSaved) {
    saveSet.delete(postId);
    post.savesCount = Math.max(0, post.savesCount - 1);
  }
  post.updatedAt = nowIso();
  return {
    savesCount: post.savesCount,
    saved: saveSet.has(postId),
  };
};

const mockFetchComments = (
  postId: string,
  page: number,
  size: number,
): CommunityPaginationResponse<CommunityComment> => {
  ensureMockStore();
  const comments = mockCommentsByPostId.get(postId) || [];
  return paginate(comments, page, size);
};

const mockCreateComment = (
  postId: string,
  content: string,
  parentId: string | null | undefined,
  userId: string,
): CommunityComment | null => {
  ensureMockStore();
  const post = getMutablePublishedPost(postId);
  if (!post) {
    return null;
  }
  const comments = mockCommentsByPostId.get(postId) || [];
  const normalizedParentId = parentId ? String(parentId) : null;
  if (normalizedParentId) {
    const parent = comments.find(item => item.id === normalizedParentId);
    if (!parent) {
      return null;
    }
    if (parent.parentId) {
      return null;
    }
  }
  const commentId = `mock-comment-${++mockSequence}`;
  const createdAt = nowIso();
  const comment: CommunityComment = {
    id: commentId,
    postId,
    parentId: normalizedParentId,
    author: getOrCreateUser(normalizeUserId(userId)),
    content,
    createdAt,
    updatedAt: createdAt,
  };
  comments.push(comment);
  mockCommentsByPostId.set(postId, comments);
  post.commentsCount = comments.length;
  post.updatedAt = nowIso();
  return comment;
};

const shouldUseMockFallback = (error: unknown): boolean => {
  if (!MOCK_FALLBACK_ENABLED) {
    return false;
  }
  const message = error instanceof Error ? error.message : '';
  if (!message) {
    return true;
  }
  if (message === 'unauthorized') {
    return true;
  }
  if (message.startsWith('community_http_')) {
    const code = Number(message.slice('community_http_'.length));
    if (Number.isFinite(code)) {
      return code >= 500 || code === 404;
    }
  }
  return true;
};

const withFallback = async <T>(remote: () => Promise<T>, fallback: () => Promise<T> | T): Promise<T> => {
  try {
    return await remote();
  } catch (error) {
    if (shouldUseMockFallback(error)) {
      return fallback();
    }
    throw error;
  }
};

export const COMMUNITY_USER_ID = DEFAULT_USER_ID;

export const fetchCommunityFeed = async (
  filter: FeedFilter,
  page = 1,
  size = 10,
  userId = DEFAULT_USER_ID,
): Promise<CommunityPaginationResponse<CommunityPost>> => {
  return withFallback(
    async () => {
      const query = `?filter=${encodeURIComponent(filter)}&page=${page}&size=${size}`;
      const response = await requestCommunity(`/v1/community/feed${query}`, {method: 'GET'}, userId);
      return parsePagination(response, parsePost);
    },
    async () => mockFetchFeed(filter, page, size, userId),
  );
};

export const fetchMyCommunityPosts = async (
  status: PostStatus,
  page = 1,
  size = 10,
  userId = DEFAULT_USER_ID,
): Promise<CommunityPaginationResponse<CommunityPost>> => {
  return withFallback(
    async () => {
      const query = `?status=${status}&page=${page}&size=${size}`;
      const response = await requestCommunity(`/v1/community/me/posts${query}`, {method: 'GET'}, userId);
      return parsePagination(response, parsePost);
    },
    async () => mockFetchMyPosts(status, page, size, userId),
  );
};

export const createCommunityDraft = async (
  payload: CommunityDraftPayload,
  userId = DEFAULT_USER_ID,
): Promise<CommunityPost | null> => {
  return withFallback(
    async () => {
      const response = await requestCommunity(
        '/v1/community/drafts',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        userId,
      );
      if (!isObject(response) || !('item' in response)) {
        return null;
      }
      return parsePost(response.item);
    },
    async () => mockCreateDraft(payload, userId),
  );
};

export const updateCommunityDraft = async (
  draftId: string,
  payload: CommunityDraftPayload,
  userId = DEFAULT_USER_ID,
): Promise<CommunityPost | null> => {
  return withFallback(
    async () => {
      const response = await requestCommunity(
        `/v1/community/drafts/${draftId}`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        },
        userId,
      );
      if (!isObject(response) || !('item' in response)) {
        return null;
      }
      return parsePost(response.item);
    },
    async () => mockUpdateDraft(draftId, payload, userId),
  );
};

export const publishCommunityDraft = async (
  draftId: string,
  userId = DEFAULT_USER_ID,
): Promise<CommunityPost | null> => {
  return withFallback(
    async () => {
      const response = await requestCommunity(
        `/v1/community/drafts/${draftId}/publish`,
        {method: 'POST', body: JSON.stringify({})},
        userId,
      );
      if (!isObject(response) || !('item' in response)) {
        return null;
      }
      return parsePost(response.item);
    },
    async () => mockPublishDraft(draftId, userId),
  );
};

export const toggleCommunityLike = async (
  postId: string,
  liked: boolean,
  userId = DEFAULT_USER_ID,
): Promise<{likesCount: number; liked: boolean}> => {
  return withFallback(
    async () => {
      const response = await requestCommunity(
        `/v1/community/posts/${postId}/like`,
        {method: 'POST', body: JSON.stringify({liked})},
        userId,
      );
      return {
        likesCount: isObject(response) ? Number(response.likesCount || 0) : 0,
        liked: isObject(response) ? Boolean(response.liked) : liked,
      };
    },
    async () => mockToggleLike(postId, liked, userId),
  );
};

export const toggleCommunitySave = async (
  postId: string,
  saved: boolean,
  userId = DEFAULT_USER_ID,
): Promise<{savesCount: number; saved: boolean}> => {
  return withFallback(
    async () => {
      const response = await requestCommunity(
        `/v1/community/posts/${postId}/save`,
        {method: 'POST', body: JSON.stringify({saved})},
        userId,
      );
      return {
        savesCount: isObject(response) ? Number(response.savesCount || 0) : 0,
        saved: isObject(response) ? Boolean(response.saved) : saved,
      };
    },
    async () => mockToggleSave(postId, saved, userId),
  );
};

export const fetchCommunityComments = async (
  postId: string,
  page = 1,
  size = 20,
  userId = DEFAULT_USER_ID,
): Promise<CommunityPaginationResponse<CommunityComment>> => {
  return withFallback(
    async () => {
      const response = await requestCommunity(
        `/v1/community/posts/${postId}/comments?page=${page}&size=${size}`,
        {method: 'GET'},
        userId,
      );
      return parsePagination(response, parseComment);
    },
    async () => mockFetchComments(postId, page, size),
  );
};

export const createCommunityComment = async (
  postId: string,
  content: string,
  parentId?: string | null,
  userId = DEFAULT_USER_ID,
): Promise<CommunityComment | null> => {
  return withFallback(
    async () => {
      const response = await requestCommunity(
        `/v1/community/posts/${postId}/comments`,
        {
          method: 'POST',
          body: JSON.stringify({
            content,
            parentId: parentId || null,
          }),
        },
        userId,
      );
      if (!isObject(response) || !('item' in response)) {
        return null;
      }
      return parseComment(response.item);
    },
    async () => mockCreateComment(postId, content, parentId, userId),
  );
};
