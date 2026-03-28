import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {PageHeader} from '../components/ui/PageHeader';
import {GlassCard} from '../components/ui/GlassCard';
import {PrimaryButton} from '../components/ui/PrimaryButton';
import {SegmentedControl} from '../components/ui/SegmentedControl';
import {SoftInput} from '../components/ui/SoftInput';
import {canvasText} from '../theme/canvasDesign';
import {radius} from '../theme/radius';
import {spacing} from '../theme/spacing';
import {gradients, semanticColors} from '../theme/tokens';
import type {AuthFormMode} from '../types/auth';

interface LoginSubmitPayload {
  username: string;
  password: string;
}

interface RegisterSubmitPayload extends LoginSubmitPayload {
  confirmPassword: string;
}

interface AuthScreenProps {
  mode: AuthFormMode;
  submitting: boolean;
  errorMessage: string;
  onSubmitLogin: (payload: LoginSubmitPayload) => void | Promise<void>;
  onSubmitRegister: (payload: RegisterSubmitPayload) => void | Promise<void>;
  onSwitchMode: (mode: AuthFormMode) => void;
}

const normalizeUsername = (value: string): string => value.trim();

export const AuthScreen: React.FC<AuthScreenProps> = ({
  mode,
  submitting,
  errorMessage,
  onSubmitLogin,
  onSubmitRegister,
  onSwitchMode,
}) => {
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    setLocalError('');
    if (mode === 'login') {
      setConfirmPassword('');
      setShowConfirmPassword(false);
    }
  }, [mode]);

  const resolvedError = localError || errorMessage;
  const submitText = submitting
    ? mode === 'login'
      ? '登录中...'
      : '注册中...'
    : mode === 'login'
      ? '登录并进入首页'
      : '注册并进入首页';

  const helperText = useMemo(
    () =>
      mode === 'login'
        ? '当前版本“账号”统一使用用户名登录。'
        : '注册成功后会自动登录，并进入当前创作首页。',
    [mode],
  );

  const clearLocalError = () => {
    if (localError) {
      setLocalError('');
    }
  };

  const handleSubmit = () => {
    clearLocalError();
    const nextUsername = normalizeUsername(username);
    if (!nextUsername || !password) {
      setLocalError('请输入用户名和密码。');
      return;
    }

    if (mode === 'register') {
      if (!confirmPassword) {
        setLocalError('请再次输入确认密码。');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('两次输入的密码不一致，请重新确认。');
        return;
      }
      onSubmitRegister({username: nextUsername, password, confirmPassword});
      return;
    }

    onSubmitLogin({username: nextUsername, password});
  };

  const switchHint = mode === 'login' ? '还没有账号？' : '已经有账号了？';
  const switchLabel = mode === 'login' ? '去注册' : '去登录';

  return (
    <LinearGradient colors={gradients.page} style={styles.root} testID="auth-screen-root">
      <View pointerEvents="none" style={styles.backdrop}>
        <View style={[styles.blurOrb, styles.blurOrbTop]} />
        <View style={[styles.blurOrb, styles.blurOrbBottom]} />
      </View>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: Math.max(insets.top, 24),
              paddingBottom: Math.max(insets.bottom, 28),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <PageHeader
            eyebrow="VisionGenie Account"
            title={mode === 'login' ? '登录' : '注册'}
            subtitle={
              mode === 'login'
                ? '登录后继续创作、建模与 Agent 协作。'
                : '创建新账号后即可直接进入 VisionGenie 首页。'
            }
            badge={
              <LinearGradient colors={gradients.primary} style={styles.heroBadge}>
                <Icon
                  name={mode === 'login' ? 'sparkles-outline' : 'person-add-outline'}
                  size={18}
                  color="#FFFFFF"
                />
              </LinearGradient>
            }
          />

          <GlassCard strong>
            <SegmentedControl
              value={mode}
              onChange={onSwitchMode}
              options={[
                {
                  value: 'login',
                  label: '登录',
                  icon: (
                    <Icon
                      name="log-in-outline"
                      size={16}
                      color={mode === 'login' ? semanticColors.text.primary : semanticColors.text.secondary}
                    />
                  ),
                },
                {
                  value: 'register',
                  label: '注册',
                  icon: (
                    <Icon
                      name="person-add-outline"
                      size={16}
                      color={
                        mode === 'register' ? semanticColors.text.primary : semanticColors.text.secondary
                      }
                    />
                  ),
                },
              ]}
            />

            <View style={styles.introBlock}>
              <View style={styles.introHead}>
                <View style={styles.introBadge}>
                  <Icon
                    name={mode === 'login' ? 'shield-checkmark-outline' : 'sparkles-outline'}
                    size={16}
                    color={semanticColors.accent.primary}
                  />
                </View>
                <View style={styles.introCopy}>
                  <Text style={styles.introTitle}>
                    {mode === 'login' ? '登录账号继续使用 App' : '填写账号信息完成创建'}
                  </Text>
                  <Text style={styles.introSubtitle}>登录后开始创作、建模、Agent 协作与社区体验</Text>
                </View>
              </View>
            </View>

            <View style={styles.formStack}>
              <SoftInput
                testID="auth-username-input"
                label={mode === 'login' ? '用户名或账号' : '用户名'}
                placeholder={mode === 'login' ? '输入用户名 / 账号' : '输入用户名'}
                value={username}
                onChangeText={text => {
                  clearLocalError();
                  setUsername(text);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!submitting}
                returnKeyType="next"
                leftIcon={
                  <Icon name="person-outline" size={18} color={semanticColors.text.secondary} />
                }
              />

              <SoftInput
                testID="auth-password-input"
                label="密码"
                placeholder="输入密码"
                value={password}
                onChangeText={text => {
                  clearLocalError();
                  setPassword(text);
                }}
                secureTextEntry={!showPassword}
                editable={!submitting}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType={mode === 'register' ? 'next' : 'done'}
                leftIcon={<Icon name="lock-closed-outline" size={18} color={semanticColors.text.secondary} />}
                rightAction={
                  <Icon
                    testID="auth-toggle-password"
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={semanticColors.text.secondary}
                    onPress={() => setShowPassword(prev => !prev)}
                  />
                }
              />

              {mode === 'register' ? (
                <SoftInput
                  testID="auth-confirm-password-input"
                  label="确认密码"
                  placeholder="再次输入密码"
                  value={confirmPassword}
                  onChangeText={text => {
                    clearLocalError();
                    setConfirmPassword(text);
                  }}
                  secureTextEntry={!showConfirmPassword}
                  editable={!submitting}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  leftIcon={
                    <Icon name="checkmark-circle-outline" size={18} color={semanticColors.text.secondary} />
                  }
                  rightAction={
                    <Icon
                      testID="auth-toggle-confirm-password"
                      name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={semanticColors.text.secondary}
                      onPress={() => setShowConfirmPassword(prev => !prev)}
                    />
                  }
                />
              ) : (
                <GlassCard style={styles.tipCard} contentStyle={styles.tipCardContent}>
                  <View style={styles.tipRow}>
                    <Icon name="information-circle-outline" size={18} color={semanticColors.accent.primary} />
                    <Text style={styles.tipTitle}>登录提示</Text>
                  </View>
                  <Text style={styles.tipText}>当前版本统一使用用户名登录，登录成功后会直接进入首页。</Text>
                </GlassCard>
              )}
            </View>

            {resolvedError ? (
              <View style={styles.errorRow}>
                <Icon name="alert-circle-outline" size={16} color={semanticColors.feedback.danger} />
                <Text style={styles.errorText}>{resolvedError}</Text>
              </View>
            ) : null}

            <PrimaryButton
              testID="auth-submit-button"
              label={submitText}
              onPress={handleSubmit}
              loading={submitting}
              disabled={submitting}
              icon={<Icon name="arrow-forward-outline" size={17} color="#FFFFFF" />}
            />

            <Text style={styles.helperText}>{helperText}</Text>

            <View style={styles.switchRow}>
              <Text style={styles.switchHint}>{switchHint}</Text>
              <Text
                testID="auth-switch-mode-link"
                style={styles.switchLink}
                onPress={() => onSwitchMode(mode === 'login' ? 'register' : 'login')}>
                {switchLabel}
              </Text>
            </View>

            <Text style={styles.metaText}>继续即表示你同意《用户服务协议》与《隐私政策》</Text>
          </GlassCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

export const AuthBootstrapScreen: React.FC = () => {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient colors={gradients.page} style={styles.root} testID="auth-bootstrap-screen">
      <View pointerEvents="none" style={styles.backdrop}>
        <View style={[styles.blurOrb, styles.blurOrbTop]} />
        <View style={[styles.blurOrb, styles.blurOrbBottom]} />
      </View>
      <View
        style={[
          styles.bootstrapWrap,
          {
            paddingTop: Math.max(insets.top, 24),
            paddingBottom: Math.max(insets.bottom, 28),
          },
        ]}>
        <PageHeader eyebrow="Sync" title="正在恢复登录状态" subtitle="马上进入 VisionGenie 首页" />
        <GlassCard strong>
          <View style={styles.bootstrapCard}>
            <ActivityIndicator size="small" color={semanticColors.accent.primary} />
            <Text style={styles.bootstrapTitle}>鉴权恢复中</Text>
            <Text style={styles.bootstrapText}>正在检查本地登录状态，请稍候...</Text>
          </View>
        </GlassCard>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  keyboardWrap: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  blurOrb: {
    position: 'absolute',
    borderRadius: radius.pill,
  },
  blurOrbTop: {
    width: 300,
    height: 300,
    right: -80,
    top: -60,
    backgroundColor: 'rgba(99,102,241,0.12)',
  },
  blurOrbBottom: {
    width: 260,
    height: 260,
    left: -90,
    bottom: '12%',
    backgroundColor: 'rgba(56,189,248,0.12)',
  },
  heroBadge: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introBlock: {
    borderRadius: radius.md,
    backgroundColor: 'rgba(248,250,252,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.92)',
    padding: spacing.md,
  },
  introHead: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  introBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(79,70,229,0.08)',
  },
  introCopy: {
    flex: 1,
    gap: 2,
  },
  introTitle: {
    ...canvasText.sectionTitle,
    color: semanticColors.text.primary,
  },
  introSubtitle: {
    ...canvasText.bodyMuted,
    color: semanticColors.text.secondary,
  },
  formStack: {
    gap: spacing.md,
  },
  tipCard: {
    backgroundColor: 'rgba(248,250,252,0.92)',
  },
  tipCardContent: {
    gap: spacing.xs,
    padding: spacing.md,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tipTitle: {
    ...canvasText.bodyStrong,
    color: semanticColors.text.primary,
  },
  tipText: {
    ...canvasText.bodyMuted,
    color: semanticColors.text.secondary,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(255,241,242,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(251,207,232,0.8)',
  },
  errorText: {
    ...canvasText.bodyMuted,
    color: semanticColors.feedback.danger,
    flex: 1,
  },
  helperText: {
    ...canvasText.bodyMuted,
    color: semanticColors.text.secondary,
    textAlign: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  switchHint: {
    ...canvasText.bodyMuted,
    color: semanticColors.text.secondary,
  },
  switchLink: {
    ...canvasText.bodyStrong,
    color: semanticColors.accent.primary,
  },
  metaText: {
    ...canvasText.bodyMuted,
    color: semanticColors.text.secondary,
    textAlign: 'center',
  },
  bootstrapWrap: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  bootstrapCard: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  bootstrapTitle: {
    ...canvasText.sectionTitle,
    color: semanticColors.text.primary,
  },
  bootstrapText: {
    ...canvasText.body,
    color: semanticColors.text.secondary,
  },
});
