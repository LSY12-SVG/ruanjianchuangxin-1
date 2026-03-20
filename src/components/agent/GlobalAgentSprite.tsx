import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useAgentRuntime} from '../../agent/runtimeContext';
import {
  markRuleIgnored,
  markRuleShown,
  resetRuleIgnored,
  shouldTriggerRule,
} from '../../assistant/frequency';
import {assistantTriggerRules} from '../../assistant/rules';
import {defaultAssistantAvatar} from '../../assistant/avatarCatalog';
import {avatarStateFromUiState, reduceAssistantUiState} from '../../assistant/stateMachine';
import type {AssistantScenePage, AssistantTriggerRule, AssistantUiState} from '../../assistant/types';
import {MOTION_PRESETS} from '../../theme/motion';
import {VISION_THEME} from '../../theme/visionTheme';
import {useAppStore} from '../../store/appStore';
import {AvatarRendererWebView} from './AvatarRendererWebView';
import {GlassCard, PrimaryButton, StatusStrip, TagPill} from '../design';

const CARD_WIDTH = 110;
const CARD_HEIGHT = 142;
const EDGE_GAP = 10;
const BUBBLE_SHOW_MS = 3200;
const IDLE_SLEEP_MS = 28000;

const QUICK_TASKS = [
  {
    id: 'optimize',
    label: '优化这张照片',
    icon: 'sparkles-outline',
    goal: '请执行当前页面首轮 AI 优化建议',
  },
  {
    id: 'shooting',
    label: '给我拍摄建议',
    icon: 'aperture-outline',
    goal: '给我当前场景的构图和光线拍摄建议',
  },
  {
    id: 'style',
    label: '调成温暖电影感',
    icon: 'color-wand-outline',
    goal: '把当前图像调整成温暖电影感风格',
  },
] as const;

const mapToScenePage = (
  activeMainTab: string,
  createRoute: string,
  worksSubPage: string,
): AssistantScenePage => {
  if (activeMainTab === 'create' && createRoute === 'hub') {
    return 'home';
  }
  if (activeMainTab === 'create' && createRoute === 'editor') {
    return 'editor';
  }
  if (activeMainTab === 'works' && worksSubPage === 'library') {
    return 'works';
  }
  return 'works';
};

const matchRule = (
  page: AssistantScenePage,
  trigger: AssistantTriggerRule['trigger'],
): AssistantTriggerRule | null => {
  const now = Date.now();
  const frequency = useAppStore.getState().assistantFrequency;
  const sorted = assistantTriggerRules
    .filter(rule => rule.page === page && rule.trigger === trigger)
    .sort((a, b) => b.priority - a.priority);
  for (const rule of sorted) {
    if (shouldTriggerRule(frequency, now, rule)) {
      return rule;
    }
  }
  return null;
};

export const GlobalAgentSprite: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {width, height} = useWindowDimensions();
  const motionEnabled = useAppStore(state => state.motionEnabled);
  const activeMainTab = useAppStore(state => state.activeMainTab);
  const createRoute = useAppStore(state => state.createRoute);
  const worksSubPage = useAppStore(state => state.worksSubPage);
  const setAssistantFrequency = useAppStore(state => state.setAssistantFrequency);

  const {
    assistantPanelMode,
    lastMessage,
    lastError,
    phase,
    pendingActions,
    goalInput,
    setGoalInput,
    submitGoal,
    runQuickOptimizeCurrentPage,
    continueLastTask,
    confirmPendingActions,
    dismissPendingActions,
    closePanel,
    openAssistantHalfPanel,
    openAssistantFullPanel,
    emitAssistantEvent,
  } = useAgentRuntime();

  const [uiState, setUiState] = useState<AssistantUiState>('S0_hidden');
  const [bubbleText, setBubbleText] = useState('');
  const [activeBubbleRuleId, setActiveBubbleRuleId] = useState<string | null>(null);
  const [webReady, setWebReady] = useState(false);
  const [webFailed, setWebFailed] = useState(false);

  const panelOpacity = useRef(new Animated.Value(0)).current;
  const panelTranslateY = useRef(
    new Animated.Value(MOTION_PRESETS.sheetTransition.fromY || 420),
  ).current;
  const longPressTriggeredRef = useRef(false);

  const position = useRef(
    new Animated.ValueXY({
      x: Math.max(EDGE_GAP, width - CARD_WIDTH - EDGE_GAP),
      y: Math.max(80, height - 320),
    }),
  ).current;

  const page = useMemo(
    () => mapToScenePage(activeMainTab, createRoute, worksSubPage),
    [activeMainTab, createRoute, worksSubPage],
  );

  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPhaseRef = useRef(phase);
  const lastMessageRef = useRef(lastMessage);

  const clearBubbleTimer = () => {
    if (bubbleTimerRef.current) {
      clearTimeout(bubbleTimerRef.current);
      bubbleTimerRef.current = null;
    }
  };

  const dismissBubble = useCallback(
    (asIgnored: boolean, ruleId?: string | null) => {
      clearBubbleTimer();
      if (asIgnored && ruleId) {
        setAssistantFrequency(prev => markRuleIgnored(prev, ruleId));
      }
      setBubbleText('');
      setActiveBubbleRuleId(null);
      setUiState(prev => reduceAssistantUiState(prev, 'auto_reset'));
    },
    [setAssistantFrequency],
  );

  const showRuleBubble = useCallback(
    (rule: AssistantTriggerRule) => {
      const now = Date.now();
      setAssistantFrequency(prev => markRuleShown(prev, rule, now));
      setBubbleText(rule.text);
      setActiveBubbleRuleId(rule.id);
      setUiState(prev => reduceAssistantUiState(prev, 'system_remind'));
      clearBubbleTimer();
      const ruleId = rule.id;
      bubbleTimerRef.current = setTimeout(() => {
        dismissBubble(true, ruleId);
      }, BUBBLE_SHOW_MS);
    },
    [dismissBubble, setAssistantFrequency],
  );

  useEffect(() => {
    setUiState(prev => reduceAssistantUiState(prev, 'app_ready'));
    return () => {
      clearBubbleTimer();
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      if (doneResetTimerRef.current) {
        clearTimeout(doneResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    emitAssistantEvent({
      id: `page_${page}_${Date.now()}`,
      page,
      trigger: 'page_enter',
    });

    const enterRule = matchRule(page, 'page_enter');
    if (enterRule) {
      showRuleBubble(enterRule);
    }

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    idleTimerRef.current = setTimeout(() => {
      const idleRule = matchRule(page, 'idle_timeout');
      if (idleRule) {
        showRuleBubble(idleRule);
      } else {
        setUiState(prev => reduceAssistantUiState(prev, 'auto_sleep'));
      }
    }, 6000);
  }, [emitAssistantEvent, page, showRuleBubble]);

  useEffect(() => {
    if (assistantPanelMode === 'full') {
      setUiState('S6_full');
    } else if (assistantPanelMode === 'half') {
      setUiState('S5_half');
    } else if (uiState === 'S6_full' || uiState === 'S5_half') {
      setUiState('S1_collapsed');
    }
  }, [assistantPanelMode, uiState]);

  useEffect(() => {
    if (phase === 'planned' || phase === 'running') {
      setUiState(prev => reduceAssistantUiState(prev, 'run_start'));
      return;
    }

    if ((phase === 'applied' || phase === 'rolled_back') && phase !== lastPhaseRef.current) {
      setUiState(prev => reduceAssistantUiState(prev, 'run_done'));
      if (doneResetTimerRef.current) {
        clearTimeout(doneResetTimerRef.current);
      }
      doneResetTimerRef.current = setTimeout(() => {
        setUiState('S1_collapsed');
      }, 1400);

      const doneRule = matchRule(page, 'task_completed');
      if (doneRule) {
        showRuleBubble(doneRule);
      }
    }

    if (phase === 'failed' && phase !== lastPhaseRef.current) {
      setUiState(prev => reduceAssistantUiState(prev, 'run_failed'));
    }

    lastPhaseRef.current = phase;
  }, [page, phase, showRuleBubble, uiState]);

  useEffect(() => {
    if (!lastMessage || lastMessage === lastMessageRef.current) {
      return;
    }
    lastMessageRef.current = lastMessage;
    setUiState(prev => reduceAssistantUiState(prev, 'run_message'));
  }, [lastMessage]);

  useEffect(() => {
    if (!lastError) {
      return;
    }
    setUiState('S8_talking');
  }, [lastError]);

  useEffect(() => {
    if (assistantPanelMode === 'full') {
      if (!motionEnabled) {
        panelOpacity.setValue(1);
        panelTranslateY.setValue(0);
        return;
      }
      Animated.parallel([
        Animated.timing(panelOpacity, {
          toValue: 1,
          duration: MOTION_PRESETS.buttonPress.duration,
          useNativeDriver: true,
        }),
        Animated.timing(panelTranslateY, {
          toValue: 0,
          duration: MOTION_PRESETS.sheetTransition.duration,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }
    panelOpacity.setValue(0);
    panelTranslateY.setValue(MOTION_PRESETS.sheetTransition.fromY || 420);
  }, [assistantPanelMode, motionEnabled, panelOpacity, panelTranslateY]);

  useEffect(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    if (uiState !== 'S1_collapsed') {
      return;
    }
    idleTimerRef.current = setTimeout(() => {
      setUiState(prev => reduceAssistantUiState(prev, 'auto_sleep'));
    }, IDLE_SLEEP_MS);
  }, [uiState]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3,
        onPanResponderGrant: () => {
          position.extractOffset();
          position.setValue({x: 0, y: 0});
          setUiState(prev => reduceAssistantUiState(prev, 'user_drag_start'));
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
          setUiState(prev => reduceAssistantUiState(prev, 'user_drag_end'));
        },
      }),
    [height, insets.bottom, insets.top, position, width],
  );

  const avatarState = avatarStateFromUiState(uiState);

  const halfPanelVisible = assistantPanelMode === 'half';
  const fullPanelVisible = assistantPanelMode === 'full';

  const openHalfPanel = useCallback(() => {
    if (activeBubbleRuleId) {
      setAssistantFrequency(prev => resetRuleIgnored(prev, activeBubbleRuleId));
    }
    dismissBubble(false, activeBubbleRuleId);
    openAssistantHalfPanel();
    setUiState(prev => reduceAssistantUiState(prev, 'user_open_half'));
  }, [activeBubbleRuleId, dismissBubble, openAssistantHalfPanel, setAssistantFrequency]);

  const openFullPanel = useCallback(() => {
    dismissBubble(false, activeBubbleRuleId);
    openAssistantFullPanel();
    setUiState(prev => reduceAssistantUiState(prev, 'user_open_full'));
  }, [activeBubbleRuleId, dismissBubble, openAssistantFullPanel]);

  const closeAllPanels = useCallback(() => {
    closePanel();
    setUiState(prev => reduceAssistantUiState(prev, 'user_close'));
  }, [closePanel]);

  const handleAvatarPress = () => {
    if (fullPanelVisible || halfPanelVisible) {
      closeAllPanels();
      return;
    }
    openHalfPanel();
  };

  const stateChipLabel =
    uiState === 'S7_thinking'
      ? '分析中'
      : uiState === 'S8_talking'
        ? '反馈中'
        : uiState === 'S9_done'
          ? '完成'
          : uiState === 'S10_sleep'
            ? '静默'
            : '在线';

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {fullPanelVisible ? (
        <Animated.View style={[styles.fullMask, {opacity: panelOpacity}]}> 
          <Pressable style={StyleSheet.absoluteFill} onPress={closeAllPanels} />
          <Animated.View
            style={[
              styles.fullPanelWrap,
              {
                paddingBottom: insets.bottom + 74,
                transform: [{translateY: panelTranslateY}],
              },
            ]}>
            <GlassCard
              title="AI 创作助手"
              subtitle="我来帮你处理当前画面"
              accent="hero"
              style={styles.fullPanelCard}
              statusNode={
                <StatusStrip
                  compact
                  items={[
                    {label: stateChipLabel, icon: 'sparkles-outline', tone: 'active'},
                    {
                      label: pendingActions.length ? `待确认 ${pendingActions.length}` : '可执行',
                      icon: pendingActions.length ? 'alert-circle-outline' : 'checkmark-circle-outline',
                      tone: pendingActions.length ? 'warning' : 'idle',
                    },
                  ]}
                />
              }>
              <View style={styles.fullHeaderRow}>
                <TagPill label={defaultAssistantAvatar.name} icon="person-circle-outline" active />
                <Pressable onPress={closeAllPanels} style={styles.iconButton}>
                  <Icon name="close-outline" size={18} color={VISION_THEME.text.secondary} />
                </Pressable>
              </View>

              <View style={styles.inputWrap}>
                <View style={styles.inputSurface}>
                  <TextInput
                    value={goalInput}
                    onChangeText={setGoalInput}
                    placeholder="描述你想要的效果"
                    placeholderTextColor={VISION_THEME.text.muted}
                    style={styles.inputText}
                  />
                </View>
                <Pressable
                  style={styles.sendButton}
                  onPress={() => {
                    submitGoal().catch(() => undefined);
                  }}>
                  <LinearGradient
                    colors={VISION_THEME.gradients.cta}
                    start={{x: 0, y: 0}}
                    end={{x: 1, y: 1}}
                    style={styles.sendGradient}>
                    <Icon name="send" size={15} color="#EFF6FF" />
                  </LinearGradient>
                </Pressable>
              </View>

              <View style={styles.quickRow}>
                <PrimaryButton
                  label="优化当前页"
                  icon="flash-outline"
                  style={styles.quickActionButton}
                  onPress={() => runQuickOptimizeCurrentPage().catch(() => undefined)}
                />
                <PrimaryButton
                  label="继续任务"
                  icon="play-forward-outline"
                  variant="secondary"
                  style={styles.quickActionButton}
                  onPress={() => continueLastTask().catch(() => undefined)}
                />
              </View>

              {pendingActions.length ? (
                <View style={styles.pendingRow}>
                  <PrimaryButton
                    label="确认执行"
                    icon="checkmark-done-outline"
                    style={styles.quickActionButton}
                    onPress={() => confirmPendingActions().catch(() => undefined)}
                  />
                  <PrimaryButton
                    label="取消"
                    icon="close-outline"
                    variant="secondary"
                    style={styles.quickActionButton}
                    onPress={dismissPendingActions}
                  />
                </View>
              ) : null}

              {bubbleText ? <Text style={styles.infoText}>{bubbleText}</Text> : null}
              {lastMessage ? <Text style={styles.infoText}>{lastMessage}</Text> : null}
              {lastError ? <Text style={styles.errorText}>{lastError}</Text> : null}
            </GlassCard>
          </Animated.View>
        </Animated.View>
      ) : null}

      {halfPanelVisible ? (
        <View pointerEvents="box-none" style={styles.halfLayer}>
          <View style={styles.halfPanel}>
            <Text style={styles.halfTitle}>晚上好，你想我帮你做什么？</Text>
            <View style={styles.halfActions}>
              {QUICK_TASKS.map(task => (
                <Pressable
                  key={task.id}
                  style={styles.halfAction}
                  onPress={() => {
                    submitGoal(task.goal).catch(() => undefined);
                    openFullPanel();
                  }}>
                  <Icon name={task.icon} size={16} color={VISION_THEME.accent.strong} />
                  <Text style={styles.halfActionText}>{task.label}</Text>
                </Pressable>
              ))}
              <Pressable style={styles.halfAction} onPress={openFullPanel}>
                <Icon name="ellipsis-horizontal" size={16} color={VISION_THEME.accent.strong} />
                <Text style={styles.halfActionText}>更多...</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {bubbleText ? (
        <Pressable style={styles.bubbleWrap} onPress={openHalfPanel}>
          <View style={styles.bubbleSurface}>
            <Text style={styles.bubbleText}>{bubbleText}</Text>
          </View>
        </Pressable>
      ) : null}

      <Animated.View
        style={[
          styles.card,
          {
            transform: [{translateX: position.x}, {translateY: position.y}],
          },
        ]}
        {...panResponder.panHandlers}>
        <Pressable
          style={styles.cardTouch}
          delayLongPress={180}
          onPress={() => {
            if (longPressTriggeredRef.current) {
              longPressTriggeredRef.current = false;
              return;
            }
            handleAvatarPress();
          }}
          onLongPress={() => {
            longPressTriggeredRef.current = true;
            openFullPanel();
          }}>
          <LinearGradient
            colors={VISION_THEME.gradients.card}
            start={{x: 0, y: 0}}
            end={{x: 1, y: 1}}
            style={styles.cardGradient}>
            <View style={styles.avatarWrap}>
              {!webFailed ? (
                <AvatarRendererWebView
                  state={avatarState}
                  onReady={() => setWebReady(true)}
                  onTap={handleAvatarPress}
                  onError={() => setWebFailed(true)}
                />
              ) : (
                <Image
                  source={{uri: defaultAssistantAvatar.thumbnailAssetUri}}
                  style={styles.fallbackAvatar}
                  resizeMode="cover"
                />
              )}
            </View>

            <StatusStrip
              compact
              style={styles.statusBar}
              items={[
                {
                  label: webFailed ? '静态' : webReady ? stateChipLabel : '加载中',
                  icon: webFailed ? 'image-outline' : 'sparkles-outline',
                  tone: webFailed ? 'warning' : 'active',
                  pulse: !webReady,
                },
              ]}
            />
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(111,231,255,0.42)',
    backgroundColor: VISION_THEME.surface.elevated,
    shadowColor: VISION_THEME.accent.main,
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: {width: 0, height: 5},
    elevation: 10,
    overflow: 'hidden',
  },
  cardTouch: {flex: 1},
  cardGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(15,24,40,0.85)',
  },
  avatarWrap: {
    width: 84,
    height: 84,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(7,13,24,0.64)',
  },
  fallbackAvatar: {
    width: '100%',
    height: '100%',
  },
  statusBar: {
    alignSelf: 'center',
  },
  bubbleWrap: {
    position: 'absolute',
    right: 18,
    bottom: 250,
    maxWidth: '72%',
  },
  bubbleSurface: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(136,158,255,0.42)',
    backgroundColor: 'rgba(10,16,31,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  bubbleText: {
    color: '#F5F1EA',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  halfLayer: {
    position: 'absolute',
    right: 12,
    bottom: 96,
    left: 12,
  },
  halfPanel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(111,231,255,0.22)',
    backgroundColor: 'rgba(9,15,29,0.92)',
    padding: 12,
    gap: 10,
  },
  halfTitle: {
    color: VISION_THEME.text.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  halfActions: {
    gap: 8,
  },
  halfAction: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  halfActionText: {
    color: VISION_THEME.text.secondary,
    fontSize: 13,
    fontWeight: '600',
  },
  fullMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,10,18,0.56)',
    justifyContent: 'flex-end',
  },
  fullPanelWrap: {
    paddingHorizontal: 12,
  },
  fullPanelCard: {
    borderRadius: 20,
  },
  fullHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputSurface: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  inputText: {
    color: VISION_THEME.text.secondary,
    fontSize: 13,
    paddingVertical: 0,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  sendGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  quickActionButton: {
    flex: 1,
  },
  infoText: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
    lineHeight: 17,
  },
  errorText: {
    color: VISION_THEME.feedback.danger,
    fontSize: 12,
    lineHeight: 17,
  },
});
