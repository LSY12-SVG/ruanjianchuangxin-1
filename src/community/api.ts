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

const DEFAULT_BASE_URL = 'http://127.0.0.1:8787';
const DEFAULT_USER_ID = 'lsy-local-user';

const isIpv4Host = (hostname: string): boolean =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);

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

export const COMMUNITY_USER_ID = DEFAULT_USER_ID;

export const fetchCommunityFeed = async (
  filter: FeedFilter,
  page = 1,
  size = 10,
  userId = DEFAULT_USER_ID,
): Promise<CommunityPaginationResponse<CommunityPost>> => {
  const query = `?filter=${encodeURIComponent(filter)}&page=${page}&size=${size}`;
  const response = await requestCommunity(`/v1/community/feed${query}`, {method: 'GET'}, userId);
  return parsePagination(response, parsePost);
};

export const fetchMyCommunityPosts = async (
  status: PostStatus,
  page = 1,
  size = 10,
  userId = DEFAULT_USER_ID,
): Promise<CommunityPaginationResponse<CommunityPost>> => {
  const query = `?status=${status}&page=${page}&size=${size}`;
  const response = await requestCommunity(
    `/v1/community/me/posts${query}`,
    {method: 'GET'},
    userId,
  );
  return parsePagination(response, parsePost);
};

export const createCommunityDraft = async (
  payload: CommunityDraftPayload,
  userId = DEFAULT_USER_ID,
): Promise<CommunityPost | null> => {
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
};

export const updateCommunityDraft = async (
  draftId: string,
  payload: CommunityDraftPayload,
  userId = DEFAULT_USER_ID,
): Promise<CommunityPost | null> => {
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
};

export const publishCommunityDraft = async (
  draftId: string,
  userId = DEFAULT_USER_ID,
): Promise<CommunityPost | null> => {
  const response = await requestCommunity(
    `/v1/community/drafts/${draftId}/publish`,
    {method: 'POST', body: JSON.stringify({})},
    userId,
  );
  if (!isObject(response) || !('item' in response)) {
    return null;
  }
  return parsePost(response.item);
};

export const toggleCommunityLike = async (
  postId: string,
  liked: boolean,
  userId = DEFAULT_USER_ID,
): Promise<{likesCount: number; liked: boolean}> => {
  const response = await requestCommunity(
    `/v1/community/posts/${postId}/like`,
    {method: 'POST', body: JSON.stringify({liked})},
    userId,
  );
  return {
    likesCount: isObject(response) ? Number(response.likesCount || 0) : 0,
    liked: isObject(response) ? Boolean(response.liked) : liked,
  };
};

export const toggleCommunitySave = async (
  postId: string,
  saved: boolean,
  userId = DEFAULT_USER_ID,
): Promise<{savesCount: number; saved: boolean}> => {
  const response = await requestCommunity(
    `/v1/community/posts/${postId}/save`,
    {method: 'POST', body: JSON.stringify({saved})},
    userId,
  );
  return {
    savesCount: isObject(response) ? Number(response.savesCount || 0) : 0,
    saved: isObject(response) ? Boolean(response.saved) : saved,
  };
};

export const fetchCommunityComments = async (
  postId: string,
  page = 1,
  size = 20,
  userId = DEFAULT_USER_ID,
): Promise<CommunityPaginationResponse<CommunityComment>> => {
  const response = await requestCommunity(
    `/v1/community/posts/${postId}/comments?page=${page}&size=${size}`,
    {method: 'GET'},
    userId,
  );
  return parsePagination(response, parseComment);
};

export const createCommunityComment = async (
  postId: string,
  content: string,
  parentId?: string | null,
  userId = DEFAULT_USER_ID,
): Promise<CommunityComment | null> => {
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
};
