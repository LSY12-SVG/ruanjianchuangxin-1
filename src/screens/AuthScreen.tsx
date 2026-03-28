import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {HERO_CREATE} from '../assets/design';
import {PageHero} from '../components/app/PageHero';
import {canvasText, canvasUi, cardSurfaceBlue, glassShadow} from '../theme/canvasDesign';
import {VISION_THEME} from '../theme/visionTheme';
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

const AUTH_SUBTITLE = '登录后开始创作、建模、Agent 协作与社区体验';

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
  const switchHint = mode === 'login' ? '还没有账号？' : '已经有账号了？';
  const switchLabel = mode === 'login' ? '去注册' : '去登录';
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
      onSubmitRegister({
        username: nextUsername,
        password,
        confirmPassword,
      });
      return;
    }

    onSubmitLogin({
      username: nextUsername,
      password,
    });
  };

  return (
    <LinearGradient colors={VISION_THEME.gradients.page} style={styles.root} testID="auth-screen-root">
      <View pointerEvents="none" style={styles.orbLayer}>
        <View style={[styles.orb, styles.orbPrimary]} />
        <View style={[styles.orb, styles.orbAccent]} />
        <View style={[styles.orb, styles.orbWarm]} />
        <View style={styles.textureDots} />
      </View>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: Math.max(insets.top, 20),
              paddingBottom: Math.max(insets.bottom, 28),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.headerBlock}>
            <View style={styles.headerCopy}>
              <View style={styles.brandRow}>
                <View style={styles.brandBadge}>
                  <Icon name="sparkles-outline" size={14} color="#A34A3C" />
                </View>
                <Text style={styles.brandText}>VisionGenie Account</Text>
              </View>
              <View style={styles.titleRow}>
                <Text style={styles.pageTitle}>{mode === 'login' ? '登录' : '注册'}</Text>
                <View style={styles.titleAccentDot} />
              </View>
              <Text style={styles.pageSubtitle}>
                {mode === 'login'
                  ? '登录后继续创作、建模与 Agent 协作。'
                  : '创建新账号后即可直接进入 VisionGenie 首页。'}
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.modeRail}>
              <Pressable
                testID="auth-mode-login"
                onPress={() => onSwitchMode('login')}
                style={[styles.modeBtn, mode === 'login' && styles.modeBtnActive]}
                disabled={submitting}>
                <Icon name="log-in-outline" size={16} color="#3B2F29" />
                <Text style={styles.modeBtnText}>登录</Text>
              </Pressable>
              <Pressable
                testID="auth-mode-register"
                onPress={() => onSwitchMode('register')}
                style={[styles.modeBtn, mode === 'register' && styles.modeBtnActive]}
                disabled={submitting}>
                <Icon name="person-add-outline" size={16} color="#3B2F29" />
                <Text style={styles.modeBtnText}>注册</Text>
              </Pressable>
            </View>

            <View style={styles.formSummary}>
              <View style={styles.sectionHead}>
                <View style={styles.sectionIconBadge}>
                  <Icon
                    name={mode === 'login' ? 'shield-checkmark-outline' : 'sparkles-outline'}
                    size={14}
                    color="#A34A3C"
                  />
                </View>
                <Text style={styles.sectionTitle}>
                  {mode === 'login' ? '登录账号继续使用 App' : '填写账号信息完成创建'}
                </Text>
              </View>
              <Text style={styles.summaryLead}>{AUTH_SUBTITLE}</Text>
            </View>

            <View style={styles.fieldPanel}>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>{mode === 'login' ? '用户名或账号' : '用户名'}</Text>
                <View style={styles.inputLine}>
                  <Icon name="person-outline" size={18} color="rgba(92,74,65,0.72)" />
                  <TextInput
                    testID="auth-username-input"
                    style={styles.lineInput}
                    placeholder={mode === 'login' ? '输入用户名 / 账号' : '输入用户名'}
                    placeholderTextColor="rgba(150,124,110,0.68)"
                    value={username}
                    onChangeText={text => {
                      clearLocalError();
                      setUsername(text);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!submitting}
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>密码</Text>
                <View style={styles.inputLine}>
                  <Icon name="lock-closed-outline" size={18} color="rgba(92,74,65,0.72)" />
                  <TextInput
                    testID="auth-password-input"
                    style={styles.lineInput}
                    placeholder="输入密码"
                    placeholderTextColor="rgba(150,124,110,0.68)"
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
                  />
                  <Pressable
                    testID="auth-toggle-password"
                    style={styles.eyeBtn}
                    onPress={() => setShowPassword(prev => !prev)}
                    disabled={submitting}>
                    <Icon
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color="rgba(92,74,65,0.78)"
                    />
                  </Pressable>
                </View>
              </View>

              {mode === 'register' ? (
                <View style={[styles.fieldRow, styles.fieldRowLast]}>
                  <Text style={styles.fieldLabel}>确认密码</Text>
                  <View style={styles.inputLine}>
                    <Icon name="checkmark-circle-outline" size={18} color="rgba(92,74,65,0.72)" />
                    <TextInput
                      testID="auth-confirm-password-input"
                      style={styles.lineInput}
                      placeholder="再次输入密码"
                      placeholderTextColor="rgba(150,124,110,0.68)"
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
                    />
                    <Pressable
                      testID="auth-toggle-confirm-password"
                      style={styles.eyeBtn}
                      onPress={() => setShowConfirmPassword(prev => !prev)}
                      disabled={submitting}>
                      <Icon
                        name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color="rgba(92,74,65,0.78)"
                      />
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={[styles.assistCard, styles.fieldRowLast]}>
                  <View style={styles.assistCardHead}>
                    <Icon name="information-circle-outline" size={16} color="#A34A3C" />
                    <Text style={styles.assistTitle}>登录提示</Text>
                  </View>
                  <Text style={styles.assistText}>
                    当前版本统一使用用户名登录，登录成功后会直接进入首页。
                  </Text>
                </View>
              )}
            </View>

            {resolvedError ? (
              <View style={styles.errorCard}>
                <Icon name="alert-circle-outline" size={16} color={VISION_THEME.feedback.danger} />
                <Text style={styles.errorText}>{resolvedError}</Text>
              </View>
            ) : null}

            <Pressable
              testID="auth-submit-button"
              style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}>
              {submitting ? (
                <ActivityIndicator size="small" color="#FFF6F2" />
              ) : (
                <Icon
                  name={mode === 'login' ? 'arrow-forward-outline' : 'person-add-outline'}
                  size={16}
                  color="#FFF6F2"
                />
              )}
              <Text style={styles.primaryBtnText}>{submitText}</Text>
            </Pressable>

            <View style={styles.bottomNote}>
              <Text style={styles.bottomNoteText}>{helperText}</Text>
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchHint}>{switchHint}</Text>
              <Pressable
                testID="auth-switch-mode-link"
                onPress={() => onSwitchMode(mode === 'login' ? 'register' : 'login')}
                disabled={submitting}>
                <Text style={styles.switchLink}>{switchLabel}</Text>
              </Pressable>
            </View>

            <Text style={styles.metaText}>继续即表示你同意《用户服务协议》与《隐私政策》</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

export const AuthBootstrapScreen: React.FC = () => {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient colors={VISION_THEME.gradients.page} style={styles.root} testID="auth-bootstrap-screen">
      <View pointerEvents="none" style={styles.orbLayer}>
        <View style={[styles.orb, styles.orbPrimary]} />
        <View style={[styles.orb, styles.orbAccent]} />
        <View style={[styles.orb, styles.orbWarm]} />
        <View style={styles.textureDots} />
      </View>
      <View
        style={[
          styles.bootstrapWrap,
          {
            paddingTop: Math.max(insets.top, 18),
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}>
        <PageHero
          image={HERO_CREATE}
          title="正在恢复登录状态"
          subtitle="马上进入 VisionGenie 首页"
          variant="warm"
          overlayStrength="normal"
          height={148}
        />

        <View style={[styles.card, styles.bootstrapCard]}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionIconBadge}>
              <Icon name="sync-outline" size={14} color="#A34A3C" />
            </View>
            <Text style={styles.sectionTitle}>鉴权恢复中</Text>
          </View>
          <ActivityIndicator size="small" color={VISION_THEME.accent.main} />
          <Text style={styles.summaryText}>正在检查本地登录状态，请稍候...</Text>
        </View>
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
    gap: 20,
    paddingHorizontal: 18,
  },
  bootstrapWrap: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 16,
  },
  headerBlock: {
    gap: 10,
    paddingHorizontal: 4,
  },
  headerCopy: {
    gap: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(163,74,60,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(163,74,60,0.14)',
  },
  brandText: {
    ...canvasText.caption,
    color: 'rgba(122,94,82,0.84)',
    letterSpacing: 0.8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  pageTitle: {
    ...canvasText.heroTitle,
    fontSize: 34,
    color: '#2C2623',
  },
  titleAccentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 10,
    backgroundColor: '#C86D5A',
    shadowColor: '#D46C5D',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 2},
  },
  pageSubtitle: {
    ...canvasText.body,
    color: 'rgba(92,74,65,0.82)',
    lineHeight: 20,
    maxWidth: 320,
  },
  card: {
    ...cardSurfaceBlue,
    ...glassShadow,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 16,
  },
  bootstrapCard: {
    alignItems: 'flex-start',
  },
  modeRail: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    borderRadius: 18,
    backgroundColor: 'rgba(244,235,228,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(171,129,110,0.16)',
  },
  modeBtn: {
    ...canvasUi.chip,
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  modeBtnActive: {
    ...canvasUi.chipActive,
    backgroundColor: 'rgba(255,248,244,0.96)',
    borderColor: 'rgba(171,129,110,0.18)',
  },
  modeBtnText: {
    ...canvasText.bodyStrong,
    color: '#3B2F29',
  },
  formSummary: {
    gap: 8,
  },
  sectionHead: {
    ...canvasUi.titleWithIcon,
  },
  sectionIconBadge: {
    ...canvasUi.iconBadge,
  },
  sectionTitle: {
    ...canvasText.sectionTitle,
    color: '#3B2F29',
    flex: 1,
    flexShrink: 1,
    lineHeight: 22,
  },
  summaryLead: {
    ...canvasText.body,
    color: 'rgba(92,74,65,0.76)',
    lineHeight: 18,
  },
  fieldPanel: {
    borderRadius: 22,
    backgroundColor: 'rgba(255,250,246,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(171,129,110,0.2)',
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  fieldRow: {
    gap: 10,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(171,129,110,0.18)',
  },
  fieldRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 14,
  },
  fieldLabel: {
    ...canvasText.bodyStrong,
    color: 'rgba(70,58,52,0.92)',
    letterSpacing: 0.2,
  },
  inputLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lineInput: {
    flex: 1,
    minHeight: 34,
    paddingVertical: 6,
    color: '#3B2F29',
    ...canvasText.body,
  },
  eyeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistCard: {
    gap: 8,
    paddingTop: 16,
  },
  assistCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  assistTitle: {
    ...canvasText.bodyStrong,
    color: '#6E5247',
  },
  assistText: {
    ...canvasText.bodyMuted,
    color: 'rgba(109,90,80,0.8)',
    lineHeight: 20,
    flexShrink: 1,
  },
  errorCard: {
    ...canvasUi.subtleCard,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderColor: 'rgba(195,91,99,0.22)',
    backgroundColor: 'rgba(255,244,244,0.92)',
  },
  errorText: {
    ...canvasText.body,
    flex: 1,
    color: VISION_THEME.feedback.danger,
    lineHeight: 18,
  },
  primaryBtn: {
    ...canvasUi.primaryButton,
    minHeight: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryBtnDisabled: {
    opacity: 0.82,
  },
  primaryBtnText: {
    ...canvasText.bodyStrong,
    color: '#FFF6F2',
  },
  bottomNote: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(171,129,110,0.16)',
    paddingTop: 14,
  },
  bottomNoteText: {
    ...canvasText.bodyMuted,
    color: 'rgba(109,90,80,0.84)',
    textAlign: 'center',
    lineHeight: 18,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  switchHint: {
    ...canvasText.bodyMuted,
    color: 'rgba(109,90,80,0.84)',
  },
  switchLink: {
    ...canvasText.bodyStrong,
    color: '#A34A3C',
  },
  metaText: {
    ...canvasText.bodyMuted,
    color: 'rgba(109,90,80,0.84)',
    textAlign: 'center',
    lineHeight: 18,
  },
  summaryText: {
    ...canvasText.body,
    color: 'rgba(76,64,56,0.9)',
    lineHeight: 18,
  },
  orbLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.14,
  },
  orbPrimary: {
    width: 380,
    height: 380,
    right: -120,
    top: -110,
    backgroundColor: '#D6A08C',
    opacity: 0.2,
  },
  orbAccent: {
    width: 320,
    height: 320,
    left: -130,
    bottom: '22%',
    backgroundColor: '#B05D50',
    opacity: 0.1,
  },
  orbWarm: {
    width: 260,
    height: 260,
    right: 16,
    top: '40%',
    backgroundColor: '#8E3C2F',
    opacity: 0.08,
  },
  textureDots: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.02)',
    opacity: 0.4,
  },
});
