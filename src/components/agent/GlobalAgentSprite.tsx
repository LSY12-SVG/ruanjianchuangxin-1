import React, {useEffect, useMemo, useRef, useState} from 'react';
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
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useAgentRuntime} from '../../agent/runtimeContext';
import {requestRecordAudioPermission, createSpeechRecognizer} from '../../voice/speechRecognizer';
import {VISION_THEME} from '../../theme/visionTheme';

const BUBBLE_SIZE = 58;
const EDGE_GAP = 10;

export const GlobalAgentSprite: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {width, height} = useWindowDimensions();
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
      x: Math.max(EDGE_GAP, width - BUBBLE_SIZE - EDGE_GAP),
      y: Math.max(80, height - 260),
    }),
  ).current;

  const longPressTriggeredRef = useRef(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState('');

  const recognizerRef = useRef(
    createSpeechRecognizer({
      onStart: () => {
        setVoiceHint('语音输入中...');
      },
      onFinal: text => {
        if (!text?.trim()) {
          return;
        }
        setVoiceHint(`识别: ${text}`);
        setGoalInput(text);
        submitGoal(text).catch(() => undefined);
      },
      onError: message => {
        setVoiceHint(message);
      },
      onEnd: () => {
        setIsVoiceListening(false);
      },
    }),
  );

  useEffect(() => {
    return () => {
      recognizerRef.current.destroy().catch(() => undefined);
    };
  }, []);

  const stopVoice = async () => {
    try {
      await recognizerRef.current.stop();
    } catch {
      // ignore
    } finally {
      setIsVoiceListening(false);
    }
  };

  const startVoice = async () => {
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
  };

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
          const currentX = gestureState.moveX;
          const snapRight = currentX > width / 2;
          const targetX = snapRight
            ? width - BUBBLE_SIZE - EDGE_GAP
            : EDGE_GAP;
          const targetY = Math.min(
            Math.max(insets.top + 28, gestureState.moveY - BUBBLE_SIZE / 2),
            height - insets.bottom - BUBBLE_SIZE - 90,
          );
          Animated.spring(position, {
            toValue: {x: targetX, y: targetY},
            useNativeDriver: false,
          }).start();
        },
      }),
    [height, insets.bottom, insets.top, position, width],
  );

  const statusColor =
    spriteState === 'confirm'
      ? '#ffd6a2'
      : spriteState === 'planning'
        ? '#79C9FF'
        : spriteState === 'executing'
          ? '#8be8c8'
          : '#9ab6d0';

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {panelVisible ? (
        <View style={[styles.panelWrap, {paddingBottom: insets.bottom + 70}]}>
          <View style={styles.panelCard}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={styles.panelTitle}>Vision 小精灵</Text>
                <Text style={styles.panelSub}>状态: {phase} · 当前页: {currentTab}</Text>
              </View>
              <TouchableOpacity onPress={closePanel} style={styles.iconButton} activeOpacity={0.85}>
                <Icon name="close-outline" size={18} color={VISION_THEME.text.secondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputWrap}>
              <TextInput
                value={goalInput}
                onChangeText={setGoalInput}
                placeholder="告诉小精灵你要完成什么任务"
                placeholderTextColor={VISION_THEME.text.muted}
                style={styles.input}
              />
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
                <Text style={styles.quickText}>一键优化当前页</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickButton}
                activeOpacity={0.86}
                onPress={() => continueLastTask().catch(() => undefined)}>
                <Text style={styles.quickText}>继续上次任务</Text>
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
          styles.bubble,
          {
            transform: [{translateX: position.x}, {translateY: position.y}],
            borderColor: statusColor,
          },
        ]}
        {...panResponder.panHandlers}>
        <TouchableOpacity
          style={styles.bubbleTouch}
          activeOpacity={0.9}
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
            startVoice().catch(() => undefined);
          }}
          onPressOut={() => {
            if (isVoiceListening) {
              stopVoice().catch(() => undefined);
            }
          }}>
          <View style={[styles.statusDot, {backgroundColor: statusColor}]} />
          <Icon
            name={isVoiceListening ? 'mic' : 'sparkles-outline'}
            size={24}
            color={VISION_THEME.accent.strong}
          />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    backgroundColor: 'rgba(8, 31, 50, 0.95)',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 8,
    overflow: 'hidden',
  },
  bubbleTouch: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  panelWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(3, 12, 20, 0.45)',
    paddingHorizontal: 12,
  },
  panelCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(7, 28, 45, 0.96)',
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
    backgroundColor: 'rgba(14, 49, 77, 0.72)',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(10, 40, 64, 0.86)',
    color: VISION_THEME.text.primary,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: VISION_THEME.accent.strong,
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
    backgroundColor: 'rgba(13, 47, 73, 0.84)',
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
    backgroundColor: 'rgba(79, 57, 32, 0.44)',
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
    color: '#ffb8b8',
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
