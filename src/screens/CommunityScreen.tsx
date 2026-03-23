import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  communityApi,
  formatApiErrorMessage,
  type CommunityComment,
  type CommunityPost,
  type ModuleCapabilityItem,
} from '../modules/api';
import {PageHero} from '../components/app/PageHero';
import {HERO_COMMUNITY} from '../assets/design';
import {canvasText, canvasUi, cardSurfaceWarm, glassShadow} from '../theme/canvasDesign';

type CommunityView = 'feed' | 'draft' | 'detail';
type CommunityFilter = 'all' | 'portrait' | 'cinema' | 'vintage';

const FILTERS: Array<{key: CommunityFilter; label: string}> = [
  {key: 'all', label: '全部'},
  {key: 'portrait', label: '人像'},
  {key: 'cinema', label: '电影感'},
  {key: 'vintage', label: '复古'},
];

const parseTags = (raw: string): string[] =>
  raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 12);

interface CommunityScreenProps {
  capabilities: ModuleCapabilityItem[];
}

export const CommunityScreen: React.FC<CommunityScreenProps> = ({capabilities}) => {
  const communityCapability = capabilities.find(item => item.module === 'community');

  const [view, setView] = useState<CommunityView>('feed');
  const [filter, setFilter] = useState<CommunityFilter>('all');
  const [feed, setFeed] = useState<CommunityPost[]>([]);
  const [feedPage, setFeedPage] = useState(1);
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [submittingDraft, setSubmittingDraft] = useState(false);
  const [publishingDraft, setPublishingDraft] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [myDrafts, setMyDrafts] = useState<CommunityPost[]>([]);
  const [editingDraftId, setEditingDraftId] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftTagsInput, setDraftTagsInput] = useState('');
  const [draftBeforeUrl, setDraftBeforeUrl] = useState('');
  const [draftAfterUrl, setDraftAfterUrl] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const applyPostPatch = useCallback(
    (postId: string, patch: Partial<CommunityPost>) => {
      setFeed(prev =>
        prev.map(item => (item.id === postId ? {...item, ...patch} : item)),
      );
      setMyDrafts(prev =>
        prev.map(item => (item.id === postId ? {...item, ...patch} : item)),
      );
      setSelectedPost(prev =>
        prev && prev.id === postId ? {...prev, ...patch} : prev,
      );
    },
    [],
  );

  const resetDraftForm = useCallback(() => {
    setEditingDraftId('');
    setDraftTitle('');
    setDraftContent('');
    setDraftTagsInput('');
    setDraftBeforeUrl('');
    setDraftAfterUrl('');
  }, []);

  const fillDraftForm = useCallback((post: CommunityPost) => {
    setEditingDraftId(post.id);
    setDraftTitle(post.title);
    setDraftContent(post.content);
    setDraftTagsInput((post.tags || []).join(','));
    setDraftBeforeUrl(post.beforeUrl || '');
    setDraftAfterUrl(post.afterUrl || '');
  }, []);

  const loadFeed = useCallback(
    async (page: number, append: boolean) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoadingFeed(true);
      }
      try {
        const result = await communityApi.getFeed(page, 10, filter);
        setFeed(prev => (append ? [...prev, ...result.items] : result.items));
        setFeedPage(result.page);
        setFeedHasMore(Boolean(result.hasMore));
        setErrorText('');
      } catch (error) {
        setErrorText(formatApiErrorMessage(error, '社区内容加载失败'));
      } finally {
        setLoadingFeed(false);
        setLoadingMore(false);
      }
    },
    [filter],
  );

  const loadDrafts = useCallback(async () => {
    setLoadingDrafts(true);
    try {
      const result = await communityApi.getMyPosts('draft', 1, 20);
      setMyDrafts(result.items);
      setErrorText('');
    } catch (error) {
      setErrorText(formatApiErrorMessage(error, '草稿加载失败'));
    } finally {
      setLoadingDrafts(false);
    }
  }, []);

  const loadComments = useCallback(async (postId: string) => {
    setLoadingComments(true);
    try {
      const result = await communityApi.getComments(postId, 1, 50);
      setComments(result.items);
      setErrorText('');
    } catch (error) {
      setErrorText(formatApiErrorMessage(error, '评论加载失败'));
    } finally {
      setLoadingComments(false);
    }
  }, []);

  useEffect(() => {
    loadFeed(1, false).catch(() => undefined);
  }, [loadFeed]);

  useEffect(() => {
    if (view === 'draft') {
      loadDrafts().catch(() => undefined);
    }
  }, [loadDrafts, view]);

  const openDetail = async (post: CommunityPost) => {
    setSelectedPost(post);
    setComments([]);
    setCommentText('');
    setView('detail');
    await loadComments(post.id);
  };

  const toggleLike = async (post: CommunityPost) => {
    try {
      const nextLiked = !post.isLiked;
      const result = await communityApi.toggleLike(post.id, nextLiked);
      applyPostPatch(post.id, {
        isLiked: result.liked,
        likesCount: result.likesCount,
      });
    } catch (error) {
      const message = formatApiErrorMessage(error, '点赞失败');
      setErrorText(message);
      Alert.alert('点赞失败', message);
    }
  };

  const toggleSave = async (post: CommunityPost) => {
    try {
      const nextSaved = !post.isSaved;
      const result = await communityApi.toggleSave(post.id, nextSaved);
      applyPostPatch(post.id, {
        isSaved: result.saved,
        savesCount: result.savesCount,
      });
    } catch (error) {
      const message = formatApiErrorMessage(error, '收藏失败');
      setErrorText(message);
      Alert.alert('收藏失败', message);
    }
  };

  const saveDraft = async () => {
    if (!draftTitle.trim()) {
      setErrorText('标题不能为空');
      return;
    }
    try {
      setSubmittingDraft(true);
      const payload = {
        title: draftTitle.trim(),
        content: draftContent.trim(),
        tags: parseTags(draftTagsInput),
        beforeUrl: draftBeforeUrl.trim(),
        afterUrl: draftAfterUrl.trim(),
      };
      const saved = editingDraftId
        ? await communityApi.updateDraft(editingDraftId, payload)
        : await communityApi.createDraft(payload);
      applyPostPatch(saved.id, saved);
      if (!editingDraftId) {
        setMyDrafts(prev => [saved, ...prev.filter(item => item.id !== saved.id)]);
      } else {
        setMyDrafts(prev =>
          prev.map(item => (item.id === saved.id ? saved : item)),
        );
      }
      setEditingDraftId(saved.id);
      setErrorText('');
      Alert.alert('草稿已保存', `草稿 ID: ${saved.id}`);
    } catch (error) {
      const message = formatApiErrorMessage(error, '草稿保存失败');
      setErrorText(message);
      Alert.alert('草稿保存失败', message);
    } finally {
      setSubmittingDraft(false);
    }
  };

  const publishDraft = async () => {
    if (!editingDraftId) {
      setErrorText('请先保存草稿');
      return;
    }
    try {
      setPublishingDraft(true);
      await communityApi.publishDraft(editingDraftId);
      resetDraftForm();
      await Promise.all([loadDrafts(), loadFeed(1, false)]);
      setView('feed');
      setErrorText('');
    } catch (error) {
      const message = formatApiErrorMessage(error, '发布失败');
      setErrorText(message);
      Alert.alert('发布失败', message);
    } finally {
      setPublishingDraft(false);
    }
  };

  const submitComment = async () => {
    if (!selectedPost || !commentText.trim()) {
      return;
    }
    try {
      setSubmittingComment(true);
      const item = await communityApi.createComment(selectedPost.id, commentText.trim());
      setComments(prev => [...prev, item]);
      setCommentText('');
      applyPostPatch(selectedPost.id, {
        commentsCount: selectedPost.commentsCount + 1,
      });
      setErrorText('');
    } catch (error) {
      const message = formatApiErrorMessage(error, '评论发布失败');
      setErrorText(message);
      Alert.alert('评论发布失败', message);
    } finally {
      setSubmittingComment(false);
    }
  };

  const draftActionText = useMemo(
    () => (editingDraftId ? '更新草稿' : '保存草稿'),
    [editingDraftId],
  );

  const displayedFeed = useMemo(() => {
    const keyword = searchQuery.trim();
    if (!keyword) {
      return feed;
    }
    return feed.filter(item => {
      const tags = Array.isArray(item.tags) ? item.tags.join(' ') : '';
      return (
        item.title.includes(keyword) ||
        item.content.includes(keyword) ||
        item.author?.name?.includes(keyword) ||
        tags.includes(keyword)
      );
    });
  }, [feed, searchQuery]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <PageHero
        image={HERO_COMMUNITY}
        title="社区"
        subtitle="真实社区链路：feed / drafts / comments"
        variant="editorial"
        overlayStrength="normal"
      />

      <View style={styles.topControlRow}>
        <View style={styles.headerActionRow}>
          <Pressable
            style={[styles.headerBtn, view === 'feed' && styles.headerBtnActive]}
            onPress={() => setView('feed')}>
            <Icon name="newspaper" size={15} color="#2F2926" />
            <Text style={styles.headerBtnText}>动态</Text>
          </Pressable>
          <Pressable
            style={[styles.headerBtn, view === 'draft' && styles.headerBtnActive]}
            onPress={() => setView('draft')}>
            <Icon name="create" size={15} color="#2F2926" />
            <Text style={styles.headerBtnText}>草稿</Text>
          </Pressable>
        </View>
        <View style={styles.iconActionRow}>
          <Pressable style={styles.iconActionBtn} onPress={() => setShowSearch(prev => !prev)}>
            <Icon name="search" size={15} color="#2F2926" />
          </Pressable>
          <Pressable style={styles.iconActionBtnWarm} onPress={() => setView('draft')}>
            <Icon name="add" size={15} color="#FFF6F2" />
          </Pressable>
        </View>
      </View>

      {view === 'feed' ? (
        <View style={styles.card}>
          {showSearch ? (
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="搜索标题、标签、作者..."
              placeholderTextColor="rgba(134,112,100,0.7)"
            />
          ) : null}
          <View style={styles.trendingCard}>
            <View style={styles.trendingIconWrap}>
              <Icon name="flame" size={16} color="#FFF6F2" />
            </View>
            <View style={styles.trendingCopy}>
              <Text style={styles.trendingTitle}>本周热门</Text>
              <Text style={styles.trendingSub}>Agent 批量处理与 3D 展示讨论最高</Text>
            </View>
            <Text style={styles.hotBadge}>HOT</Text>
          </View>
          <View style={styles.sectionHead}>
            <View style={styles.sectionIconBadge}>
              <Icon name="planet" size={13} color="#A34A3C" />
            </View>
            <Text style={styles.sectionTitle}>社区动态</Text>
          </View>
          <View style={styles.filterRow}>
            {FILTERS.map(item => (
              <Pressable
                key={item.key}
                style={[
                  styles.filterBtn,
                  filter === item.key && styles.filterBtnActive,
                ]}
                onPress={() => setFilter(item.key)}>
                <Text style={styles.filterBtnText}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          {loadingFeed ? <Text style={styles.metaText}>加载中...</Text> : null}
          {displayedFeed.map(post => (
            <Pressable key={post.id} style={styles.postCard} onPress={() => openDetail(post)}>
              <View style={styles.postHead}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{post.author.name?.slice(0, 1) || '?'}</Text>
                </View>
                <View style={styles.postMeta}>
                  <Text style={styles.postAuthor}>{post.author.name || '匿名用户'}</Text>
                  <Text style={styles.postTime}>{post.updatedAt}</Text>
                </View>
                <Pressable onPress={() => toggleSave(post)} style={styles.iconBtn}>
                  <Icon
                    name={post.isSaved ? 'bookmark' : 'bookmark'}
                    size={16}
                    color={post.isSaved ? '#A46A34' : '#2F2926'}
                  />
                </Pressable>
              </View>
              <Text style={styles.postTitle}>{post.title}</Text>
              <Text numberOfLines={2} style={styles.postContent}>
                {post.content}
              </Text>
              <View style={styles.tagRow}>
                {(post.tags || []).map(tag => (
                  <Text key={`${post.id}-${tag}`} style={styles.tag}>
                    #{tag}
                  </Text>
                ))}
              </View>
              <View style={styles.postActions}>
                <Pressable style={styles.inlineAction} onPress={() => toggleLike(post)}>
                  <Icon
                    name={post.isLiked ? 'heart' : 'heart'}
                    size={14}
                    color={post.isLiked ? '#C35B63' : '#2F2926'}
                  />
                  <Text style={styles.inlineActionText}>{post.likesCount}</Text>
                </Pressable>
                <View style={styles.inlineAction}>
                  <Icon name="chatbubble" size={14} color="#2F2926" />
                  <Text style={styles.inlineActionText}>{post.commentsCount}</Text>
                </View>
                <View style={styles.inlineAction}>
                  <Icon name="bookmark" size={14} color="#2F2926" />
                  <Text style={styles.inlineActionText}>{post.savesCount}</Text>
                </View>
              </View>
            </Pressable>
          ))}
          {!displayedFeed.length && !loadingFeed ? (
            <Text style={styles.metaText}>没有匹配内容</Text>
          ) : null}
          {feedHasMore ? (
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => loadFeed(feedPage + 1, true)}
              disabled={loadingMore}>
              <Icon name="chevron-down" size={15} color="#2F2926" />
              <Text style={styles.secondaryBtnText}>
                {loadingMore ? '加载中...' : '加载更多'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {view === 'draft' ? (
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionIconBadge}>
              <Icon name="paper-plane" size={13} color="#A34A3C" />
            </View>
            <Text style={styles.sectionTitle}>发布草稿</Text>
          </View>
          <TextInput
            style={styles.input}
            value={draftTitle}
            onChangeText={setDraftTitle}
            placeholder="标题"
            placeholderTextColor="rgba(134,112,100,0.7)"
          />
          <TextInput
            style={[styles.input, styles.multiline]}
            value={draftContent}
            onChangeText={setDraftContent}
            placeholder="写下你的创作经验..."
            placeholderTextColor="rgba(134,112,100,0.7)"
            multiline
          />
          <TextInput
            style={styles.input}
            value={draftTagsInput}
            onChangeText={setDraftTagsInput}
            placeholder="标签，逗号分隔"
            placeholderTextColor="rgba(134,112,100,0.7)"
          />
          <TextInput
            style={styles.input}
            value={draftBeforeUrl}
            onChangeText={setDraftBeforeUrl}
            placeholder="beforeUrl（可选）"
            placeholderTextColor="rgba(134,112,100,0.7)"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={draftAfterUrl}
            onChangeText={setDraftAfterUrl}
            placeholder="afterUrl（可选）"
            placeholderTextColor="rgba(134,112,100,0.7)"
            autoCapitalize="none"
          />
          <View style={styles.actionRow}>
            <Pressable style={styles.primaryBtn} onPress={saveDraft} disabled={submittingDraft}>
              <Icon name="save" size={15} color="#FFF6F2" />
              <Text style={styles.primaryBtnText}>
                {submittingDraft ? '保存中...' : draftActionText}
              </Text>
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={publishDraft}
              disabled={publishingDraft}>
              <Icon name="send" size={15} color="#2F2926" />
              <Text style={styles.secondaryBtnText}>
                {publishingDraft ? '发布中...' : '发布'}
              </Text>
            </Pressable>
          </View>
          <View style={styles.actionRow}>
            <Pressable style={styles.secondaryBtn} onPress={resetDraftForm}>
              <Icon name="refresh" size={15} color="#2F2926" />
              <Text style={styles.secondaryBtnText}>清空</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={loadDrafts}>
              <Icon name="sync" size={15} color="#2F2926" />
              <Text style={styles.secondaryBtnText}>{loadingDrafts ? '刷新中...' : '刷新草稿'}</Text>
            </Pressable>
          </View>

          {myDrafts.map(draft => (
            <Pressable key={draft.id} style={styles.draftCard} onPress={() => fillDraftForm(draft)}>
              <Text style={styles.draftTitle}>{draft.title}</Text>
              <Text numberOfLines={2} style={styles.metaText}>
                {draft.content}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {view === 'detail' && selectedPost ? (
        <View style={styles.card}>
          <Pressable style={styles.backBtn} onPress={() => setView('feed')}>
            <Icon name="arrow-back" size={16} color="#2F2926" />
            <Text style={styles.backBtnText}>返回动态</Text>
          </Pressable>
          <Text style={styles.postTitle}>{selectedPost.title}</Text>
          <Text style={styles.postContent}>{selectedPost.content}</Text>
          <View style={styles.postActions}>
            <Pressable style={styles.inlineAction} onPress={() => toggleLike(selectedPost)}>
              <Icon
                name={selectedPost.isLiked ? 'heart' : 'heart'}
                size={14}
                color={selectedPost.isLiked ? '#C35B63' : '#2F2926'}
              />
              <Text style={styles.inlineActionText}>{selectedPost.likesCount}</Text>
            </Pressable>
            <Pressable style={styles.inlineAction} onPress={() => toggleSave(selectedPost)}>
              <Icon
                name={selectedPost.isSaved ? 'bookmark' : 'bookmark'}
                size={14}
                color={selectedPost.isSaved ? '#A46A34' : '#2F2926'}
              />
              <Text style={styles.inlineActionText}>{selectedPost.savesCount}</Text>
            </Pressable>
          </View>

          <View style={styles.sectionHead}>
            <View style={styles.sectionIconBadge}>
              <Icon name="chatbubbles" size={13} color="#A34A3C" />
            </View>
            <Text style={styles.sectionTitle}>评论</Text>
          </View>
          {loadingComments ? <Text style={styles.metaText}>评论加载中...</Text> : null}
          {comments.map(item => (
            <View key={item.id} style={styles.commentCard}>
              <Text style={styles.commentAuthor}>{item.author.name}</Text>
              <Text style={styles.commentContent}>{item.content}</Text>
              <Text style={styles.metaText}>{item.createdAt}</Text>
            </View>
          ))}

          <TextInput
            style={[styles.input, styles.multiline]}
            value={commentText}
            onChangeText={setCommentText}
            placeholder="写下你的评论..."
            placeholderTextColor="rgba(134,112,100,0.7)"
            multiline
          />
          <Pressable style={styles.primaryBtn} onPress={submitComment} disabled={submittingComment}>
            <Icon name="paper-plane" size={15} color="#FFF6F2" />
            <Text style={styles.primaryBtnText}>
              {submittingComment ? '提交中...' : '发布评论'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionIconBadge}>
            <Icon name="pulse" size={13} color="#A34A3C" />
          </View>
          <Text style={styles.sectionTitle}>模块状态</Text>
        </View>
        <Text style={styles.metaText}>
          strictMode: {communityCapability?.strictMode ? 'ON' : 'UNKNOWN'} | provider:{' '}
          {communityCapability?.provider || '-'} | auth:{' '}
          {communityCapability?.auth?.required ? 'JWT' : 'none'}
        </Text>
        {errorText ? <Text style={styles.errorText}>错误: {errorText}</Text> : null}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {gap: 14, paddingBottom: 24},
  topControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerActionRow: {flexDirection: 'row', gap: 10, flex: 1},
  iconActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  iconActionBtn: {
    ...canvasUi.secondaryButton,
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActionBtnWarm: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#A34A3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtn: {
    ...canvasUi.chip,
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  headerBtnActive: {
    ...canvasUi.chipActive,
  },
  headerBtnText: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
  },
  card: {
    ...cardSurfaceWarm,
    ...glassShadow,
    padding: 14,
    gap: 12,
  },
  searchInput: {
    ...canvasUi.input,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#2F2926',
    ...canvasText.body,
  },
  trendingCard: {
    ...canvasUi.subtleCard,
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  trendingIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#A34A3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendingCopy: {
    flex: 1,
    gap: 2,
  },
  trendingTitle: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
  },
  trendingSub: {
    ...canvasText.caption,
    color: 'rgba(110,90,80,0.82)',
  },
  hotBadge: {
    ...canvasText.caption,
    color: '#FFF6F2',
    backgroundColor: '#F2D8AE',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
  },
  sectionTitle: {
    ...canvasText.sectionTitle,
    color: '#2F2926',
  },
  sectionHead: {
    ...canvasUi.titleWithIcon,
  },
  sectionIconBadge: {
    ...canvasUi.iconBadge,
  },
  filterRow: {flexDirection: 'row', gap: 8, flexWrap: 'wrap'},
  filterBtn: {
    ...canvasUi.chip,
    minHeight: 32,
    borderRadius: 11,
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {...canvasUi.chipActive},
  filterBtnText: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
  },
  postCard: {
    ...canvasUi.subtleCard,
    borderRadius: 14,
    padding: 11,
    gap: 9,
  },
  postHead: {flexDirection: 'row', alignItems: 'center', gap: 8},
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(163,74,60,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...canvasText.bodyStrong,
    color: '#FFF6F2',
  },
  postMeta: {flex: 1},
  postAuthor: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
  },
  postTime: {
    ...canvasText.caption,
    color: 'rgba(126,104,93,0.78)',
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(228,208,197,0.8)',
  },
  postTitle: {
    ...canvasText.sectionTitle,
    color: '#2F2926',
    fontSize: 14,
  },
  postContent: {
    ...canvasText.body,
    color: 'rgba(78,64,56,0.9)',
    lineHeight: 18,
  },
  tagRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  tag: {
    ...canvasText.caption,
    color: '#9A5A43',
    backgroundColor: 'rgba(163,74,60,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  postActions: {flexDirection: 'row', alignItems: 'center', gap: 12},
  inlineAction: {flexDirection: 'row', alignItems: 'center', gap: 4},
  inlineActionText: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
  },
  input: {
    ...canvasUi.input,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#2F2926',
    ...canvasText.body,
  },
  multiline: {minHeight: 90, textAlignVertical: 'top'},
  actionRow: {flexDirection: 'row', gap: 10},
  primaryBtn: {
    ...canvasUi.primaryButton,
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  primaryBtnText: {
    ...canvasText.bodyStrong,
    color: '#FFF6F2',
  },
  secondaryBtn: {
    ...canvasUi.secondaryButton,
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    flexDirection: 'row',
    gap: 6,
  },
  secondaryBtnText: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
  },
  draftCard: {
    ...canvasUi.subtleCard,
    borderRadius: 12,
    padding: 10,
    gap: 5,
  },
  draftTitle: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
  },
  backBtn: {flexDirection: 'row', alignItems: 'center', gap: 6},
  backBtnText: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
  },
  commentCard: {
    ...canvasUi.subtleCard,
    borderRadius: 12,
    padding: 10,
    gap: 5,
  },
  commentAuthor: {
    ...canvasText.bodyStrong,
    color: '#9A5A43',
  },
  commentContent: {
    ...canvasText.body,
    color: 'rgba(78,64,56,0.9)',
    lineHeight: 18,
  },
  metaText: {
    ...canvasText.bodyMuted,
    color: 'rgba(116,94,84,0.82)',
    lineHeight: 16,
  },
  errorText: {
    ...canvasText.body,
    color: '#C35B63',
    lineHeight: 18,
  },
});

