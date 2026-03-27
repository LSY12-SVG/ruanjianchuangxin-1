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
import {HERO_COMMUNITY} from '../assets/design';
import {PageHero} from '../components/app/PageHero';
import {useMyProfileQuery} from '../hooks/queries/useMyProfileQuery';
import {communityApi, formatApiErrorMessage, type CommunityPost} from '../modules/api';
import {hasAuthToken} from '../profile/api';
import {canvasText, canvasUi, cardSurfaceWarm, glassShadow} from '../theme/canvasDesign';

type MyContentMode = 'drafts' | 'published';

const parseTags = (raw: string): string[] =>
  raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 12);

export const MyScreen: React.FC = () => {
  const profileQuery = useMyProfileQuery();
  const [contentMode, setContentMode] = useState<MyContentMode>('drafts');
  const [drafts, setDrafts] = useState<CommunityPost[]>([]);
  const [publishedPosts, setPublishedPosts] = useState<CommunityPost[]>([]);
  const [editingDraftId, setEditingDraftId] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftTagsInput, setDraftTagsInput] = useState('');
  const [draftBeforeUrl, setDraftBeforeUrl] = useState('');
  const [draftAfterUrl, setDraftAfterUrl] = useState('');
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [submittingDraft, setSubmittingDraft] = useState(false);
  const [publishingDraft, setPublishingDraft] = useState(false);
  const [errorText, setErrorText] = useState('');

  const profile = profileQuery.data?.profile || null;
  const stats = profileQuery.data?.stats || null;
  const settings = profileQuery.data?.settings || null;
  const accountReady = hasAuthToken();

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
    setContentMode('drafts');
  }, []);

  const applyPostPatch = useCallback((postId: string, patch: Partial<CommunityPost>) => {
    setDrafts(prev => prev.map(item => (item.id === postId ? {...item, ...patch} : item)));
    setPublishedPosts(prev => prev.map(item => (item.id === postId ? {...item, ...patch} : item)));
  }, []);

  const loadMyPosts = useCallback(async () => {
    setLoadingPosts(true);
    try {
      const [draftResult, publishedResult] = await Promise.all([
        communityApi.getMyPosts('draft', 1, 20),
        communityApi.getMyPosts('published', 1, 20),
      ]);
      setDrafts(draftResult.items);
      setPublishedPosts(publishedResult.items);
      setErrorText('');
    } catch (error) {
      setErrorText(formatApiErrorMessage(error, '我的帖子加载失败'));
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  useEffect(() => {
    if (!accountReady) {
      return;
    }
    loadMyPosts().catch(() => undefined);
  }, [accountReady, loadMyPosts]);

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
      setDrafts(prev => [saved, ...prev.filter(item => item.id !== saved.id)]);
      applyPostPatch(saved.id, saved);
      setEditingDraftId(saved.id);
      setContentMode('drafts');
      setErrorText('');
      Alert.alert('草稿已保存', '你可以继续编辑，或直接发布到社区。');
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
      const published = await communityApi.publishDraft(editingDraftId);
      setDrafts(prev => prev.filter(item => item.id !== editingDraftId));
      setPublishedPosts(prev => [published, ...prev.filter(item => item.id !== published.id)]);
      resetDraftForm();
      setContentMode('published');
      setErrorText('');
      Alert.alert('发布成功', '帖子已经发布到社区动态。');
    } catch (error) {
      const message = formatApiErrorMessage(error, '发布失败');
      setErrorText(message);
      Alert.alert('发布失败', message);
    } finally {
      setPublishingDraft(false);
    }
  };

  const profileHeaderText = useMemo(() => {
    if (!profile) {
      return '登录后查看个人资料与发帖记录';
    }
    return `${profile.displayName || profile.username} · ${profile.tier}`;
  }, [profile]);

  const postList = contentMode === 'drafts' ? drafts : publishedPosts;
  const postListTitle = contentMode === 'drafts' ? '我的草稿' : '已发布内容';
  const saveDraftText = editingDraftId ? '更新草稿' : '保存草稿';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <PageHero
        image={HERO_COMMUNITY}
        title="我的"
        subtitle="查看账号信息，管理草稿与已发布内容"
        variant="editorial"
        overlayStrength="normal"
      />

      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionIconBadge}>
            <Icon name="person-circle-outline" size={13} color="#A34A3C" />
          </View>
          <Text style={styles.sectionTitle}>账号概览</Text>
        </View>

        {!accountReady ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>尚未登录</Text>
            <Text style={styles.metaText}>请先登录后再查看个人资料和发帖内容。</Text>
          </View>
        ) : null}

        {accountReady ? (
          <View style={styles.profileCard}>
            <View style={styles.profileHead}>
              <View style={styles.avatarBadge}>
                <Text style={styles.avatarBadgeText}>
                  {(profile?.displayName || profile?.username || 'V').slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.profileCopy}>
                <Text style={styles.profileName}>{profile?.displayName || '加载中...'}</Text>
                <Text style={styles.profileMeta}>{profileHeaderText}</Text>
                <Text style={styles.profileMeta}>账号：{profile?.username || 'VisionGenie 用户'}</Text>
              </View>
              <Pressable style={styles.inlineRefreshBtn} onPress={() => profileQuery.refetch()}>
                <Icon name="sync-outline" size={15} color="#2F2926" />
              </Pressable>
            </View>

            {profileQuery.isLoading && !profile ? (
              <Text style={styles.metaText}>正在加载个人信息...</Text>
            ) : null}
            {profileQuery.isError ? (
              <Text style={styles.errorText}>
                {formatApiErrorMessage(profileQuery.error, '个人信息加载失败')}
              </Text>
            ) : null}

            <View style={styles.statGrid}>
              <View style={styles.statChip}>
                <Text style={styles.statValue}>{stats?.communityPostsCount ?? 0}</Text>
                <Text style={styles.statLabel}>社区发布</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statValue}>{stats?.modelTasksCount ?? 0}</Text>
                <Text style={styles.statLabel}>建模任务</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statValue}>{settings?.communityNotify ? 'ON' : 'OFF'}</Text>
                <Text style={styles.statLabel}>社区通知</Text>
              </View>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionIconBadge}>
            <Icon name="create-outline" size={13} color="#A34A3C" />
          </View>
          <Text style={styles.sectionTitle}>发帖管理</Text>
        </View>
        <Text style={styles.metaText}>
          在这里保存草稿、继续编辑，并将内容发布到社区动态。
        </Text>

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
          <Pressable
            testID="my-save-draft-button"
            style={styles.primaryBtn}
            onPress={saveDraft}
            disabled={submittingDraft}>
            <Icon name="save-outline" size={15} color="#FFF6F2" />
            <Text style={styles.primaryBtnText}>
              {submittingDraft ? '保存中...' : saveDraftText}
            </Text>
          </Pressable>
          <Pressable
            testID="my-publish-draft-button"
            style={styles.secondaryBtn}
            onPress={publishDraft}
            disabled={publishingDraft}>
            <Icon name="paper-plane-outline" size={15} color="#2F2926" />
            <Text style={styles.secondaryBtnText}>
              {publishingDraft ? '发布中...' : '发布到社区'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.actionRow}>
          <Pressable style={styles.secondaryBtn} onPress={resetDraftForm}>
            <Icon name="refresh-outline" size={15} color="#2F2926" />
            <Text style={styles.secondaryBtnText}>清空</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => loadMyPosts()} disabled={loadingPosts}>
            <Icon name="sync-outline" size={15} color="#2F2926" />
            <Text style={styles.secondaryBtnText}>{loadingPosts ? '刷新中...' : '刷新列表'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.topControlRow}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionIconBadge}>
              <Icon name="albums-outline" size={13} color="#A34A3C" />
            </View>
            <Text style={styles.sectionTitle}>{postListTitle}</Text>
          </View>
          <View style={styles.modeRow}>
            <Pressable
              testID="my-mode-drafts"
              style={[styles.modeBtn, contentMode === 'drafts' && styles.modeBtnActive]}
              onPress={() => setContentMode('drafts')}>
              <Text style={styles.modeBtnText}>草稿</Text>
            </Pressable>
            <Pressable
              testID="my-mode-published"
              style={[styles.modeBtn, contentMode === 'published' && styles.modeBtnActive]}
              onPress={() => setContentMode('published')}>
              <Text style={styles.modeBtnText}>已发布</Text>
            </Pressable>
          </View>
        </View>

        {loadingPosts ? <Text style={styles.metaText}>加载中...</Text> : null}
        {!loadingPosts && postList.length === 0 ? (
          <Text style={styles.metaText}>
            {contentMode === 'drafts' ? '还没有草稿，先写一篇吧。' : '还没有已发布内容。'}
          </Text>
        ) : null}

        {postList.map(post => (
          <View key={post.id} style={styles.postCard}>
            <View style={styles.postCardHead}>
              <View style={styles.postTextWrap}>
                <Text style={styles.postTitle}>{post.title}</Text>
                <Text style={styles.postMeta}>
                  {contentMode === 'drafts' ? '草稿' : '已发布'} · 更新时间 {post.updatedAt}
                </Text>
              </View>
              {contentMode === 'drafts' ? (
                <Pressable style={styles.inlineRefreshBtn} onPress={() => fillDraftForm(post)}>
                  <Icon name="create-outline" size={15} color="#2F2926" />
                </Pressable>
              ) : null}
            </View>
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
            <View style={styles.postMetricRow}>
              <Text style={styles.postMetricText}>点赞 {post.likesCount}</Text>
              <Text style={styles.postMetricText}>评论 {post.commentsCount}</Text>
              <Text style={styles.postMetricText}>收藏 {post.savesCount}</Text>
            </View>
          </View>
        ))}
      </View>

      {errorText ? (
        <View style={styles.card}>
          <Text style={styles.errorText}>错误: {errorText}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {gap: 14, paddingBottom: 24},
  card: {
    ...cardSurfaceWarm,
    ...glassShadow,
    padding: 14,
    gap: 12,
  },
  sectionHead: {
    ...canvasUi.titleWithIcon,
  },
  sectionIconBadge: {
    ...canvasUi.iconBadge,
  },
  sectionTitle: {
    ...canvasText.sectionTitle,
    color: '#2F2926',
  },
  infoCard: {
    ...canvasUi.subtleCard,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  infoTitle: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
  },
  profileCard: {
    ...canvasUi.subtleCard,
    borderRadius: 16,
    padding: 12,
    gap: 12,
  },
  profileHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarBadge: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#A34A3C',
  },
  avatarBadgeText: {
    ...canvasText.bodyStrong,
    color: '#FFF6F2',
    fontSize: 18,
  },
  profileCopy: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    ...canvasText.sectionTitle,
    color: '#2F2926',
  },
  profileMeta: {
    ...canvasText.bodyMuted,
    color: 'rgba(110,90,80,0.82)',
  },
  inlineRefreshBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(228,208,197,0.8)',
  },
  statGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  statChip: {
    ...canvasUi.subtleCard,
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    ...canvasText.sectionTitle,
    color: '#A34A3C',
    fontSize: 16,
  },
  statLabel: {
    ...canvasText.caption,
    color: 'rgba(110,90,80,0.82)',
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
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryBtn: {
    ...canvasUi.primaryButton,
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  secondaryBtn: {
    ...canvasUi.secondaryButton,
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
  secondaryBtnText: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
  },
  topControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeBtn: {
    ...canvasUi.chip,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBtnActive: {
    ...canvasUi.chipActive,
  },
  modeBtnText: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
  },
  postCard: {
    ...canvasUi.subtleCard,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  postCardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  postTextWrap: {
    flex: 1,
    gap: 2,
  },
  postTitle: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
  },
  postMeta: {
    ...canvasText.caption,
    color: 'rgba(126,104,93,0.78)',
  },
  postContent: {
    ...canvasText.body,
    color: 'rgba(78,64,56,0.9)',
    lineHeight: 18,
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
  postMetricRow: {
    flexDirection: 'row',
    gap: 12,
  },
  postMetricText: {
    ...canvasText.bodyMuted,
    color: 'rgba(110,90,80,0.82)',
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
