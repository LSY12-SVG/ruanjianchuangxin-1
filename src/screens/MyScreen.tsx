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
import {HERO_COMMUNITY} from '../assets/design';
import {PageHero} from '../components/app/PageHero';
import {BentoCard} from '../components/ui/BentoCard';
import {GlassCard} from '../components/ui/GlassCard';
import {ListRow} from '../components/ui/ListRow';
import {PrimaryButton} from '../components/ui/PrimaryButton';
import {useImagePicker, type ImagePickerResult} from '../hooks/useImagePicker';
import {useMyProfileQuery} from '../hooks/queries/useMyProfileQuery';
import {
  communityApi,
  formatApiErrorMessage,
  type CommunityHistoryPost,
  type CommunityPost,
} from '../modules/api';
import {hasAuthToken} from '../profile/api';
import {listCommunityHistory} from '../services/communityHistory';
import {canvasText, canvasUi, cardSurfaceWarm, glassShadow} from '../theme/canvasDesign';
import {semanticColors} from '../theme/tokens';

type MyActivityMode = 'history' | 'saved' | 'liked' | 'published';
type ImageSlotKey = 'before' | 'after';
type ActivityFeedItem = CommunityPost | CommunityHistoryPost;

const QUICK_ACTIONS: Array<{key: MyActivityMode; label: string; icon: string}> = [
  {key: 'history', label: '历史记录', icon: 'time-outline'},
  {key: 'saved', label: '我的收藏', icon: 'star-outline'},
  {key: 'liked', label: '最近点赞', icon: 'heart-outline'},
  {key: 'published', label: '已发布', icon: 'albums-outline'},
];

const parseTags = (raw: string): string[] =>
  raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 12);

const getPostPreviewImages = (post: ActivityFeedItem): string[] =>
  [post.beforeUrl, post.afterUrl].filter(Boolean);

export const MyScreen: React.FC = () => {
  const profileQuery = useMyProfileQuery();
  const [activeMode, setActiveMode] = useState<MyActivityMode>('history');
  const [drafts, setDrafts] = useState<CommunityPost[]>([]);
  const [publishedPosts, setPublishedPosts] = useState<CommunityPost[]>([]);
  const [likedPosts, setLikedPosts] = useState<CommunityPost[]>([]);
  const [savedPosts, setSavedPosts] = useState<CommunityPost[]>([]);
  const [historyPosts, setHistoryPosts] = useState<CommunityHistoryPost[]>([]);
  const [editingDraftId, setEditingDraftId] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftTagsInput, setDraftTagsInput] = useState('');
  const [beforeImage, setBeforeImage] = useState<ImagePickerResult | null>(null);
  const [afterImage, setAfterImage] = useState<ImagePickerResult | null>(null);
  const [beforeImageUrl, setBeforeImageUrl] = useState('');
  const [afterImageUrl, setAfterImageUrl] = useState('');
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [submittingDraft, setSubmittingDraft] = useState(false);
  const [publishingDraft, setPublishingDraft] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<ImageSlotKey | ''>('');
  const [errorText, setErrorText] = useState('');

  const profile = profileQuery.data?.profile || null;
  const stats = profileQuery.data?.stats || null;
  const settings = profileQuery.data?.settings || null;
  const accountReady = hasAuthToken();

  const beforePicker = useImagePicker({
    onImageSelected: image => {
      setBeforeImage(image);
      setErrorText('');
    },
    onImageError: message => setErrorText(message),
  });
  const afterPicker = useImagePicker({
    onImageSelected: image => {
      setAfterImage(image);
      setErrorText('');
    },
    onImageError: message => setErrorText(message),
  });

  const clearSlot = useCallback(
    (slot: ImageSlotKey) => {
      if (slot === 'before') {
        setBeforeImage(null);
        setBeforeImageUrl('');
        beforePicker.clearImage();
        return;
      }
      setAfterImage(null);
      setAfterImageUrl('');
      afterPicker.clearImage();
    },
    [afterPicker, beforePicker],
  );

  const resetDraftForm = useCallback(() => {
    setEditingDraftId('');
    setDraftTitle('');
    setDraftContent('');
    setDraftTagsInput('');
    clearSlot('before');
    clearSlot('after');
  }, [clearSlot]);

  const fillDraftForm = useCallback(
    (post: CommunityPost) => {
      setEditingDraftId(post.id);
      setDraftTitle(post.title);
      setDraftContent(post.content);
      setDraftTagsInput((post.tags || []).join(','));
      setBeforeImage(null);
      setAfterImage(null);
      setBeforeImageUrl(post.beforeUrl || '');
      setAfterImageUrl(post.afterUrl || '');
      beforePicker.clearImage();
      afterPicker.clearImage();
    },
    [afterPicker, beforePicker],
  );

  const applyPostPatch = useCallback((postId: string, patch: Partial<CommunityPost>) => {
    setDrafts(prev => prev.map(item => (item.id === postId ? {...item, ...patch} : item)));
    setPublishedPosts(prev => prev.map(item => (item.id === postId ? {...item, ...patch} : item)));
    setLikedPosts(prev => prev.map(item => (item.id === postId ? {...item, ...patch} : item)));
    setSavedPosts(prev => prev.map(item => (item.id === postId ? {...item, ...patch} : item)));
    setHistoryPosts(prev => prev.map(item => (item.id === postId ? {...item, ...patch} : item)));
  }, []);

  const loadHistoryPosts = useCallback(async () => {
    const items = await listCommunityHistory();
    setHistoryPosts(items);
  }, []);

  const loadMyPosts = useCallback(async () => {
    if (!accountReady) {
      setDrafts([]);
      setPublishedPosts([]);
      return;
    }
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
  }, [accountReady]);

  const loadMyActivity = useCallback(async () => {
    setLoadingActivity(true);
    try {
      const historyPromise = loadHistoryPosts();
      if (!accountReady) {
        await historyPromise;
        setLikedPosts([]);
        setSavedPosts([]);
        setErrorText('');
        return;
      }

      const [likedResult, savedResult] = await Promise.all([
        communityApi.getLikedPosts(1, 12),
        communityApi.getSavedPosts(1, 12),
        historyPromise,
      ]);
      setLikedPosts(likedResult.items);
      setSavedPosts(savedResult.items);
      setErrorText('');
    } catch (error) {
      setErrorText(formatApiErrorMessage(error, '最近活动加载失败'));
    } finally {
      setLoadingActivity(false);
    }
  }, [accountReady, loadHistoryPosts]);

  useEffect(() => {
    loadHistoryPosts().catch(() => undefined);
  }, [loadHistoryPosts]);

  useEffect(() => {
    if (!accountReady) {
      return;
    }
    loadMyPosts().catch(() => undefined);
    loadMyActivity().catch(() => undefined);
  }, [accountReady, loadMyActivity, loadMyPosts]);

  const refreshAll = async () => {
    try {
      await Promise.all([profileQuery.refetch(), loadMyPosts(), loadMyActivity()]);
      setErrorText('');
    } catch (error) {
      setErrorText(formatApiErrorMessage(error, '页面刷新失败'));
    }
  };

  const pickImageForSlot = async (slot: ImageSlotKey) => {
    setErrorText('');
    const picker = slot === 'before' ? beforePicker : afterPicker;
    const result = await picker.pickFromGallery();
    if (!result.success && result.error && result.error !== '用户取消了选择') {
      setErrorText(result.error);
    }
  };

  const uploadImageIfNeeded = async (
    slot: ImageSlotKey,
    localImage: ImagePickerResult | null,
    currentUrl: string,
  ): Promise<string> => {
    if (!localImage?.uri) {
      return currentUrl;
    }

    try {
      setUploadingSlot(slot);
      const uploaded = await communityApi.uploadPostImage({
        uri: localImage.uri,
        name: localImage.fileName || `${slot}-image.jpg`,
        type: localImage.type || 'image/jpeg',
      });
      if (slot === 'before') {
        setBeforeImage(null);
        beforePicker.clearImage();
        setBeforeImageUrl(uploaded.url);
      } else {
        setAfterImage(null);
        afterPicker.clearImage();
        setAfterImageUrl(uploaded.url);
      }
      return uploaded.url;
    } catch (error) {
      const message = formatApiErrorMessage(error, '图片上传失败');
      setErrorText(message);
      Alert.alert('图片上传失败', message);
      throw error;
    } finally {
      setUploadingSlot('');
    }
  };

  const persistDraft = async (): Promise<CommunityPost | null> => {
    if (!draftTitle.trim()) {
      setErrorText('标题不能为空');
      return null;
    }

    const nextBeforeUrl = await uploadImageIfNeeded('before', beforeImage, beforeImageUrl);
    const nextAfterUrl = await uploadImageIfNeeded('after', afterImage, afterImageUrl);
    const payload = {
      title: draftTitle.trim(),
      content: draftContent.trim(),
      tags: parseTags(draftTagsInput),
      beforeUrl: nextBeforeUrl,
      afterUrl: nextAfterUrl,
    };

    const saved = editingDraftId
      ? await communityApi.updateDraft(editingDraftId, payload)
      : await communityApi.createDraft(payload);

    setDrafts(prev => [saved, ...prev.filter(item => item.id !== saved.id)]);
    setEditingDraftId(saved.id);
    setBeforeImageUrl(saved.beforeUrl || '');
    setAfterImageUrl(saved.afterUrl || '');
    applyPostPatch(saved.id, saved);
    setErrorText('');
    return saved;
  };

  const saveDraft = async () => {
    try {
      setSubmittingDraft(true);
      const saved = await persistDraft();
      if (!saved) {
        return;
      }
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
    try {
      setPublishingDraft(true);
      const savedDraft = await persistDraft();
      if (!savedDraft) {
        return;
      }
      const published = await communityApi.publishDraft(savedDraft.id);
      setDrafts(prev => prev.filter(item => item.id !== savedDraft.id));
      setPublishedPosts(prev => [published, ...prev.filter(item => item.id !== published.id)]);
      applyPostPatch(published.id, published);
      resetDraftForm();
      setActiveMode('published');
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
      return '登录后查看个人资料、收藏和浏览记录';
    }
    return `用户名：${profile.username}`;
  }, [profile]);

  const activityItems = useMemo<ActivityFeedItem[]>(() => {
    if (activeMode === 'liked') {
      return likedPosts;
    }
    if (activeMode === 'saved') {
      return savedPosts;
    }
    if (activeMode === 'published') {
      return publishedPosts;
    }
    return historyPosts;
  }, [activeMode, historyPosts, likedPosts, publishedPosts, savedPosts]);

  const activityTitle = useMemo(() => {
    if (activeMode === 'liked') {
      return '最近点赞';
    }
    if (activeMode === 'saved') {
      return '我的收藏';
    }
    if (activeMode === 'published') {
      return '已发布内容';
    }
    return '历史记录';
  }, [activeMode]);

  const activityEmptyText = useMemo(() => {
    if (activeMode === 'liked') {
      return '还没有点赞过帖子。';
    }
    if (activeMode === 'saved') {
      return '还没有收藏过帖子。';
    }
    if (activeMode === 'published') {
      return '还没有已发布内容。';
    }
    return '还没有浏览记录，去社区看看吧。';
  }, [activeMode]);

  const saveDraftText = editingDraftId ? '更新草稿' : '保存草稿';
  const beforePreviewUri = beforeImage?.uri || beforeImageUrl;
  const afterPreviewUri = afterImage?.uri || afterImageUrl;

  const renderImageSlot = (
    slot: ImageSlotKey,
    label: string,
    previewUri: string,
    picking: boolean,
  ) => (
    <View style={styles.imageSlotCard}>
      <View style={styles.imageSlotHead}>
        <Text style={styles.imageSlotLabel}>{label}</Text>
        {uploadingSlot === slot ? <Text style={styles.imageSlotMeta}>上传中...</Text> : null}
      </View>
      {previewUri ? (
        <Image source={{uri: previewUri}} style={styles.imagePreview} resizeMode="cover" />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Icon name="image-outline" size={22} color="rgba(120,98,88,0.72)" />
          <Text style={styles.imagePlaceholderText}>从相册选择图片</Text>
        </View>
      )}
      <View style={styles.imageSlotActions}>
        <Pressable
          testID={`my-pick-${slot}-image-button`}
          style={styles.secondaryBtn}
          onPress={() => pickImageForSlot(slot)}
          disabled={picking || submittingDraft || publishingDraft}>
          <Icon name="images-outline" size={15} color="#2F2926" />
          <Text style={styles.secondaryBtnText}>
            {picking ? '选择中...' : previewUri ? '替换图片' : '选择图片'}
          </Text>
        </Pressable>
        <Pressable
          testID={`my-remove-${slot}-image-button`}
          style={styles.secondaryBtn}
          onPress={() => clearSlot(slot)}
          disabled={!previewUri || submittingDraft || publishingDraft}>
          <Icon name="trash-outline" size={15} color="#2F2926" />
          <Text style={styles.secondaryBtnText}>移除</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderPostImages = (post: ActivityFeedItem) => {
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
        title="我的"
        subtitle="查看个人资料、收藏与浏览记录，也能继续发帖和管理内容"
        variant="editorial"
        overlayStrength="normal"
      />

      <GlassCard style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionIconBadge}>
            <Icon name="person-circle-outline" size={13} color="#A34A3C" />
          </View>
          <Text style={styles.sectionTitle}>个人主页</Text>
        </View>

        {!accountReady ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>尚未登录</Text>
            <Text style={styles.metaText}>请先登录后再查看账号信息、点赞收藏和发帖记录。</Text>
          </View>
        ) : (
          <View style={styles.profileShell}>
            <View style={styles.profileHead}>
              <View style={styles.avatarBadge}>
                <Text style={styles.avatarBadgeText}>
                  {(profile?.displayName || profile?.username || 'V').slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.profileCopy}>
                <View style={styles.profileNameRow}>
                  <Text style={styles.profileName}>{profile?.displayName || '加载中...'}</Text>
                  <View style={styles.tierBadge}>
                    <Text style={styles.tierBadgeText}>
                      {profile?.tier?.includes('Pro') ? 'PRO' : 'USER'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.profileMeta}>{profileHeaderText}</Text>
                <Text style={styles.profileMeta}>
                  社区通知：{settings?.communityNotify ? '已开启' : '已关闭'}
                </Text>
              </View>
              <Pressable style={styles.inlineRefreshBtn} onPress={refreshAll}>
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
              <BentoCard style={styles.bentoHalf} title="已发布" value={stats?.communityPostsCount ?? 0} />
              <BentoCard style={styles.bentoHalf} title="最近点赞" value={likedPosts.length} />
              <BentoCard style={styles.bentoHalf} title="最近收藏" value={savedPosts.length} />
              <BentoCard style={styles.bentoHalf} title="历史记录" value={historyPosts.length} />
            </View>
          </View>
        )}
      </GlassCard>

      <GlassCard style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionIconBadge}>
            <Icon name="grid-outline" size={13} color="#A34A3C" />
          </View>
          <Text style={styles.sectionTitle}>快捷入口</Text>
        </View>
        <View style={styles.quickActionRow}>
          {QUICK_ACTIONS.map(item => (
            <BentoCard
              key={item.key}
              style={styles.bentoHalf}
              title={item.label}
              caption={activeMode === item.key ? '当前查看中' : '点击切换'}
              icon={<Icon name={item.icon} size={18} color={activeMode === item.key ? semanticColors.accent.primary : semanticColors.text.secondary} />}
            >
              <Pressable style={[styles.quickActionCard, activeMode === item.key && styles.quickActionCardActive]} onPress={() => setActiveMode(item.key)}>
                <Text style={styles.quickActionLabel}>{item.label}</Text>
              </Pressable>
            </BentoCard>
          ))}
        </View>
      </GlassCard>

      <GlassCard style={styles.card}>
        <View style={styles.topControlRow}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionIconBadge}>
              <Icon
                name={
                  activeMode === 'history'
                    ? 'time-outline'
                    : activeMode === 'saved'
                      ? 'star-outline'
                      : activeMode === 'liked'
                        ? 'heart-outline'
                        : 'albums-outline'
                }
                size={13}
                color="#A34A3C"
              />
            </View>
            <Text style={styles.sectionTitle}>{activityTitle}</Text>
          </View>
          <Pressable style={styles.inlineRefreshBtn} onPress={loadMyActivity}>
            <Icon name="sync-outline" size={15} color="#2F2926" />
          </Pressable>
        </View>

        <Text style={styles.metaText}>
          {activeMode === 'history'
            ? '这里会记录你最近浏览过的社区帖子。'
            : activeMode === 'saved'
              ? '收藏过的帖子会集中展示在这里。'
              : activeMode === 'liked'
                ? '你最近点赞过的帖子会出现在这里。'
                : '这里展示你已经公开发布到社区的内容。'}
        </Text>

        {loadingActivity ? <Text style={styles.metaText}>加载中...</Text> : null}
        {!loadingActivity && activityItems.length === 0 ? (
          <Text style={styles.metaText}>{activityEmptyText}</Text>
        ) : null}

        {activityItems.map(item => (
          <View key={`${activeMode}-${item.id}`} style={styles.activityListWrap}>
            <ListRow
              title={item.title}
              subtitle={
                activeMode === 'history'
                  ? `最近浏览 ${'viewedAt' in item ? item.viewedAt : item.updatedAt}`
                  : activeMode === 'liked'
                    ? `来自 ${item.author.name || '社区作者'}`
                    : activeMode === 'saved'
                      ? `收藏自 ${item.author.name || '社区作者'}`
                      : `发布时间 ${item.updatedAt}`
              }
              trailingText={
                activeMode === 'history'
                  ? '记录'
                  : activeMode === 'liked'
                    ? '点赞'
                    : activeMode === 'saved'
                      ? '收藏'
                      : '发布'
              }
            />
            <View style={styles.activityCard}>
              <Text numberOfLines={2} style={styles.postContent}>
                {item.content}
              </Text>
              {renderPostImages(item)}
              <View style={styles.tagRow}>
                {(item.tags || []).map(tag => (
                  <Text key={`${item.id}-${tag}`} style={styles.tag}>
                    #{tag}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        ))}
      </GlassCard>

      <GlassCard style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionIconBadge}>
            <Icon name="create-outline" size={13} color="#A34A3C" />
          </View>
          <Text style={styles.sectionTitle}>发帖管理</Text>
        </View>
        <Text style={styles.metaText}>
          在这里保存草稿、继续编辑，并将内容发布到社区动态。支持单图或 before/after 双图发布。
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

        <View style={styles.imageSlotGrid}>
          {renderImageSlot('before', '前图（可选）', beforePreviewUri, beforePicker.isLoading)}
          {renderImageSlot('after', '后图（可选）', afterPreviewUri, afterPicker.isLoading)}
        </View>

        <View style={styles.actionRow}>
          <PrimaryButton
            testID="my-save-draft-button"
            label={submittingDraft ? '保存中...' : saveDraftText}
            onPress={saveDraft}
            disabled={submittingDraft || uploadingSlot !== ''}
            icon={<Icon name="save-outline" size={15} color="#FFFFFF" />}
          />
          <PrimaryButton
            testID="my-publish-draft-button"
            label={publishingDraft ? '发布中...' : '发布到社区'}
            onPress={publishDraft}
            disabled={publishingDraft || uploadingSlot !== ''}
            variant="secondary"
            icon={<Icon name="paper-plane-outline" size={15} color={semanticColors.text.primary} />}
          />
        </View>

        <View style={styles.actionRow}>
          <Pressable style={styles.secondaryBtn} onPress={resetDraftForm}>
            <Icon name="refresh-outline" size={15} color="#2F2926" />
            <Text style={styles.secondaryBtnText}>清空</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={loadMyPosts} disabled={loadingPosts}>
            <Icon name="sync-outline" size={15} color="#2F2926" />
            <Text style={styles.secondaryBtnText}>{loadingPosts ? '刷新中...' : '刷新列表'}</Text>
          </Pressable>
        </View>
      </GlassCard>

      <GlassCard style={styles.card}>
        <View style={styles.topControlRow}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionIconBadge}>
              <Icon name="document-text-outline" size={13} color="#A34A3C" />
            </View>
            <Text style={styles.sectionTitle}>我的草稿</Text>
          </View>
          <View style={styles.pillBadge}>
            <Text style={styles.pillBadgeText}>{drafts.length}</Text>
          </View>
        </View>

        {loadingPosts ? <Text style={styles.metaText}>加载中...</Text> : null}
        {!loadingPosts && drafts.length === 0 ? (
          <Text style={styles.metaText}>还没有草稿，先写一篇吧。</Text>
        ) : null}

        {drafts.map(post => (
          <View key={post.id} style={styles.activityListWrap}>
            <ListRow
              title={post.title}
              subtitle={`草稿 · 更新时间 ${post.updatedAt}`}
              trailingText="编辑"
              onPress={() => fillDraftForm(post)}
            />
            <View style={styles.activityCard}>
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
            </View>
          </View>
        ))}
      </GlassCard>

      {errorText ? (
        <GlassCard style={styles.card}>
          <Text style={styles.errorText}>错误: {errorText}</Text>
        </GlassCard>
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
    flexShrink: 1,
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
  profileShell: {
    ...canvasUi.subtleCard,
    borderRadius: 18,
    padding: 12,
    gap: 14,
  },
  profileHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarBadge: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#A34A3C',
  },
  avatarBadgeText: {
    ...canvasText.bodyStrong,
    color: '#FFF6F2',
    fontSize: 22,
  },
  profileCopy: {
    flex: 1,
    gap: 4,
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  profileName: {
    ...canvasText.sectionTitle,
    color: '#2F2926',
    flexShrink: 1,
  },
  tierBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FFE5D8',
  },
  tierBadgeText: {
    ...canvasText.caption,
    color: '#A34A3C',
    fontSize: 10,
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
    flexWrap: 'wrap',
    gap: 8,
  },
  bentoHalf: {
    width: '48%',
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
  quickActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickActionCard: {
    minHeight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionCardActive: {
    opacity: 1,
  },
  quickActionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(250,233,225,0.9)',
  },
  quickActionLabel: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
    fontSize: 14,
  },
  topControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
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
  imageSlotGrid: {
    gap: 10,
  },
  imageSlotCard: {
    ...canvasUi.subtleCard,
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  imageSlotHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  imageSlotLabel: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
  },
  imageSlotMeta: {
    ...canvasText.caption,
    color: '#A34A3C',
  },
  imagePlaceholder: {
    height: 120,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(171,129,110,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,250,246,0.72)',
  },
  imagePlaceholderText: {
    ...canvasText.bodyMuted,
    color: 'rgba(110,90,80,0.82)',
  },
  imagePreview: {
    width: '100%',
    height: 140,
    borderRadius: 14,
    backgroundColor: 'rgba(243,233,227,0.9)',
  },
  imageSlotActions: {
    flexDirection: 'row',
    gap: 10,
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
  activityCard: {
    ...canvasUi.subtleCard,
    borderRadius: 20,
    padding: 12,
    gap: 8,
  },
  activityListWrap: {
    gap: 8,
  },
  postCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  postTextWrap: {
    flex: 1,
    gap: 4,
  },
  postTitle: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
  },
  postMeta: {
    ...canvasText.caption,
    color: 'rgba(110,90,80,0.82)',
  },
  activityBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(244,221,210,0.95)',
  },
  activityBadgeText: {
    ...canvasText.caption,
    color: '#A34A3C',
  },
  postContent: {
    ...canvasText.body,
    color: '#4B403A',
    lineHeight: 20,
  },
  postImageStrip: {
    flexDirection: 'row',
    gap: 8,
  },
  postImage: {
    flex: 1,
    height: 110,
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
    color: '#A34A3C',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(244,221,210,0.95)',
  },
  postMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  postMetricText: {
    ...canvasText.caption,
    color: 'rgba(110,90,80,0.82)',
  },
  pillBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(250,233,225,0.9)',
    paddingHorizontal: 8,
  },
  pillBadgeText: {
    ...canvasText.bodyStrong,
    color: '#A34A3C',
    fontSize: 13,
  },
  metaText: {
    ...canvasText.bodyMuted,
    color: 'rgba(110,90,80,0.82)',
  },
  errorText: {
    ...canvasText.body,
    color: '#B24A57',
  },
});
