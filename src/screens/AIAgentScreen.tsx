import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {
  Bubble,
  GiftedChat,
  InputToolbar,
  Send,
  type IMessage,
} from 'react-native-gifted-chat';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  AIStatusBadge,
  LiquidCard,
  LiquidFloatingBar,
  LiquidSuggestionTile,
  PrimaryButton,
  StatusStrip,
  TagPill,
} from '../components/design';
import {useAgentRuntime} from '../agent/runtimeContext';
import {useAppStore} from '../store/appStore';
import {VISION_THEME} from '../theme/visionTheme';
import type {ConversationMessage} from '../types/conversation';

const CHAT_USER = {_id: 'user', name: '你'} as const;
const CHAT_ASSISTANT = {_id: 'assistant', name: 'AI 助手'} as const;

const QUICK_TASKS = [
  {
    key: 'grade',
    label: '调色建议',
    icon: 'color-filter-outline',
    prompt: '请给我当前作品的自动调色建议',
  },
  {
    key: 'publish',
    label: '发布文案',
    icon: 'newspaper-outline',
    prompt: '帮我把当前进度整理成发布文案',
  },
  {
    key: 'compose',
    label: '构图提示',
    icon: 'aperture-outline',
    prompt: '给我一组拍摄构图提示',
  },
  {
    key: 'continue',
    label: '继续任务',
    icon: 'play-forward-outline',
    prompt: '继续上次未完成任务',
  },
] as const;

const SUGGESTIONS = [
  {
    title: '当前页自动优化',
    subtitle: '分析当前上下文后执行可回退的首轮优化。',
    goal: '根据当前页面状态给出并执行自动优化步骤',
  },
  {
    title: '作品发布方案',
    subtitle: '生成草稿结构与标签建议，适配社区发布。',
    goal: '请给我当前作品的发布草稿和标签建议',
  },
] as const;

const toGiftedMessage = (item: ConversationMessage): IMessage => ({
  _id: item.id,
  text: item.content,
  createdAt: new Date(item.timestamp),
  user: item.role === 'user' ? CHAT_USER : CHAT_ASSISTANT,
  system: item.role === 'system',
  pending: item.state === 'thinking',
});

const phaseTone = (phase: string): 'active' | 'warning' | 'idle' => {
  if (phase === 'pending_confirm' || phase === 'failed') {
    return 'warning';
  }
  if (phase === 'idle') {
    return 'idle';
  }
  return 'active';
};

export const AIAgentScreen: React.FC = () => {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const {
    phase,
    pendingActions,
    memory,
    lastReasoning,
    lastMessage,
    lastError,
    submitGoal,
    continueLastTask,
    confirmPendingActions,
    dismissPendingActions,
    runQuickOptimizeCurrentPage,
    openPanel,
  } = useAgentRuntime();
  const conversation = useAppStore(state => state.conversation);
  const pushConversation = useAppStore(state => state.pushConversation);

  const reasoningRef = useRef(lastReasoning);
  const messageRef = useRef(lastMessage);
  const errorRef = useRef(lastError);

  const chatMessages = useMemo(
    () => conversation.slice().reverse().map(toGiftedMessage),
    [conversation],
  );

  const runGoal = useCallback(
    async (goal: string) => {
      const text = goal.trim();
      if (!text) {
        return;
      }
      pushConversation({
        role: 'user',
        content: text,
        state: 'normal',
      });
      setSending(true);
      try {
        await submitGoal(text);
      } finally {
        setSending(false);
      }
    },
    [pushConversation, submitGoal],
  );

  useEffect(() => {
    if (!lastReasoning || lastReasoning === reasoningRef.current) {
      return;
    }
    reasoningRef.current = lastReasoning;
    pushConversation({
      role: 'assistant',
      content: lastReasoning,
      state: 'thinking',
    });
  }, [lastReasoning, pushConversation]);

  useEffect(() => {
    if (!lastMessage || lastMessage === messageRef.current) {
      return;
    }
    messageRef.current = lastMessage;
    pushConversation({
      role: 'assistant',
      content: lastMessage,
      state: 'normal',
    });
  }, [lastMessage, pushConversation]);

  useEffect(() => {
    if (!lastError || lastError === errorRef.current) {
      return;
    }
    errorRef.current = lastError;
    pushConversation({
      role: 'system',
      content: `错误：${lastError}`,
      state: 'error',
    });
  }, [lastError, pushConversation]);

  const onSend = useCallback(
    async (messages: IMessage[] = []) => {
      const first = messages[0];
      if (!first?.text) {
        return;
      }
      setInput('');
      await runGoal(first.text);
    },
    [runGoal],
  );

  const renderChatFooter = useCallback(
    () => (
      <View style={styles.quickTaskWrap}>
        <StatusStrip
          compact
          items={[
            {
              label: sending ? '处理中' : '快捷任务',
              icon: sending ? 'sync-outline' : 'flash-outline',
              tone: sending ? 'warning' : 'active',
              pulse: sending,
            },
          ]}
        />
        <ScrollView
          horizontal
          contentContainerStyle={styles.quickTaskRow}
          showsHorizontalScrollIndicator={false}>
          {QUICK_TASKS.map(item => (
            <TagPill
              key={item.key}
              label={item.label}
              icon={item.icon}
              active={false}
              onPress={() => {
                runGoal(item.prompt).catch(() => undefined);
              }}
            />
          ))}
        </ScrollView>
      </View>
    ),
    [runGoal, sending],
  );

  return (
    <LinearGradient colors={VISION_THEME.gradients.page} style={styles.container}>
      <View style={styles.content}>
        <LiquidCard
          title="AI 助手"
          subtitleMode="hidden"
          preset="crystal"
          statusNode={
            <StatusStrip
              compact
              items={[
                {label: phase, icon: 'pulse-outline', tone: phaseTone(phase)},
                {
                  label: pendingActions.length ? '待确认' : '可执行',
                  icon: 'checkmark-circle-outline',
                  tone: pendingActions.length ? 'warning' : 'active',
                },
              ]}
            />
          }>
          <View style={styles.badges}>
            <AIStatusBadge label={phase} tone={phaseTone(phase)} icon="pulse-outline" animated />
            <AIStatusBadge
              label={`${pendingActions.length}`}
              tone={pendingActions.length ? 'warning' : 'idle'}
              icon="alert-circle-outline"
              animated={pendingActions.length > 0}
            />
            <AIStatusBadge label={`${memory.history.length}`} tone="idle" icon="time-outline" />
          </View>
          <View style={styles.actionRow}>
            <PrimaryButton
              label="优化当前页"
              icon="flash-outline"
              focusPulse
              onPress={() => runQuickOptimizeCurrentPage().catch(() => undefined)}
            />
            <PrimaryButton
              label="继续任务"
              icon="play-forward-outline"
              variant="secondary"
              onPress={() => continueLastTask().catch(() => undefined)}
            />
            <PrimaryButton
              label={pendingActions.length ? '确认待执行' : '打开面板'}
              icon={pendingActions.length ? 'checkmark-done-outline' : 'apps-outline'}
              variant="secondary"
              onPress={() => {
                if (pendingActions.length) {
                  confirmPendingActions().catch(() => undefined);
                  return;
                }
                openPanel();
              }}
            />
            {pendingActions.length ? (
              <PrimaryButton
                label="取消待执行"
                icon="close-circle-outline"
                variant="secondary"
                onPress={dismissPendingActions}
              />
            ) : null}
          </View>
        </LiquidCard>

        <ScrollView
          horizontal
          contentContainerStyle={styles.suggestionRow}
          showsHorizontalScrollIndicator={false}>
          {SUGGESTIONS.map(item => (
            <LiquidSuggestionTile
              key={item.title}
              title={item.title}
              subtitle={item.subtitle}
              onApply={() => runGoal(item.goal).catch(() => undefined)}
            />
          ))}
        </ScrollView>

        <View style={styles.chatWrap}>
          <GiftedChat
            messages={chatMessages}
            user={CHAT_USER}
            text={input}
            onSend={messages => {
              onSend(messages).catch(() => undefined);
            }}
            placeholder="输入任务目标，AI 会自动规划与执行"
            textInputProps={{
              onChangeText: setInput,
              placeholderTextColor: VISION_THEME.text.muted,
              style: styles.composerInput,
            }}
            isSendButtonAlwaysVisible
            isTyping={phase === 'running' || sending}
            scrollToBottom
            renderChatFooter={renderChatFooter}
            renderBubble={props => (
              <Bubble
                {...props}
                wrapperStyle={{
                  left: styles.leftBubble,
                  right: styles.rightBubble,
                }}
                textStyle={{
                  left: styles.leftText,
                  right: styles.rightText,
                }}
              />
            )}
            renderInputToolbar={props => (
              <LiquidFloatingBar style={styles.inputFloating}>
                <InputToolbar
                  {...props}
                  containerStyle={styles.inputToolbar}
                  primaryStyle={styles.inputPrimary}
                />
              </LiquidFloatingBar>
            )}
            renderSend={props => (
              <Send {...props} containerStyle={styles.sendWrap}>
                <View style={styles.sendButton}>
                  <Icon name="send" size={16} color="#EFF6FF" />
                </View>
              </Send>
            )}
          />
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1},
  content: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 12,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionRow: {
    gap: 8,
  },
  suggestionRow: {
    gap: 10,
    paddingRight: 18,
    paddingBottom: 2,
  },
  chatWrap: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(9,15,29,0.72)',
    overflow: 'hidden',
  },
  leftBubble: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    paddingVertical: 7,
  },
  rightBubble: {
    backgroundColor: 'rgba(77,163,255,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(111,231,255,0.38)',
    borderRadius: 18,
    paddingVertical: 7,
  },
  leftText: {
    color: VISION_THEME.text.secondary,
    fontSize: 14,
    lineHeight: 20,
  },
  rightText: {
    color: '#EAF4FF',
    fontSize: 14,
    lineHeight: 20,
  },
  inputToolbar: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(111,231,255,0.2)',
    backgroundColor: 'rgba(11,19,34,0.96)',
    paddingHorizontal: 8,
    paddingTop: 6,
    borderRadius: 18,
    overflow: 'hidden',
  },
  inputFloating: {
    borderRadius: 18,
    marginHorizontal: 8,
    marginBottom: 6,
  },
  inputPrimary: {
    alignItems: 'center',
  },
  composerInput: {
    color: VISION_THEME.text.primary,
    fontSize: 14,
    lineHeight: 20,
  },
  sendWrap: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
    marginBottom: 4,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: VISION_THEME.accent.main,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(111,231,255,0.42)',
  },
  quickTaskWrap: {
    paddingHorizontal: 10,
    paddingBottom: 6,
    gap: 8,
  },
  quickTaskRow: {
    gap: 8,
    paddingRight: 14,
  },
});
