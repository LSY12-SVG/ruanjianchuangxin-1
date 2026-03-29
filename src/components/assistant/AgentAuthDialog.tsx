import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {login} from '../../profile/api';
import {
  resolveAgentLoginPrompt,
  useAgentAuthPromptStore,
} from '../../agent/authPromptStore';
import {canvasText, canvasUi, cardSurfaceWarm, glassShadow} from '../../theme/canvasDesign';
import {VISION_THEME} from '../../theme/visionTheme';

export const AgentAuthDialog: React.FC = () => {
  const visible = useAgentAuthPromptStore(state => state.visible);
  const message = useAgentAuthPromptStore(state => state.message);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    if (!visible) {
      setUsername('');
      setPassword('');
      setSubmitting(false);
      setErrorText('');
    }
  }, [visible]);

  const disabled = useMemo(
    () => submitting || !username.trim() || !password.trim(),
    [password, submitting, username],
  );

  const handleClose = () => {
    if (submitting) {
      return;
    }
    resolveAgentLoginPrompt(false);
  };

  const handleSubmit = async () => {
    if (disabled) {
      return;
    }
    setSubmitting(true);
    setErrorText('');
    try {
      await login({
        username: username.trim(),
        password,
      });
      resolveAgentLoginPrompt(true);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '登录失败，请重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={handleClose} />
        <View style={styles.dialog}>
          <Text style={styles.eyebrow}>Agent 登录续跑</Text>
          <Text style={styles.title}>登录后将继续当前任务</Text>
          <Text style={styles.message}>
            {message || '当前任务需要账号登录。完成登录后，我会自动继续执行工作流。'}
          </Text>
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
          {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.secondaryButton]}
              onPress={handleClose}
              disabled={submitting}>
              <Text style={styles.secondaryButtonText}>稍后再说</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.primaryButton, disabled && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={disabled}>
              {submitting ? (
                <ActivityIndicator size="small" color="#FFF7F1" />
              ) : (
                <Text style={styles.primaryButtonText}>登录并继续</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(36, 24, 18, 0.48)',
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    padding: 20,
    gap: 12,
    ...cardSurfaceWarm,
    ...glassShadow,
  },
  eyebrow: {
    ...canvasText.caption,
    color: VISION_THEME.accent.dark,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    ...canvasText.sectionTitle,
    color: VISION_THEME.text.primary,
  },
  message: {
    ...canvasText.body,
    color: VISION_THEME.text.secondary,
    lineHeight: 18,
  },
  input: {
    ...canvasUi.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: VISION_THEME.text.primary,
    ...canvasText.body,
  },
  errorText: {
    ...canvasText.bodyMuted,
    color: VISION_THEME.feedback.danger,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  button: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primaryButton: {
    ...canvasUi.primaryButton,
  },
  secondaryButton: {
    ...canvasUi.secondaryButton,
  },
  buttonDisabled: {
    opacity: 0.58,
  },
  primaryButtonText: {
    ...canvasText.bodyStrong,
    color: '#FFF7F1',
  },
  secondaryButtonText: {
    ...canvasText.bodyStrong,
    color: VISION_THEME.text.primary,
  },
});
