export type CommunityFeedSort = 'recommended' | 'latest' | 'hot';
export type FeedSort = CommunityFeedSort;

export type CommunityUser = {
  id: string;
  name: string;
  avatarText: string;
  bio?: string;
};

export type CommunityImageAsset = {
  id: string;
  url: string;
  alt: string;
};

export type CommunityReactionState = {
  liked: boolean;
  favorited: boolean;
  canDelete?: boolean;
};

export type ReactionState = CommunityReactionState;

export type CommunityPostStats = {
  likeCount: number;
  commentCount: number;
  favoriteCount: number;
};

export type CommunityStats = CommunityPostStats;

export type CommunityPostSummary = {
  id: string;
  author: CommunityUser;
  publishedAt: string;
  title: string;
  summary: string;
  images: CommunityImageAsset[];
  stats: CommunityPostStats;
  viewerContext: CommunityReactionState;
};

export type PostSummary = CommunityPostSummary;

export type CommunityPostDetail = CommunityPostSummary & {
  content: string;
};

export type PostDetail = CommunityPostDetail;

export type CommunityComment = {
  id: string;
  postId: string;
  author: CommunityUser;
  content: string;
  publishedAt: string;
};

export type CommentItem = CommunityComment;

export type PaginatedResponse<T> = {
  items: T[];
  nextCursor: string | null;
};

export type CommunityPaginatedResponse<T> = PaginatedResponse<T>;

export type UploadImageResult = {
  id: string;
  url: string;
};

export type LocalCreateCommentInput = {
  postId: string;
  content: string;
};

export type LocalCreatePostInput = {
  title: string;
  content: string;
  imageUrl?: string;
};
