import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import {VISION_THEME} from '../theme/visionTheme';
import {TopSegment} from '../components/ui/TopSegment';
import {AdvancedImageCard} from '../components/media/AdvancedImageCard';
import type {ColorGradingParams} from '../types/colorGrading';
import {defaultColorGradingParams} from '../types/colorGrading';
import {
  COMMUNITY_USER_ID,
  type CommunityComment,
  type CommunityPost,
  type FeedFilter,
  createCommunityComment,
  createCommunityDraft,
  fetchCommunityComments,
  fetchCommunityFeed,
  fetchMyCommunityPosts,
  publishCommunityDraft,
  toggleCommunityLike,
  toggleCommunitySave,
  updateCommunityDraft,
} from '../community/api';
import {useCommunityFeedQuery} from '../hooks/queries/useCommunityFeedQuery';

interface AgentActionResult {
  ok: boolean;
  message: string;
}

interface AgentDraftPayload {
  title?: string;
  tags?: string[];
  description?: string;
}

export interface CommunityAgentBridge {
  createDraft: (draft: AgentDraftPayload) => Promise<AgentActionResult>;
  publishDraft: () => Promise<AgentActionResult>;
  setFilter: (filter: FeedFilter) => Promise<AgentActionResult>;
  getSnapshot: () => {
    filter: FeedFilter;
    hasDraft: boolean;
    draftTitle: string;
  };
}

interface CommunityScreenProps {
  onAgentBridgeReady?: (bridge: CommunityAgentBridge | null) => void;
  onReuseGradingParams?: (params: ColorGradingParams) => void;
}

interface CommentThread {
  root: CommunityComment;
  replies: CommunityComment[];
}

const FILTERS: Array<{key: FeedFilter; label: string}> = [
  {key: 'all', label: '全部'},
  {key: 'portrait', label: '人像'},
  {key: 'cinema', label: '电影感'},
  {key: 'vintage', label: '复古'},
];

const mergeColorGradingParams = (
  partial: Partial<ColorGradingParams> | undefined,
): ColorGradingParams => {
  const source = partial || {};
  return {
    basic: {...defaultColorGradingParams.basic, ...(source.basic || {})},
    colorBalance: {
      ...defaultColorGradingParams.colorBalance,
      ...(source.colorBalance || {}),
    },
    pro: {
      curves: {
        ...defaultColorGradingParams.pro.curves,
        ...(source.pro?.curves || {}),
      },
      wheels: {
        ...defaultColorGradingParams.pro.wheels,
        ...(source.pro?.wheels || {}),
      },
    },
  };
};

const toThreads = (comments: CommunityComment[]): CommentThread[] => {
  const topLevel = comments.filter(comment => !comment.parentId);
  return topLevel.map(root => ({
    root,
    replies: comments.filter(reply => reply.parentId === root.id),
  }));
};

export const CommunityScreen: React.FC<CommunityScreenProps> = ({
  onAgentBridgeReady,
  onReuseGradingParams,
}) => {
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [draftPost, setDraftPost] = useState<CommunityPost | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftTags, setDraftTags] = useState('');
  const [draftSubmitting, setDraftSubmitting] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');

  const [expandedCommentPosts, setExpandedCommentPosts] = useState<Record<string, boolean>>({});
  const [commentsByPostId, setCommentsByPostId] = useState<Record<string, CommunityComment[]>>({});
  const [loadingCommentsByPostId, setLoadingCommentsByPostId] = useState<Record<string, boolean>>({});
  const [commentInputByPostId, setCommentInputByPostId] = useState<Record<string, string>>({});
  const [replyTargetByPostId, setReplyTargetByPostId] = useState<Record<string, string | null>>({});
  const [sendingCommentByPostId, setSendingCommentByPostId] = useState<Record<string, boolean>>({});
  const feedQuery = useCommunityFeedQuery(filter);

  const parseDraftTags = useCallback(
    () =>
      draftTags
        .split(/[,\s]+/)
        .map(item => item.trim())
        .filter(Boolean)
        .slice(0, 12),
    [draftTags],
  );

  const loadFeed = useCallback(
    async (nextFilter: FeedFilter, nextPage = 1, append = false) => {
      if (!append) {
        setLoading(true);
      }
      setErrorMessage('');
      try {
        const response = await fetchCommunityFeed(nextFilter, nextPage, 10, COMMUNITY_USER_ID);
        setPosts(prev => (append ? [...prev, ...response.items] : response.items));
        setPage(response.page);
        setHasMore(response.hasMore);
      } catch (error) {
        const message = error instanceof Error ? error.message : '社区加载失败';
        setErrorMessage(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  const loadMyDraft = useCallback(async () => {
    try {
      const response = await fetchMyCommunityPosts('draft', 1, 1, COMMUNITY_USER_ID);
      const first = response.items[0] || null;
      setDraftPost(first);
      setDraftTitle(first?.title || '');
      setDraftContent(first?.content || '');
      setDraftTags(first?.tags.join(' ') || '');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (feedQuery.data) {
      setPosts(feedQuery.data.items);
      setPage(feedQuery.data.page);
      setHasMore(feedQuery.data.hasMore);
      setLoading(false);
      setRefreshing(false);
    }
    if (feedQuery.error) {
      const message = feedQuery.error instanceof Error ? feedQuery.error.message : '社区加载失败';
      setErrorMessage(message);
    }
  }, [feedQuery.data, feedQuery.error]);

  useEffect(() => {
    loadFeed(filter, 1, false).catch(() => undefined);
    loadMyDraft().catch(() => undefined);
  }, [filter, loadFeed, loadMyDraft]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadFeed(filter, 1, false), loadMyDraft()]);
  }, [filter, loadFeed, loadMyDraft]);

  const submitDraft = useCallback(
    async (payload?: AgentDraftPayload): Promise<AgentActionResult> => {
      setDraftSubmitting(true);
      setDraftMessage('');

      const nextTitle = (payload?.title || draftTitle).trim();
      const nextContent = (payload?.description || draftContent).trim();
      const nextTags =
        Array.isArray(payload?.tags) && payload?.tags.length > 0 ? payload.tags : parseDraftTags();

      if (!nextTitle) {
        setDraftSubmitting(false);
        return {ok: false, message: '草稿标题不能为空'};
      }

      try {
        const basePayload = {
          title: nextTitle,
          content: nextContent,
          tags: nextTags,
          gradingParams: draftPost?.gradingParams || undefined,
          beforeUrl: draftPost?.beforeUrl || '',
          afterUrl: draftPost?.afterUrl || '',
        };

        const saved = draftPost
          ? await updateCommunityDraft(draftPost.id, basePayload, COMMUNITY_USER_ID)
          : await createCommunityDraft(basePayload, COMMUNITY_USER_ID);

        if (!saved) {
          setDraftMessage('草稿保存失败');
          return {ok: false, message: '草稿保存失败'};
        }

        setDraftPost(saved);
        setDraftTitle(saved.title);
        setDraftContent(saved.content);
        setDraftTags(saved.tags.join(' '));
        setDraftMessage('草稿已保存');
        return {ok: true, message: '草稿已保存'};
      } catch (error) {
        const message = error instanceof Error ? error.message : '草稿保存失败';
        setDraftMessage(message);
        return {ok: false, message};
      } finally {
        setDraftSubmitting(false);
      }
    },
    [draftContent, draftPost, draftTitle, parseDraftTags],
  );

  const publishDraft = useCallback(async (): Promise<AgentActionResult> => {
    if (!draftPost) {
      return {ok: false, message: '当前没有可发布草稿'};
    }
    setDraftSubmitting(true);
    try {
      const published = await publishCommunityDraft(draftPost.id, COMMUNITY_USER_ID);
      if (!published) {
        return {ok: false, message: '草稿发布失败'};
      }
      setDraftPost(null);
      setDraftTitle('');
      setDraftContent('');
      setDraftTags('');
      setDraftMessage('已发布到社区');
      await loadFeed(filter, 1, false);
      return {ok: true, message: '已发布到社区'};
    } catch (error) {
      const message = error instanceof Error ? error.message : '草稿发布失败';
      setDraftMessage(message);
      return {ok: false, message};
    } finally {
      setDraftSubmitting(false);
    }
  }, [draftPost, filter, loadFeed]);

  const handleLike = useCallback(async (post: CommunityPost) => {
    const nextLiked = !post.isLiked;
    setPosts(prev =>
      prev.map(item =>
        item.id === post.id
          ? {
              ...item,
              isLiked: nextLiked,
              likesCount: Math.max(0, item.likesCount + (nextLiked ? 1 : -1)),
            }
          : item,
      ),
    );
    try {
      const result = await toggleCommunityLike(post.id, nextLiked, COMMUNITY_USER_ID);
      setPosts(prev =>
        prev.map(item =>
          item.id === post.id
            ? {...item, isLiked: result.liked, likesCount: result.likesCount}
            : item,
        ),
      );
    } catch (error) {
      setPosts(prev =>
        prev.map(item => (item.id === post.id ? post : item)),
      );
      if (error instanceof Error && error.message === 'unauthorized') {
        setErrorMessage('unauthorized');
      }
    }
  }, []);

  const handleSave = useCallback(async (post: CommunityPost) => {
    const nextSaved = !post.isSaved;
    setPosts(prev =>
      prev.map(item =>
        item.id === post.id
          ? {
              ...item,
              isSaved: nextSaved,
              savesCount: Math.max(0, item.savesCount + (nextSaved ? 1 : -1)),
            }
          : item,
      ),
    );
    try {
      const result = await toggleCommunitySave(post.id, nextSaved, COMMUNITY_USER_ID);
      setPosts(prev =>
        prev.map(item =>
          item.id === post.id
            ? {...item, isSaved: result.saved, savesCount: result.savesCount}
            : item,
        ),
      );
    } catch (error) {
      setPosts(prev =>
        prev.map(item => (item.id === post.id ? post : item)),
      );
      if (error instanceof Error && error.message === 'unauthorized') {
        setErrorMessage('unauthorized');
      }
    }
  }, []);

  const toggleComments = useCallback(async (postId: string) => {
    const nextOpen = !expandedCommentPosts[postId];
    setExpandedCommentPosts(prev => ({...prev, [postId]: nextOpen}));
    if (!nextOpen || commentsByPostId[postId]) {
      return;
    }
    setLoadingCommentsByPostId(prev => ({...prev, [postId]: true}));
    try {
      const response = await fetchCommunityComments(postId, 1, 50, COMMUNITY_USER_ID);
      setCommentsByPostId(prev => ({...prev, [postId]: response.items}));
    } catch {
      setCommentsByPostId(prev => ({...prev, [postId]: []}));
    } finally {
      setLoadingCommentsByPostId(prev => ({...prev, [postId]: false}));
    }
  }, [commentsByPostId, expandedCommentPosts]);

  const sendComment = useCallback(
    async (post: CommunityPost) => {
      const text = (commentInputByPostId[post.id] || '').trim();
      if (!text) {
        return;
      }
      const parentId = replyTargetByPostId[post.id];
      setSendingCommentByPostId(prev => ({...prev, [post.id]: true}));
      try {
        const created = await createCommunityComment(post.id, text, parentId, COMMUNITY_USER_ID);
        if (created) {
          setCommentsByPostId(prev => {
            const existing = prev[post.id] || [];
            return {...prev, [post.id]: [...existing, created]};
          });
          setPosts(prev =>
            prev.map(item =>
              item.id === post.id
                ? {...item, commentsCount: item.commentsCount + 1}
                : item,
            ),
          );
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'unauthorized') {
          setErrorMessage('unauthorized');
        }
      } finally {
        setCommentInputByPostId(prev => ({...prev, [post.id]: ''}));
        setReplyTargetByPostId(prev => ({...prev, [post.id]: null}));
        setSendingCommentByPostId(prev => ({...prev, [post.id]: false}));
      }
    },
    [commentInputByPostId, replyTargetByPostId],
  );

  const handleReuseParams = useCallback(
    (post: CommunityPost) => {
      if (!onReuseGradingParams) {
        return;
      }
      const merged = mergeColorGradingParams(post.gradingParams || {});
      onReuseGradingParams(merged);
    },
    [onReuseGradingParams],
  );

  useEffect(() => {
    if (!onAgentBridgeReady) {
      return;
    }
    onAgentBridgeReady({
      createDraft: submitDraft,
      publishDraft,
      setFilter: async nextFilter => {
        setFilter(nextFilter);
        return {ok: true, message: `已切换筛选: ${nextFilter}`};
      },
      getSnapshot: () => ({
        filter,
        hasDraft: Boolean(draftPost),
        draftTitle: draftTitle.trim(),
      }),
    });
    return () => onAgentBridgeReady(null);
  }, [draftPost, draftTitle, filter, onAgentBridgeReady, publishDraft, submitDraft]);

  const draftTagCount = useMemo(() => parseDraftTags().length, [parseDraftTags]);

  return (
    <LinearGradient
      colors={[
        VISION_THEME.background.top,
        VISION_THEME.background.mid,
        VISION_THEME.background.bottom,
      ]}
      style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <View style={styles.heroCard}>
          <View>
            <Text style={styles.heroTitle}>调色社区</Text>
            <Text style={styles.heroSubtitle}>真实社区流 | 草稿发布 | 评论互动</Text>
          </View>
          <TouchableOpacity
            style={styles.publishButton}
            activeOpacity={0.86}
            onPress={() => {
              publishDraft().catch(() => undefined);
            }}
            disabled={draftSubmitting}>
            <Icon name="cloud-upload-outline" size={16} color={VISION_THEME.accent.dark} />
            <Text style={styles.publishButtonText}>发布草稿</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>发布草稿</Text>
          <TextInput
            value={draftTitle}
            onChangeText={setDraftTitle}
            placeholder="标题（必填）"
            placeholderTextColor={VISION_THEME.text.muted}
            style={styles.input}
          />
          <TextInput
            value={draftContent}
            onChangeText={setDraftContent}
            placeholder="内容描述（选填）"
            placeholderTextColor={VISION_THEME.text.muted}
            style={[styles.input, styles.textArea]}
            multiline
          />
          <TextInput
            value={draftTags}
            onChangeText={setDraftTags}
            placeholder="标签，空格或逗号分隔（如 人像 电影感）"
            placeholderTextColor={VISION_THEME.text.muted}
            style={styles.input}
          />
          <View style={styles.draftActionRow}>
            <Text style={styles.draftMeta}>
              当前用户: {COMMUNITY_USER_ID} | 标签数: {draftTagCount}
            </Text>
            <TouchableOpacity
              style={styles.secondaryButton}
              activeOpacity={0.86}
              onPress={() => {
                submitDraft().catch(() => undefined);
              }}
              disabled={draftSubmitting}>
              {draftSubmitting ? (
                <ActivityIndicator size="small" color={VISION_THEME.accent.main} />
              ) : (
                <Text style={styles.secondaryButtonText}>保存草稿</Text>
              )}
            </TouchableOpacity>
          </View>
          {draftMessage ? <Text style={styles.draftMessage}>{draftMessage}</Text> : null}
        </View>

        <TopSegment
          value={filter}
          onValueChange={value => setFilter(value as FeedFilter)}
          items={FILTERS.map(item => ({value: item.key, label: item.label}))}
        />

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color={VISION_THEME.accent.main} />
            <Text style={styles.loadingText}>社区流加载中...</Text>
          </View>
        ) : null}

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <View style={styles.feed}>
          {posts.map(post => {
            const comments = commentsByPostId[post.id] || [];
            const threads = toThreads(comments);
            const isCommentsOpen = Boolean(expandedCommentPosts[post.id]);
            const replyTarget = replyTargetByPostId[post.id];
            return (
              <View key={post.id} style={styles.postCard}>
                <View style={styles.postHeader}>
                  <View>
                    <Text style={styles.author}>{post.author.name}</Text>
                    <Text style={styles.title}>{post.title}</Text>
                  </View>
                  <Text style={styles.createdAt}>{post.createdAt.slice(0, 10)}</Text>
                </View>

                <Text style={styles.contentText}>{post.content || '暂无详细描述'}</Text>

                <View style={styles.previewRow}>
                  <AdvancedImageCard
                    source={post.beforeUrl ? {uri: post.beforeUrl} : undefined}
                    style={styles.previewBefore}
                    label="Before"
                    preset="clean"
                  />
                  <AdvancedImageCard
                    source={post.afterUrl ? {uri: post.afterUrl} : undefined}
                    style={styles.previewAfter}
                    label="After"
                    preset="vivid"
                  />
                </View>

                <View style={styles.tagRow}>
                  {post.tags.map(tag => (
                    <View key={`${post.id}_${tag}`} style={styles.tagPill}>
                      <Text style={styles.tagText}>#{tag}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.metricRow}>
                  <TouchableOpacity
                    style={styles.metricButton}
                    onPress={() => {
                      handleLike(post).catch(() => undefined);
                    }}>
                    <Icon
                      name={post.isLiked ? 'heart' : 'heart-outline'}
                      size={14}
                      color={post.isLiked ? '#ff7f98' : VISION_THEME.text.secondary}
                    />
                    <Text style={styles.metricText}>{post.likesCount}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.metricButton}
                    onPress={() => {
                      handleSave(post).catch(() => undefined);
                    }}>
                    <Icon
                      name={post.isSaved ? 'bookmark' : 'bookmark-outline'}
                      size={14}
                      color={post.isSaved ? '#f9cf7e' : VISION_THEME.text.secondary}
                    />
                    <Text style={styles.metricText}>{post.savesCount}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.metricButton}
                    onPress={() => {
                      toggleComments(post.id).catch(() => undefined);
                    }}>
                    <Icon name="chatbubble-ellipses-outline" size={14} color={VISION_THEME.text.secondary} />
                    <Text style={styles.metricText}>{post.commentsCount}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.metricAction}
                    activeOpacity={0.85}
                    onPress={() => handleReuseParams(post)}>
                    <Icon name="share-social-outline" size={14} color={VISION_THEME.accent.main} />
                    <Text style={styles.metricActionText}>复用参数</Text>
                  </TouchableOpacity>
                </View>

                {isCommentsOpen ? (
                  <View style={styles.commentPanel}>
                    {loadingCommentsByPostId[post.id] ? (
                      <ActivityIndicator size="small" color={VISION_THEME.accent.main} />
                    ) : (
                      threads.map(thread => (
                        <View key={thread.root.id} style={styles.commentBlock}>
                          <Text style={styles.commentAuthor}>
                            {thread.root.author.name}: {thread.root.content}
                          </Text>
                          <TouchableOpacity
                            onPress={() =>
                              setReplyTargetByPostId(prev => ({...prev, [post.id]: thread.root.id}))
                            }>
                            <Text style={styles.replyAction}>回复</Text>
                          </TouchableOpacity>
                          {thread.replies.map(reply => (
                            <Text key={reply.id} style={styles.replyText}>
                              ↳ {reply.author.name}: {reply.content}
                            </Text>
                          ))}
                        </View>
                      ))
                    )}
                    <View style={styles.commentInputRow}>
                      <TextInput
                        value={commentInputByPostId[post.id] || ''}
                        onChangeText={text =>
                          setCommentInputByPostId(prev => ({...prev, [post.id]: text}))
                        }
                        placeholder={
                          replyTarget ? `回复评论 ${replyTarget}` : '写下你的评论...'
                        }
                        placeholderTextColor={VISION_THEME.text.muted}
                        style={styles.commentInput}
                      />
                      <TouchableOpacity
                        style={styles.commentSendButton}
                        disabled={sendingCommentByPostId[post.id]}
                        onPress={() => {
                          sendComment(post).catch(() => undefined);
                        }}>
                        <Icon name="send" size={14} color={VISION_THEME.accent.dark} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {hasMore ? (
          <TouchableOpacity
            style={styles.loadMoreButton}
            onPress={() => {
              loadFeed(filter, page + 1, true).catch(() => undefined);
            }}>
            <Text style={styles.loadMoreText}>加载更多</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1},
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
  },
  heroCard: {
    borderRadius: 16,
    backgroundColor: VISION_THEME.surface.base,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  heroTitle: {
    color: VISION_THEME.text.primary,
    fontSize: 21,
    fontWeight: '700',
  },
  heroSubtitle: {
    marginTop: 4,
    color: VISION_THEME.text.secondary,
    fontSize: 12,
  },
  publishButton: {
    borderRadius: 12,
    backgroundColor: VISION_THEME.accent.strong,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  publishButtonText: {
    color: VISION_THEME.accent.dark,
    fontSize: 12,
    fontWeight: '800',
  },
  block: {
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: VISION_THEME.surface.card,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    padding: 11,
    gap: 8,
  },
  blockTitle: {
    color: VISION_THEME.text.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    color: VISION_THEME.text.primary,
    backgroundColor: 'rgba(11, 43, 68, 0.8)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
  },
  textArea: {
    minHeight: 78,
    textAlignVertical: 'top',
  },
  draftActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  draftMeta: {
    color: VISION_THEME.text.muted,
    fontSize: 11,
    flex: 1,
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(10, 37, 58, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: VISION_THEME.accent.main,
    fontSize: 12,
    fontWeight: '700',
  },
  draftMessage: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 10,
  },
  filterChip: {
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(11, 43, 68, 0.8)',
  },
  filterChipActive: {
    borderColor: VISION_THEME.border.strong,
    backgroundColor: VISION_THEME.surface.active,
  },
  filterChipText: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: VISION_THEME.accent.strong,
  },
  loadingCard: {
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(10, 37, 58, 0.75)',
  },
  loadingText: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
  },
  errorText: {
    color: '#ffb8b8',
    fontSize: 12,
    marginBottom: 8,
  },
  feed: {
    gap: 10,
  },
  postCard: {
    borderRadius: 14,
    backgroundColor: VISION_THEME.surface.card,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    padding: 11,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  author: {
    color: VISION_THEME.text.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    marginTop: 3,
    color: VISION_THEME.text.primary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  createdAt: {
    color: VISION_THEME.text.muted,
    fontSize: 10,
  },
  contentText: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 8,
  },
  previewBefore: {
    flex: 1,
    borderRadius: 11,
    minHeight: 80,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(34, 58, 79, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewAfter: {
    flex: 1,
    borderRadius: 11,
    minHeight: 80,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(17, 78, 122, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewLabel: {
    color: VISION_THEME.text.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  tagRow: {
    marginTop: 9,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagPill: {
    borderRadius: 10,
    backgroundColor: 'rgba(122, 201, 255, 0.14)',
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagText: {
    color: VISION_THEME.accent.strong,
    fontSize: 11,
    fontWeight: '600',
  },
  metricRow: {
    marginTop: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricText: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  metricAction: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(14, 55, 84, 0.86)',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  metricActionText: {
    color: VISION_THEME.accent.main,
    fontSize: 11,
    fontWeight: '700',
  },
  commentPanel: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 8,
    gap: 8,
  },
  commentBlock: {
    backgroundColor: 'rgba(10, 37, 58, 0.6)',
    borderRadius: 8,
    padding: 7,
  },
  commentAuthor: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
    lineHeight: 17,
  },
  replyAction: {
    color: VISION_THEME.accent.main,
    fontSize: 11,
    marginTop: 4,
    fontWeight: '700',
  },
  replyText: {
    marginTop: 4,
    color: VISION_THEME.text.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  commentInput: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    color: VISION_THEME.text.primary,
    backgroundColor: 'rgba(11, 43, 68, 0.8)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
  },
  commentSendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: VISION_THEME.accent.strong,
  },
  loadMoreButton: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(10, 37, 58, 0.75)',
    alignItems: 'center',
    paddingVertical: 9,
  },
  loadMoreText: {
    color: VISION_THEME.accent.main,
    fontSize: 12,
    fontWeight: '700',
  },
});
