import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LottieView from 'lottie-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useAgentRuntime} from '../../agent/runtimeContext';
import {requestRecordAudioPermission, createSpeechRecognizer} from '../../voice/speechRecognizer';
import {VISION_THEME} from '../../theme/visionTheme';
import {useAppStore} from '../../store/appStore';

const CARD_WIDTH = 88;
const CARD_HEIGHT = 106;
const EDGE_GAP = 10;

const stateAnimation = {
  idle: require('../../assets/lottie/assistant_idle.json'),
  planning: require('../../assets/lottie/assistant_thinking.json'),
  executing: require('../../assets/lottie/assistant_thinking.json'),
  confirm: require('../../assets/lottie/assistant_confirm.json'),
} as const;

export const GlobalAgentSprite: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {width, height} = useWindowDimensions();
  const pushConversation = useAppStore(state => state.pushConversation);
  const activeMainTab = useAppStore(state => state.activeMainTab);
  const homeRoute = useAppStore(state => state.homeRoute);
  const {
    panelVisible,
    togglePanel,
    closePanel,
    spriteState,
    phase,
    goalInput,
    setGoalInput,
    submitGoal,
    runQuickOptimizeCurrentPage,
    continueLastTask,
    pendingActions,
    confirmPendingActions,
    dismissPendingActions,
    undoLastExecution,
    latestPlan,
    lastReasoning,
    lastError,
    lastMessage,
    currentTab,
  } = useAgentRuntime();

  const position = useRef(
    new Animated.ValueXY({
      x: Math.max(EDGE_GAP, width - CARD_WIDTH - EDGE_GAP),
      y: Math.max(80, height - 300),
    }),
  ).current;

  const longPressTriggeredRef = useRef(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState('');
  const isVoiceDisabledInGrading = activeMainTab === 'home' && homeRoute === 'grading';

  const recognizerRef = useRef(
    createSpeechRecognizer({
      onStart: () => {
        setVoiceHint('正在聆听你的指令...');
        pushConversation({role: 'system', content: '语音输入开始', state: 'listening'});
      },
      onFinal: text => {
        if (!text?.trim()) {
          return;
        }
        setVoiceHint(`识别: ${text}`);
        setGoalInput(text);
        pushConversation({role: 'user', content: text, state: 'normal'});
        submitGoal(text)
          .then(() => {
            pushConversation({role: 'assistant', content: '已收到，我正在执行你的目标。', state: 'thinking'});
          })
          .catch(() => undefined);
      },
      onError: message => {
        setVoiceHint(message);
        pushConversation({role: 'system', content: message, state: 'error'});
      },
      onPreempted: () => {
        setIsVoiceListening(false);
        setVoiceHint('全局语音已被调色语音接管');
      },
      onEnd: () => {
        setIsVoiceListening(false);
      },
    }),
  );

  useEffect(() => {
    const recognizer = recognizerRef.current;
    return () => {
      recognizer.destroy().catch(() => undefined);
    };
  }, []);

  const stopVoice = useCallback(async () => {
    try {
      await recognizerRef.current.stop();
    } catch {
      // ignore
    } finally {
      setIsVoiceListening(false);
    }
  }, []);

  const startVoice = useCallback(async () => {
    if (isVoiceDisabledInGrading) {
      setVoiceHint('当前在调色页，请使用调色面板内语音按钮。');
      return;
    }
    const granted = await requestRecordAudioPermission();
    if (!granted) {
      setVoiceHint('缺少录音权限');
      return;
    }
    setIsVoiceListening(true);
    try {
      await recognizerRef.current.start('zh-CN');
    } catch (error) {
      const message = error instanceof Error ? error.message : '语音启动失败';
      setVoiceHint(message);
      setIsVoiceListening(false);
    }
  }, [isVoiceDisabledInGrading]);

  useEffect(() => {
    if (!isVoiceDisabledInGrading || !isVoiceListening) {
      return;
    }
    setVoiceHint('进入调色页，已停止全局语音，避免冲突。');
    stopVoice().catch(() => undefined);
  }, [isVoiceDisabledInGrading, isVoiceListening, stopVoice]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3,
        onPanResponderGrant: () => {
          position.extractOffset();
          position.setValue({x: 0, y: 0});
        },
        onPanResponderMove: Animated.event([null, {dx: position.x, dy: position.y}], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (_event, gestureState) => {
          position.flattenOffset();
          const snapRight = gestureState.moveX > width / 2;
          const targetX = snapRight ? width - CARD_WIDTH - EDGE_GAP : EDGE_GAP;
          const targetY = Math.min(
            Math.max(insets.top + 26, gestureState.moveY - CARD_HEIGHT / 2),
            height - insets.bottom - CARD_HEIGHT - 92,
          );
          Animated.spring(position, {
            toValue: {x: targetX, y: targetY},
            useNativeDriver: false,
            bounciness: 8,
          }).start();
        },
      }),
    [height, insets.bottom, insets.top, position, width],
  );

  const statusColor =
    spriteState === 'confirm'
      ? VISION_THEME.feedback.warning
      : spriteState === 'planning'
        ? VISION_THEME.accent.main
        : spriteState === 'executing'
          ? VISION_THEME.feedback.success
          : VISION_THEME.text.muted;

  const activeAnimation = isVoiceListening
    ? require('../../assets/lottie/assistant_listening.json')
    : stateAnimation[spriteState];

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {panelVisible ? (
        <View style={[styles.panelWrap, {paddingBottom: insets.bottom + 72}]}>
          <View style={styles.panelCard}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={styles.panelTitle}>Anime Assistant</Text>
                <Text style={styles.panelSub}>状态: {phase} · 页面: {currentTab}</Text>
              </View>
              <TouchableOpacity onPress={closePanel} style={styles.iconButton} activeOpacity={0.85}>
                <Icon name="close-outline" size={18} color={VISION_THEME.text.secondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputWrap}>
              <TouchableOpacity
                style={[styles.voiceButton, isVoiceDisabledInGrading && styles.voiceButtonDisabled]}
                onPress={() => startVoice().catch(() => undefined)}
                disabled={isVoiceDisabledInGrading}>
                <Icon name={isVoiceListening ? 'mic' : 'mic-outline'} size={16} color={VISION_THEME.accent.dark} />
              </TouchableOpacity>
              <View style={styles.inputSurface}>
                <TextInput
                  value={goalInput}
                  onChangeText={setGoalInput}
                  placeholder="说出或输入你的目标，然后点击发送"
                  placeholderTextColor={VISION_THEME.text.muted}
                  style={styles.inputText}
                />
              </View>
              <TouchableOpacity
                style={styles.sendButton}
                activeOpacity={0.86}
                onPress={() => {
                  submitGoal().catch(() => undefined);
                }}>
                <Icon name="send" size={15} color={VISION_THEME.accent.dark} />
              </TouchableOpacity>
            </View>

            <View style={styles.quickRow}>
              <TouchableOpacity
                style={styles.quickButton}
                activeOpacity={0.86}
                onPress={() => runQuickOptimizeCurrentPage().catch(() => undefined)}>
                <Text style={styles.quickText}>优化当前页</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickButton}
                activeOpacity={0.86}
                onPress={() => continueLastTask().catch(() => undefined)}>
                <Text style={styles.quickText}>继续任务</Text>
              </TouchableOpacity>
            </View>

            {pendingActions.length > 0 ? (
              <View style={styles.confirmCard}>
                <Text style={styles.confirmTitle}>待确认动作（{pendingActions.length}）</Text>
                {pendingActions.slice(0, 3).map(action => (
                  <Text key={`${action.domain}_${action.operation}`} style={styles.actionText}>
                    {action.domain}.{action.operation}
                  </Text>
                ))}
                <View style={styles.quickRow}>
                  <TouchableOpacity
                    style={styles.confirmButton}
                    onPress={() => confirmPendingActions().catch(() => undefined)}
                    activeOpacity={0.86}>
                    <Text style={styles.confirmButtonText}>确认执行</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={dismissPendingActions}
                    activeOpacity={0.86}>
                    <Text style={styles.cancelButtonText}>取消</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {latestPlan ? <Text style={styles.infoText}>计划: {latestPlan.estimatedSteps} 步</Text> : null}
            {lastReasoning ? <Text style={styles.infoText}>{lastReasoning}</Text> : null}
            {lastMessage ? <Text style={styles.infoText}>{lastMessage}</Text> : null}
            {lastError ? <Text style={styles.errorText}>{lastError}</Text> : null}
            {voiceHint ? <Text style={styles.infoText}>{voiceHint}</Text> : null}

            <TouchableOpacity
              style={styles.undoButton}
              activeOpacity={0.86}
              onPress={() => undoLastExecution().catch(() => undefined)}>
              <Icon name="arrow-undo-outline" size={15} color={VISION_THEME.text.secondary} />
              <Text style={styles.undoText}>撤销最近自动执行</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <Animated.View
        style={[
          styles.card,
          {
            transform: [{translateX: position.x}, {translateY: position.y}],
            borderColor: `${statusColor}AA`,
          },
        ]}
        {...panResponder.panHandlers}>
        <TouchableOpacity
          style={styles.cardTouch}
          activeOpacity={0.92}
          delayLongPress={180}
          onPress={() => {
            if (longPressTriggeredRef.current) {
              longPressTriggeredRef.current = false;
              return;
            }
            togglePanel();
          }}
          onLongPress={() => {
            longPressTriggeredRef.current = true;
            if (isVoiceDisabledInGrading) {
              return;
            }
            startVoice().catch(() => undefined);
          }}
          onPressOut={() => {
            if (isVoiceListening) {
              stopVoice().catch(() => undefined);
            }
          }}>
          <LottieView source={activeAnimation} autoPlay loop style={styles.avatar} />
          <View style={styles.statusBar}>
            <View style={[styles.statusDot, {backgroundColor: statusColor}]} />
            <Text style={styles.statusText}>{isVoiceListening ? '聆听中' : '在线'}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'rgba(34, 10, 19, 0.94)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 10,
    overflow: 'hidden',
  },
  cardTouch: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  avatar: {
    width: 72,
    height: 72,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    color: VISION_THEME.text.secondary,
    fontSize: 10,
    fontWeight: '700',
  },
  panelWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20, 8, 14, 0.6)',
    paddingHorizontal: 12,
  },
  panelCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(45, 13, 24, 0.98)',
    padding: 12,
    gap: 8,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelTitle: {
    color: VISION_THEME.text.primary,
    fontSize: 15,
    fontWeight: '800',
  },
  panelSub: {
    marginTop: 2,
    color: VISION_THEME.text.muted,
    fontSize: 11,
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voiceButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: VISION_THEME.accent.strong,
  },
  voiceButtonDisabled: {
    opacity: 0.5,
  },
  inputSurface: {
    flex: 1,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  inputText: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
    paddingVertical: 0,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: VISION_THEME.accent.main,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    paddingVertical: 8,
  },
  quickText: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
  confirmCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 214, 162, 0.45)',
    backgroundColor: 'rgba(122, 72, 36, 0.28)',
    padding: 9,
    gap: 6,
  },
  confirmTitle: {
    color: '#ffd6a2',
    fontSize: 12,
    fontWeight: '700',
  },
  actionText: {
    color: VISION_THEME.text.secondary,
    fontSize: 11,
  },
  confirmButton: {
    flex: 1,
    borderRadius: 9,
    backgroundColor: '#ffd6a2',
    alignItems: 'center',
    paddingVertical: 7,
  },
  confirmButtonText: {
    color: '#402612',
    fontWeight: '800',
    fontSize: 12,
  },
  cancelButton: {
    flex: 1,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    alignItems: 'center',
    paddingVertical: 7,
  },
  cancelButtonText: {
    color: VISION_THEME.text.secondary,
    fontWeight: '700',
    fontSize: 12,
  },
  infoText: {
    color: VISION_THEME.text.secondary,
    fontSize: 11,
    lineHeight: 17,
  },
  errorText: {
    color: VISION_THEME.feedback.danger,
    fontSize: 11,
    lineHeight: 17,
  },
  undoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  undoText: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
});
