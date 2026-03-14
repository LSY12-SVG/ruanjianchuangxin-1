import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import {VISION_THEME} from '../theme/visionTheme';
import {TopSegment} from '../components/ui/TopSegment';
import {
  ProfileApiError,
  clearAuthToken,
  fetchMyProfile,
  hasAuthToken,
  login,
  register,
  restoreAuthToken,
  updateMyProfile,
  updateMySettings,
  type MyProfileResponse,
} from '../profile/api';
import {useMyProfileQuery} from '../hooks/queries/useMyProfileQuery';

interface AgentActionResult {
  ok: boolean;
  message: string;
}

interface SettingsPatch {
  syncOnWifi?: boolean;
  communityNotify?: boolean;
  voiceAutoApply?: boolean;
}

export interface ProfileSettingsAgentBridge {
  applyPatch: (patch: SettingsPatch) => Promise<AgentActionResult>;
  getSnapshot: () => SettingsPatch;
}

interface ProfileSettingsScreenProps {
  onAgentBridgeReady?: (bridge: ProfileSettingsAgentBridge | null) => void;
}

type AuthMode = 'login' | 'register';

const defaultSettings: MyProfileResponse['settings'] = {
  syncOnWifi: true,
  communityNotify: true,
  voiceAutoApply: true,
};

const defaultProfile: MyProfileResponse['profile'] = {
  id: '',
  username: '',
  displayName: '',
  avatarUrl: '',
  tier: 'Vision Creator · Pro',
};

const defaultStats: MyProfileResponse['stats'] = {
  modelTasksCount: 0,
  communityPostsCount: 0,
};

export const ProfileSettingsScreen: React.FC<ProfileSettingsScreenProps> = ({
  onAgentBridgeReady,
}) => {
  const [segment, setSegment] = useState<'account' | 'profile' | 'prefs'>('account');
  const [booting, setBooting] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');

  const [profile, setProfile] = useState<MyProfileResponse['profile']>(defaultProfile);
  const [settings, setSettings] = useState<MyProfileResponse['settings']>(defaultSettings);
  const [stats, setStats] = useState<MyProfileResponse['stats']>(defaultStats);
  const [agentNote, setAgentNote] = useState('');
  const [apiError, setApiError] = useState('');

  const [editDisplayName, setEditDisplayName] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editTier, setEditTier] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const profileQuery = useMyProfileQuery();

  const authenticated = useMemo(() => Boolean(profile.id) && hasAuthToken(), [profile.id]);

  const syncFromResponse = useCallback((payload: MyProfileResponse) => {
    setProfile(payload.profile);
    setSettings(payload.settings);
    setStats(payload.stats);
    setEditDisplayName(payload.profile.displayName || '');
    setEditAvatarUrl(payload.profile.avatarUrl || '');
    setEditTier(payload.profile.tier || 'Vision Creator · Pro');
  }, []);

  const loadMyProfile = useCallback(async () => {
    setLoadingProfile(true);
    setApiError('');
    try {
      const payload = await fetchMyProfile();
      syncFromResponse(payload);
    } catch (error) {
      if (error instanceof ProfileApiError && error.code === 'unauthorized') {
        await clearAuthToken();
        setProfile(defaultProfile);
      } else {
        setApiError(error instanceof Error ? error.message : 'profile_load_failed');
      }
    } finally {
      setLoadingProfile(false);
    }
  }, [syncFromResponse]);

  useEffect(() => {
    if (profileQuery.data) {
      syncFromResponse(profileQuery.data);
    }
  }, [profileQuery.data, syncFromResponse]);

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      try {
        await restoreAuthToken();
        if (active && hasAuthToken()) {
          await loadMyProfile();
        }
      } finally {
        if (active) {
          setBooting(false);
        }
      }
    };
    bootstrap().catch(() => {
      setBooting(false);
    });
    return () => {
      active = false;
    };
  }, [loadMyProfile]);

  const submitAuth = useCallback(async (): Promise<void> => {
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedPassword = password.trim();
    if (!normalizedUsername || !normalizedPassword) {
      setAuthError('请输入用户名和密码');
      return;
    }
    setAuthSubmitting(true);
    setAuthError('');
    try {
      if (authMode === 'register') {
        await register({username: normalizedUsername, password: normalizedPassword});
      } else {
        await login({username: normalizedUsername, password: normalizedPassword});
      }
      await loadMyProfile();
      setPassword('');
    } catch (error) {
      const code =
        error instanceof ProfileApiError
          ? error.code
          : error instanceof Error
            ? error.message
            : 'auth_failed';
      if (code === 'username_taken') {
        setAuthError('用户名已存在');
      } else if (code === 'invalid_credentials') {
        setAuthError('用户名或密码错误');
      } else if (code === 'validation_failed') {
        setAuthError('参数格式错误');
      } else {
        setAuthError(code);
      }
    } finally {
      setAuthSubmitting(false);
    }
  }, [authMode, loadMyProfile, password, username]);

  const applySettingPatch = useCallback(
    async (patch: SettingsPatch): Promise<AgentActionResult> => {
      if (!authenticated) {
        return {ok: false, message: '请先登录'};
      }

      const previous = settings;
      const optimistic = {
        ...settings,
        ...patch,
      };
      setSettings(optimistic);
      setApiError('');

      try {
        const updated = await updateMySettings(patch);
        setSettings(updated);
        return {ok: true, message: '设置已更新'};
      } catch (error) {
        setSettings(previous);
        const message = error instanceof Error ? error.message : 'settings_update_failed';
        setApiError(message);
        return {ok: false, message};
      }
    },
    [authenticated, settings],
  );

  const submitProfilePatch = useCallback(async () => {
    if (!authenticated) {
      return;
    }
    setSavingProfile(true);
    setApiError('');
    try {
      const updated = await updateMyProfile({
        displayName: editDisplayName.trim(),
        avatarUrl: editAvatarUrl.trim(),
        tier: editTier.trim(),
      });
      setProfile(updated);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'profile_update_failed');
    } finally {
      setSavingProfile(false);
    }
  }, [authenticated, editAvatarUrl, editDisplayName, editTier]);

  const logout = useCallback(async () => {
    await clearAuthToken();
    setProfile(defaultProfile);
    setSettings(defaultSettings);
    setStats(defaultStats);
    setUsername('');
    setPassword('');
    setAuthError('');
    setApiError('');
  }, []);

  useEffect(() => {
    if (!onAgentBridgeReady) {
      return;
    }

    onAgentBridgeReady({
      applyPatch: async patch => {
        const result = await applySettingPatch(patch);
        if (result.ok) {
          setAgentNote('AI 助手已应用建议设置，可手动再调整。');
        }
        return result;
      },
      getSnapshot: () => ({...settings}),
    });

    return () => onAgentBridgeReady(null);
  }, [applySettingPatch, onAgentBridgeReady, settings]);

  const renderAuthCard = () => (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>账号登录</Text>
      <TextInput
        value={username}
        onChangeText={setUsername}
        placeholder="用户名"
        placeholderTextColor={VISION_THEME.text.muted}
        autoCapitalize="none"
        style={styles.input}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="密码"
        placeholderTextColor={VISION_THEME.text.muted}
        secureTextEntry
        style={styles.input}
      />
      {authError ? <Text style={styles.errorText}>{authError}</Text> : null}
      <View style={styles.authActionRow}>
        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.86}
          disabled={authSubmitting}
          onPress={() => {
            submitAuth().catch(() => undefined);
          }}>
          {authSubmitting ? (
            <ActivityIndicator size="small" color={VISION_THEME.accent.dark} />
          ) : (
            <Text style={styles.primaryButtonText}>
              {authMode === 'login' ? '登录' : '注册并登录'}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.86}
          onPress={() => {
            setAuthMode(prev => (prev === 'login' ? 'register' : 'login'));
            setAuthError('');
          }}>
          <Text style={styles.secondaryButtonText}>
            {authMode === 'login' ? '切换到注册' : '切换到登录'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <LinearGradient
      colors={[
        VISION_THEME.background.top,
        VISION_THEME.background.mid,
        VISION_THEME.background.bottom,
      ]}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TopSegment
          value={segment}
          onValueChange={value => setSegment(value as 'account' | 'profile' | 'prefs')}
          items={[
            {value: 'account', label: '账号'},
            {value: 'profile', label: '资料'},
            {value: 'prefs', label: '偏好'},
          ]}
        />
        {booting ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color={VISION_THEME.accent.main} />
            <Text style={styles.loadingText}>加载账号状态...</Text>
          </View>
        ) : null}

        {!booting && !authenticated ? renderAuthCard() : null}

        {authenticated ? (
          <>
            <View style={styles.profileCard}>
              <View style={styles.avatar}>
                <Icon name="person" size={24} color={VISION_THEME.accent.main} />
              </View>
              <View style={styles.profileMeta}>
                <Text style={styles.profileName}>{profile.displayName || profile.username}</Text>
                <Text style={styles.profileId}>{profile.tier}</Text>
                <Text style={styles.profileInfo}>
                  模型任务 {stats.modelTasksCount} · 社区发布 {stats.communityPostsCount}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.editButton}
                activeOpacity={0.86}
                onPress={() => {
                  submitProfilePatch().catch(() => undefined);
                }}>
                {savingProfile ? (
                  <ActivityIndicator size="small" color={VISION_THEME.accent.main} />
                ) : (
                  <Icon
                    name="create-outline"
                    size={16}
                    color={VISION_THEME.accent.strong}
                  />
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.block}>
              <Text style={styles.blockTitle}>资料编辑</Text>
              <TextInput
                value={editDisplayName}
                onChangeText={setEditDisplayName}
                placeholder="昵称"
                placeholderTextColor={VISION_THEME.text.muted}
                style={styles.input}
              />
              <TextInput
                value={editAvatarUrl}
                onChangeText={setEditAvatarUrl}
                placeholder="头像 URL（可空）"
                placeholderTextColor={VISION_THEME.text.muted}
                autoCapitalize="none"
                style={styles.input}
              />
              <TextInput
                value={editTier}
                onChangeText={setEditTier}
                placeholder="等级文案"
                placeholderTextColor={VISION_THEME.text.muted}
                style={styles.input}
              />
              <TouchableOpacity
                style={styles.primaryButton}
                activeOpacity={0.86}
                disabled={savingProfile}
                onPress={() => {
                  submitProfilePatch().catch(() => undefined);
                }}>
                <Text style={styles.primaryButtonText}>保存资料</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.block}>
              <Text style={styles.blockTitle}>工作流偏好</Text>
              {agentNote ? <Text style={styles.agentNote}>{agentNote}</Text> : null}
              <View style={styles.settingRow}>
                <View>
                  <Text style={styles.settingLabel}>Wi-Fi 下自动同步任务</Text>
                  <Text style={styles.settingHint}>上传原图、模型与调色方案</Text>
                </View>
                <Switch
                  value={settings.syncOnWifi}
                  onValueChange={value => {
                    applySettingPatch({syncOnWifi: value}).catch(() => undefined);
                  }}
                  thumbColor={settings.syncOnWifi ? VISION_THEME.accent.main : '#9ab6d0'}
                  trackColor={{false: 'rgba(255,255,255,0.2)', true: 'rgba(122,201,255,0.34)'}}
                />
              </View>
              <View style={styles.settingRow}>
                <View>
                  <Text style={styles.settingLabel}>社区互动通知</Text>
                  <Text style={styles.settingHint}>点赞、收藏、评论与复用提醒</Text>
                </View>
                <Switch
                  value={settings.communityNotify}
                  onValueChange={value => {
                    applySettingPatch({communityNotify: value}).catch(() => undefined);
                  }}
                  thumbColor={settings.communityNotify ? VISION_THEME.accent.main : '#9ab6d0'}
                  trackColor={{false: 'rgba(255,255,255,0.2)', true: 'rgba(122,201,255,0.34)'}}
                />
              </View>
              <View style={styles.settingRow}>
                <View>
                  <Text style={styles.settingLabel}>语音命令结束后自动应用</Text>
                  <Text style={styles.settingHint}>关闭后改为“识别完成再确认”</Text>
                </View>
                <Switch
                  value={settings.voiceAutoApply}
                  onValueChange={value => {
                    applySettingPatch({voiceAutoApply: value}).catch(() => undefined);
                  }}
                  thumbColor={settings.voiceAutoApply ? VISION_THEME.accent.main : '#9ab6d0'}
                  trackColor={{false: 'rgba(255,255,255,0.2)', true: 'rgba(122,201,255,0.34)'}}
                />
              </View>
            </View>

            <View style={styles.block}>
              <Text style={styles.blockTitle}>账号与服务</Text>
              {loadingProfile ? (
                <ActivityIndicator size="small" color={VISION_THEME.accent.main} />
              ) : null}
              {apiError ? <Text style={styles.errorText}>{apiError}</Text> : null}
              <TouchableOpacity style={styles.menuItem} activeOpacity={0.86}>
                <View style={styles.menuIconWrap}>
                  <Icon name="person-circle-outline" size={16} color={VISION_THEME.accent.main} />
                </View>
                <View style={styles.menuTextWrap}>
                  <Text style={styles.menuLabel}>当前账号</Text>
                  <Text style={styles.menuDetail}>{profile.username}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} activeOpacity={0.86}>
                <View style={styles.menuIconWrap}>
                  <Icon name="stats-chart-outline" size={16} color={VISION_THEME.accent.main} />
                </View>
                <View style={styles.menuTextWrap}>
                  <Text style={styles.menuLabel}>统计来源</Text>
                  <Text style={styles.menuDetail}>模型任务 + 社区发布聚合</Text>
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.logoutButton}
              activeOpacity={0.88}
              onPress={() => {
                logout().catch(() => undefined);
              }}>
              <Icon name="log-out-outline" size={17} color={VISION_THEME.feedback.danger} />
              <Text style={styles.logoutText}>退出登录</Text>
            </TouchableOpacity>
          </>
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
  profileCard: {
    borderRadius: 16,
    backgroundColor: VISION_THEME.surface.base,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    padding: 13,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: VISION_THEME.border.strong,
    backgroundColor: 'rgba(18, 61, 94, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileMeta: {
    flex: 1,
  },
  profileName: {
    color: VISION_THEME.text.primary,
    fontSize: 18,
    fontWeight: '800',
  },
  profileId: {
    marginTop: 2,
    color: VISION_THEME.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  profileInfo: {
    marginTop: 3,
    color: VISION_THEME.text.muted,
    fontSize: 11,
  },
  editButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(18, 58, 89, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: {
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: VISION_THEME.surface.card,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    padding: 11,
  },
  blockTitle: {
    color: VISION_THEME.text.primary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
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
    marginBottom: 8,
  },
  authActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: VISION_THEME.accent.strong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
  },
  primaryButtonText: {
    color: VISION_THEME.accent.dark,
    fontSize: 12,
    fontWeight: '800',
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(10, 37, 58, 0.75)',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: VISION_THEME.accent.main,
    fontSize: 12,
    fontWeight: '700',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  agentNote: {
    marginBottom: 8,
    color: VISION_THEME.accent.strong,
    fontSize: 12,
    fontWeight: '600',
  },
  settingLabel: {
    color: VISION_THEME.text.secondary,
    fontSize: 13,
    fontWeight: '600',
  },
  settingHint: {
    marginTop: 2,
    color: VISION_THEME.text.muted,
    fontSize: 11,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 6,
  },
  menuIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13, 47, 74, 0.72)',
  },
  menuTextWrap: {
    flex: 1,
  },
  menuLabel: {
    color: VISION_THEME.text.secondary,
    fontSize: 13,
    fontWeight: '700',
  },
  menuDetail: {
    marginTop: 2,
    color: VISION_THEME.text.muted,
    fontSize: 11,
  },
  logoutButton: {
    marginTop: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 184, 0.34)',
    backgroundColor: 'rgba(87, 34, 34, 0.36)',
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  logoutText: {
    color: VISION_THEME.feedback.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  errorText: {
    color: '#ffb8b8',
    fontSize: 12,
    marginBottom: 8,
  },
});
