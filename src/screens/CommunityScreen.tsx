import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Alert,
  Image,
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
import {HERO_COMMUNITY} from '../assets/design';
import {PageHero} from '../components/app/PageHero';
import {recordCommunityHistory} from '../services/communityHistory';
import {canvasText, canvasUi, cardSurfaceWarm, glassShadow} from '../theme/canvasDesign';

type CommunityView = 'feed' | 'detail';
type CommunityFilter = 'all' | 'portrait' | 'cinema' | 'vintage';

const FILTERS: Array<{key: CommunityFilter; label: string}> = [
  {key: 'all', label: '全部'},
  {key: 'portrait', label: '人像'},
  {key: 'cinema', label: '电影感'},
  {key: 'vintage', label: '复古'},
];

const getPostPreviewImages = (post: CommunityPost): string[] =>
  [post.beforeUrl, post.afterUrl].filter(Boolean);

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
  const [submittingComment, setSubmittingComment] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const applyPostPatch = useCallback((postId: string, patch: Partial<CommunityPost>) => {
    setFeed(prev => prev.map(item => (item.id === postId ? {...item, ...patch} : item)));
    setSelectedPost(prev => (prev && prev.id === postId ? {...prev, ...patch} : prev));
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

  const openDetail = async (post: CommunityPost) => {
    setSelectedPost(post);
    setComments([]);
    setCommentText('');
    setView('detail');
    recordCommunityHistory(post).catch(() => undefined);
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

  const renderPostImages = (post: CommunityPost) => {
    const previewImages = getPostPreviewImages(post);
    if (!previewImages.length) {
      return null;
    }

    return (
      <View style={styles.postImageStrip}>
        {previewImages.map((uri, index) => (
          <Image
            key={`${post.id}-${uri}-${index}`}
            source={{uri}}
            style={styles.postImage}
            resizeMode="cover"
          />
        ))}
      </View>
    );
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <PageHero
        image={HERO_COMMUNITY}
        title="社区"
        subtitle="浏览动态、参与评论，与更多创作者交流"
        variant="editorial"
        overlayStrength="normal"
      />

      {view === 'feed' ? (
        <>
          <View style={styles.topControlRow}>
            <View style={styles.sectionHead}>
              <View style={styles.sectionIconBadge}>
                <Icon name="planet-outline" size={13} color="#A34A3C" />
              </View>
              <Text style={styles.sectionTitle}>社区动态</Text>
            </View>
            <View style={styles.iconActionRow}>
              <Pressable style={styles.iconActionBtn} onPress={() => setShowSearch(prev => !prev)}>
                <Icon name="search" size={15} color="#2F2926" />
              </Pressable>
              <Pressable style={styles.iconActionBtn} onPress={() => loadFeed(1, false)}>
                <Icon name="sync-outline" size={15} color="#2F2926" />
              </Pressable>
            </View>
          </View>

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
                <Text style={styles.trendingTitle}>社区入口已整理</Text>
                <Text style={styles.trendingSub}>动态浏览留在社区，发帖与草稿管理已移到“我的”。</Text>
              </View>
              <Text style={styles.hotBadge}>NEW</Text>
            </View>

            <View style={styles.filterRow}>
              {FILTERS.map(item => (
                <Pressable
                  key={item.key}
                  style={[styles.filterBtn, filter === item.key && styles.filterBtnActive]}
                  onPress={() => setFilter(item.key)}>
                  <Text style={styles.filterBtnText}>{item.label}</Text>
                </Pressable>
              ))}
            </View>

            {loadingFeed ? <Text style={styles.metaText}>加载中...</Text> : null}

            {displayedFeed.map(post => (
              <Pressable
                key={post.id}
                testID={`community-post-${post.id}`}
                style={styles.postCard}
                onPress={() => openDetail(post)}>
                <View style={styles.postHead}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{post.author.name?.slice(0, 1) || '?'}</Text>
                  </View>
                  <View style={styles.postMetaWrap}>
                    <Text style={styles.postAuthor}>{post.author.name || '匿名用户'}</Text>
                    <Text style={styles.postTime}>{post.updatedAt}</Text>
                  </View>
                  <Pressable onPress={() => toggleSave(post)} style={styles.iconBtn}>
                    <Icon
                      name={post.isSaved ? 'bookmark' : 'bookmark-outline'}
                      size={16}
                      color={post.isSaved ? '#A46A34' : '#2F2926'}
                    />
                  </Pressable>
                </View>
                <Text style={styles.postTitle}>{post.title}</Text>
                <Text numberOfLines={2} style={styles.postContent}>
                  {post.content}
                </Text>
                {renderPostImages(post)}
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
                      name={post.isLiked ? 'heart' : 'heart-outline'}
                      size={14}
                      color={post.isLiked ? '#C35B63' : '#2F2926'}
                    />
                    <Text style={styles.inlineActionText}>{post.likesCount}</Text>
                  </Pressable>
                  <View style={styles.inlineAction}>
                    <Icon name="chatbubble-outline" size={14} color="#2F2926" />
                    <Text style={styles.inlineActionText}>{post.commentsCount}</Text>
                  </View>
                  <View style={styles.inlineAction}>
                    <Icon name="bookmark-outline" size={14} color="#2F2926" />
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
        </>
      ) : null}

      {view === 'detail' && selectedPost ? (
        <View style={styles.card}>
          <Pressable style={styles.backBtn} onPress={() => setView('feed')}>
            <Icon name="arrow-back" size={16} color="#2F2926" />
            <Text style={styles.backBtnText}>返回动态</Text>
          </Pressable>

          <Text style={styles.postTitle}>{selectedPost.title}</Text>
          <Text style={styles.postContent}>{selectedPost.content}</Text>
          {renderPostImages(selectedPost)}

          <View style={styles.postActions}>
            <Pressable style={styles.inlineAction} onPress={() => toggleLike(selectedPost)}>
              <Icon
                name={selectedPost.isLiked ? 'heart' : 'heart-outline'}
                size={14}
                color={selectedPost.isLiked ? '#C35B63' : '#2F2926'}
              />
              <Text style={styles.inlineActionText}>{selectedPost.likesCount}</Text>
            </Pressable>
            <Pressable style={styles.inlineAction} onPress={() => toggleSave(selectedPost)}>
              <Icon
                name={selectedPost.isSaved ? 'bookmark' : 'bookmark-outline'}
                size={14}
                color={selectedPost.isSaved ? '#A46A34' : '#2F2926'}
              />
              <Text style={styles.inlineActionText}>{selectedPost.savesCount}</Text>
            </Pressable>
          </View>

          <View style={styles.sectionHead}>
            <View style={styles.sectionIconBadge}>
              <Icon name="chatbubbles-outline" size={13} color="#A34A3C" />
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
            <Icon name="paper-plane-outline" size={15} color="#FFF6F2" />
            <Text style={styles.primaryBtnText}>
              {submittingComment ? '提交中...' : '发布评论'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionIconBadge}>
            <Icon name="pulse-outline" size={13} color="#A34A3C" />
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
    justifyContent: 'space-between',
    gap: 10,
  },
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
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterBtn: {
    ...canvasUi.chip,
    minHeight: 32,
    borderRadius: 11,
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {
    ...canvasUi.chipActive,
  },
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
  postHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
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
  postMetaWrap: {
    flex: 1,
  },
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
  postImageStrip: {
    flexDirection: 'row',
    gap: 8,
  },
  postImage: {
    flex: 1,
    height: 118,
    borderRadius: 12,
    backgroundColor: 'rgba(243,233,227,0.9)',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    ...canvasText.caption,
    color: '#9A5A43',
    backgroundColor: 'rgba(163,74,60,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inlineAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
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
  multiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  primaryBtn: {
    ...canvasUi.primaryButton,
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
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
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
