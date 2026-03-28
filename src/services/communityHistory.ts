import AsyncStorage from '@react-native-async-storage/async-storage';
import type {CommunityHistoryPost, CommunityPost} from '../modules/api';

const COMMUNITY_HISTORY_KEY = 'visiongenie.community.history';
const MAX_HISTORY_ITEMS = 12;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizeHistoryItem = (value: unknown): CommunityHistoryPost | null => {
  if (!isObject(value) || !isObject(value.author)) {
    return null;
  }
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
    tags: Array.isArray(value.tags)
      ? value.tags.map(item => String(item || '')).filter(Boolean)
      : [],
    gradingParams: isObject(value.gradingParams) ? value.gradingParams : {},
    likesCount: Number(value.likesCount || 0),
    savesCount: Number(value.savesCount || 0),
    commentsCount: Number(value.commentsCount || 0),
    isLiked: Boolean(value.isLiked),
    isSaved: Boolean(value.isSaved),
    createdAt: String(value.createdAt || ''),
    updatedAt: String(value.updatedAt || ''),
    viewedAt: String(value.viewedAt || ''),
  };
};

const readHistory = async (): Promise<CommunityHistoryPost[]> => {
  const raw = await AsyncStorage.getItem(COMMUNITY_HISTORY_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeHistoryItem).filter(Boolean) as CommunityHistoryPost[];
  } catch {
    return [];
  }
};

const writeHistory = async (items: CommunityHistoryPost[]): Promise<void> => {
  await AsyncStorage.setItem(COMMUNITY_HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY_ITEMS)));
};

export const listCommunityHistory = async (): Promise<CommunityHistoryPost[]> => readHistory();

export const recordCommunityHistory = async (post: CommunityPost): Promise<void> => {
  const existing = await readHistory();
  const nextItem: CommunityHistoryPost = {
    ...post,
    viewedAt: new Date().toISOString(),
  };
  const deduped = existing.filter(item => item.id !== post.id);
  await writeHistory([nextItem, ...deduped]);
};
