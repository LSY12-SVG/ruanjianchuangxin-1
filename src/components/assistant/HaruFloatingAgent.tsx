import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {WebView} from 'react-native-webview';
import {markRuleIgnored, markRuleShown, shouldTriggerRule} from '../../assistant/frequency';
import {type FloatingAssistantTab} from '../../assistant/quickActions';
import {assistantTriggerRules} from '../../assistant/rules';
import {reduceAssistantUiState} from '../../assistant/stateMachine';
import type {
  AssistantPanelVisualConfig,
  AssistantScenePage,
  AssistantUiState,
} from '../../assistant/types';
import {useAgentExecutionContextStore} from '../../agent/executionContextStore';
import {useAppStore} from '../../store/appStore';
import {
  formatApiErrorMessage,
  type AgentExecuteResponse,
  type AgentPlanAction,
  type AgentPlanResponse,
  type ModuleCapabilityItem,
} from '../../modules/api';
import {
  buildCurrentPageSummary,
  buildMissingContextHintText,
  executeAgentPlanCycle,
  runAgentGoalCycle,
  toResultStatusText,
  type AgentClientTab,
  type MissingContextGuide,
} from '../../agent/dualEntryOrchestrator';
import {useAgentVoiceGoal} from '../../agent/useAgentVoiceGoal';

const COLLAPSED_SIZE = 88;
const PANEL_BOTTOM_OFFSET = 92;
const BUBBLE_AUTO_HIDE_MS = 2600;
const PANEL_ANIMATION_MS = 240;

interface HaruFloatingAgentProps {
  activeTab: FloatingAssistantTab;
  capabilities: ModuleCapabilityItem[];
  bottomInset: number;
  onNavigateTab: (tab: AgentClientTab) => void;
}

interface AssistantChatMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
}

const HIYORI_LIVE2D_PAGE_URI = 'file:///android_asset/assistant/live2d/index.html';

const PANEL_CONFIG: AssistantPanelVisualConfig = {
  avatarPersistentInExpanded: true,
  expandedLayout: {
    avatarAnchor: 'left',
    avatarRatio: 0.32,
  },
};

const mapTabToScenePage = (tab: FloatingAssistantTab): AssistantScenePage => {
  if (tab === 'create') {
    return 'editor';
  }
  if (tab === 'agent') {
    return 'home';
  }
  return 'works';
};

const toContextJumpLabel = (guide: MissingContextGuide): string =>
  guide.targetTab === 'model' ? '去建模页补图' : '去调色页补图';

export const HaruFloatingAgent: React.FC<HaruFloatingAgentProps> = ({
  activeTab,
  capabilities,
  bottomInset,
  onNavigateTab,
}) => {
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRuleIdRef = useRef('');
  const previousTabRef = useRef<FloatingAssistantTab | null>(null);
  const messageIdRef = useRef(0);
  const panStartRef = useRef({x: 0, y: 0});
  const panelAnim = useRef(new Animated.Value(0)).current;
  const position = useRef(
    new Animated.ValueXY({
      x: Math.max(8, windowWidth - COLLAPSED_SIZE - 8),
      y: Math.max(90, windowHeight - bottomInset - 210),
    }),
  ).current;

  const colorContext = useAgentExecutionContextStore(state => state.colorContext);
  const modelingImageContext = useAgentExecutionContextStore(state => state.modelingImageContext);
  const assistantFrequency = useAppStore(state => state.assistantFrequency);
  const setAssistantFrequency = useAppStore(state => state.setAssistantFrequency);

  const [, setUiState] = useState<AssistantUiState>('S1_collapsed');
  const [panelMode, setPanelMode] = useState<'hidden' | 'half' | 'full'>('hidden');
  const [bubbleText, setBubbleText] = useState('');
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [customGoal, setCustomGoal] = useState('');
  const [loading, setLoading] = useState(false);
  const [live2dReady, setLive2dReady] = useState(false);
  const [live2dFailed, setLive2dFailed] = useState(false);
  const [avatarViewport, setAvatarViewport] = useState({width: 0, height: 0});
  const [statusText, setStatusText] = useState('');
  const [errorText, setErrorText] = useState('');
  const [missingContextGuides, setMissingContextGuides] = useState<MissingContextGuide[]>([]);
  const [latestPlan, setLatestPlan] = useState<AgentPlanResponse | null>(null);
  const [latestExecuteResult, setLatestExecuteResult] = useState<AgentExecuteResponse | null>(null);
  const [latestHydratedActions, setLatestHydratedActions] = useState<AgentPlanAction[]>([]);
  const [chatMessages, setChatMessages] = useState<AssistantChatMessage[]>([
    {
      id: 'm0',
      role: 'assistant',
      text: '你好，我是 Hiyori。你可以直接告诉我要完成什么任务。',
    },
  ]);

  const pendingActionIds = useMemo(
    () =>
      latestExecuteResult?.status === 'pending_confirm'
        ? latestExecuteResult.actionResults
            .filter(item => item.status === 'pending_confirm')
            .map(item => item.action.actionId)
        : [],
    [latestExecuteResult],
  );

  const {agentAvailable, agentAvailabilityKnown} = useMemo(() => {
    const agentCapability = capabilities.find(item => item.module === 'agent');
    if (!agentCapability) {
      return {
        // Capabilities may still be loading; avoid false-negative blocking.
        agentAvailable: capabilities.length === 0,
        agentAvailabilityKnown: capabilities.length > 0,
      };
    }
    return {
      agentAvailable: agentCapability.enabled !== false,
      agentAvailabilityKnown: true,
    };
  }, [capabilities]);

  const pushChatMessage = useCallback((role: AssistantChatMessage['role'], text: string) => {
    const finalText = text.trim();
    if (!finalText) {
      return;
    }
    messageIdRef.current += 1;
    setChatMessages(prev => [...prev, {id: `m${messageIdRef.current}`, role, text: finalText}]);
  }, []);

  const openHalfPanel = useCallback(() => {
    setPanelMode('half');
    setUiState(prev => reduceAssistantUiState(prev, 'user_open_half'));
  }, []);

  const openFullPanel = useCallback(() => {
    setPanelMode('full');
    setUiState(prev => reduceAssistantUiState(prev, 'user_open_full'));
  }, []);

  const closePanel = useCallback(() => {
    setPanelMode('hidden');
    setUiState(prev => reduceAssistantUiState(prev, 'user_close'));
  }, []);

  const hideBubble = useCallback(() => {
    setBubbleVisible(false);
    if (bubbleTimerRef.current) {
      clearTimeout(bubbleTimerRef.current);
      bubbleTimerRef.current = null;
    }
  }, []);

  const runGoal = useCallback(
    async (
      goal: string,
      options?: {allowConfirm?: boolean; actionIds?: string[]; inputSource?: 'text' | 'voice'},
    ) => {
      const finalGoal = goal.trim();
      if (!finalGoal) {
        return;
      }
      setLoading(true);
      setErrorText('');
      setStatusText('');
      setMissingContextGuides([]);
      setUiState(prev => reduceAssistantUiState(prev, 'run_start'));
      try {
        const {plan, cycle} = await runAgentGoalCycle({
          goal: finalGoal,
          context: {
            currentTab: activeTab,
            colorContext,
            modelingImageContext,
            latestExecuteResult,
          },
          clientHandlers: {
            navigateToTab: onNavigateTab,
            summarizeCurrentPage: () =>
              buildCurrentPageSummary({
                currentTab: activeTab,
                colorContext,
                modelingImageContext,
                latestPlan,
                latestExecuteResult,
              }),
          },
          options: {
            allowConfirmActions: options?.allowConfirm === true,
            actionIds: options?.actionIds,
            inputSource: options?.inputSource === 'voice' ? 'voice' : 'text',
          },
        });
        setLatestPlan(plan);
        setLatestHydratedActions(cycle.hydratedActions);
        if (cycle.executeResult) {
          setLatestExecuteResult(cycle.executeResult);
        }

        if (cycle.missingContextGuides.length > 0) {
          setMissingContextGuides(cycle.missingContextGuides);
          const hintText = buildMissingContextHintText(cycle.missingContextGuides);
          if (cycle.executeResult) {
            setStatusText('已执行可用步骤，仍缺少上下文。');
          }
          setErrorText(hintText);
          setUiState(prev => reduceAssistantUiState(prev, 'run_failed'));
          pushChatMessage('assistant', hintText);
          return;
        }

        if (!cycle.executeResult) {
          setErrorText('执行结果为空');
          setUiState(prev => reduceAssistantUiState(prev, 'run_failed'));
          pushChatMessage('assistant', '执行结果为空');
          return;
        }

        setUiState(prev => reduceAssistantUiState(prev, 'run_done'));
        let assistantReply = '';
        if (cycle.executeResult.status === 'pending_confirm') {
          setStatusText('已自动执行可用动作，存在待确认步骤。');
          assistantReply = '我已自动执行可用动作，还剩待确认步骤，请在下方确认或取消。';
          openFullPanel();
        } else if (cycle.executeResult.status === 'applied') {
          const handledCount = cycle.executeResult.clientHandledActions?.length || 0;
          setStatusText(
            handledCount > 0 ? `执行完成（客户端补执行 ${handledCount} 项）。` : '执行完成。',
          );
          assistantReply = cycle.executeResult.pageSummary
            ? `执行完成。当前页摘要：${cycle.executeResult.pageSummary}`
            : '执行完成。';
        } else if (cycle.executeResult.status === 'client_required') {
          setStatusText('已执行服务器动作，存在待客户端处理动作。');
          assistantReply = '已完成服务器侧执行，客户端动作已尝试处理。';
        } else {
          const firstMessage =
            cycle.executeResult.actionResults.find(item => item.status === 'failed')?.message ||
            '执行失败';
          setErrorText(firstMessage);
          setUiState(prev => reduceAssistantUiState(prev, 'run_failed'));
          assistantReply = firstMessage;
        }
        pushChatMessage('assistant', assistantReply);
      } catch (error) {
        const message = formatApiErrorMessage(error, '执行失败');
        setErrorText(message);
        setUiState(prev => reduceAssistantUiState(prev, 'run_failed'));
        pushChatMessage('assistant', message);
      } finally {
        setLoading(false);
      }
    },
    [
      activeTab,
      colorContext,
      latestExecuteResult,
      latestPlan,
      modelingImageContext,
      onNavigateTab,
      openFullPanel,
      pushChatMessage,
    ],
  );

  const {
    recording: voiceRecording,
    phase: voicePhase,
    liveTranscript: voiceLiveTranscript,
    errorText: voiceErrorText,
    onPressIn: onVoicePressIn,
    onPressOut: onVoicePressOut,
    clearError: clearVoiceError,
  } = useAgentVoiceGoal({
    busy: loading,
    onTranscript: transcript => {
      if (agentAvailabilityKnown && !agentAvailable) {
        pushChatMessage('assistant', '当前未启用 Agent 能力，暂时无法执行该请求。');
        return;
      }
      pushChatMessage('user', transcript);
      runGoal(transcript, {inputSource: 'voice'}).catch(() => undefined);
    },
  });

  useEffect(() => {
    if (!voiceErrorText) {
      return;
    }
    setErrorText(voiceErrorText);
    pushChatMessage('assistant', voiceErrorText);
    clearVoiceError();
  }, [clearVoiceError, pushChatMessage, voiceErrorText]);

  const sendCustomGoal = useCallback(() => {
    const finalGoal = customGoal.trim();
    if (!finalGoal || loading || (agentAvailabilityKnown && !agentAvailable)) {
      if (agentAvailabilityKnown && !agentAvailable) {
        pushChatMessage('assistant', '当前未启用 Agent 能力，暂时无法执行该请求。');
      }
      return;
    }
    pushChatMessage('user', finalGoal);
    setCustomGoal('');
    clearVoiceError();
    runGoal(finalGoal, {inputSource: 'text'});
  }, [
    agentAvailabilityKnown,
    agentAvailable,
    clearVoiceError,
    customGoal,
    loading,
    pushChatMessage,
    runGoal,
  ]);

  const confirmPending = useCallback(async () => {
    if (!latestPlan || pendingActionIds.length === 0 || latestHydratedActions.length === 0) {
      return;
    }
    setLoading(true);
    setErrorText('');
    setMissingContextGuides([]);
    try {
      const cycle = await executeAgentPlanCycle({
        plan: {
          ...latestPlan,
          actions: latestHydratedActions,
        },
        context: {
          currentTab: activeTab,
          colorContext,
          modelingImageContext,
          latestExecuteResult,
        },
        clientHandlers: {
          navigateToTab: onNavigateTab,
          summarizeCurrentPage: () =>
            buildCurrentPageSummary({
              currentTab: activeTab,
              colorContext,
              modelingImageContext,
              latestPlan,
              latestExecuteResult,
            }),
        },
        options: {
          allowConfirmActions: true,
          actionIds: pendingActionIds,
        },
      });
      if (cycle.missingContextGuides.length > 0) {
        setMissingContextGuides(cycle.missingContextGuides);
        const hintText = buildMissingContextHintText(cycle.missingContextGuides);
        setErrorText(hintText);
        pushChatMessage('assistant', hintText);
        return;
      }
      if (!cycle.executeResult) {
        setErrorText('确认执行结果为空');
        pushChatMessage('assistant', '确认执行结果为空');
        return;
      }
      setLatestHydratedActions(cycle.hydratedActions);
      setLatestExecuteResult(cycle.executeResult);
      if (cycle.executeResult.status === 'applied') {
        setStatusText('待确认动作已执行。');
        pushChatMessage(
          'assistant',
          cycle.executeResult.pageSummary
            ? `待确认动作已执行。当前页摘要：${cycle.executeResult.pageSummary}`
            : '待确认动作已执行。',
        );
      } else {
        setStatusText('确认完成，仍有未完成动作。');
        pushChatMessage('assistant', '已完成确认，仍有未完成动作。');
      }
    } catch (error) {
      const message = formatApiErrorMessage(error, '确认执行失败');
      setErrorText(message);
      pushChatMessage('assistant', message);
    } finally {
      setLoading(false);
    }
  }, [
    activeTab,
    colorContext,
    latestExecuteResult,
    latestHydratedActions,
    latestPlan,
    modelingImageContext,
    onNavigateTab,
    pendingActionIds,
    pushChatMessage,
  ]);

  const dismissPending = useCallback(() => {
    setStatusText('已取消待确认动作。');
    pushChatMessage('assistant', '已取消待确认动作。');
    setLatestExecuteResult(prev =>
      prev
        ? {
            ...prev,
            status: 'applied',
            actionResults: prev.actionResults.map(item =>
              item.status === 'pending_confirm'
                ? {
                    ...item,
                    status: 'skipped',
                    message: '用户已取消',
                  }
                : item,
            ),
          }
        : prev,
    );
  }, [pushChatMessage]);

  useEffect(() => {
    setUiState(prev => reduceAssistantUiState(prev, 'app_ready'));
  }, []);

  useEffect(() => {
    Animated.timing(panelAnim, {
      toValue: panelMode === 'hidden' ? 0 : 1,
      duration: PANEL_ANIMATION_MS,
      useNativeDriver: false,
    }).start();
  }, [panelAnim, panelMode]);

  useEffect(() => {
    if (panelMode !== 'hidden') {
      setLive2dFailed(false);
      setLive2dReady(false);
    }
  }, [panelMode]);

  useEffect(() => {
    if (previousTabRef.current === activeTab) {
      return;
    }
    previousTabRef.current = activeTab;
    const page = mapTabToScenePage(activeTab);
    const now = Date.now();
    const matchedRule = assistantTriggerRules
      .filter(rule => rule.page === page && rule.trigger === 'page_enter')
      .sort((a, b) => b.priority - a.priority)
      .find(rule => shouldTriggerRule(assistantFrequency, now, rule));
    if (!matchedRule) {
      return;
    }
    setAssistantFrequency(prev => markRuleShown(prev, matchedRule, now));
    currentRuleIdRef.current = matchedRule.id;
    setBubbleText(matchedRule.text);
    setBubbleVisible(true);
    setUiState(prev => reduceAssistantUiState(prev, 'system_remind'));
    if (bubbleTimerRef.current) {
      clearTimeout(bubbleTimerRef.current);
    }
    bubbleTimerRef.current = setTimeout(() => {
      setBubbleVisible(false);
      setUiState(prev => reduceAssistantUiState(prev, 'auto_reset'));
    }, BUBBLE_AUTO_HIDE_MS);

    if (matchedRule.action === 'open_half') {
      setTimeout(() => {
        openHalfPanel();
      }, 220);
    }
  }, [activeTab, assistantFrequency, openHalfPanel, setAssistantFrequency]);

  useEffect(
    () => () => {
      if (bubbleTimerRef.current) {
        clearTimeout(bubbleTimerRef.current);
      }
    },
    [],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          panelMode === 'hidden' &&
          (Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4),
        onPanResponderGrant: () => {
          position.stopAnimation(current => {
            panStartRef.current = {x: current.x, y: current.y};
          });
          setUiState(prev => reduceAssistantUiState(prev, 'user_drag_start'));
        },
        onPanResponderMove: (_, gestureState) => {
          position.setValue({
            x: panStartRef.current.x + gestureState.dx,
            y: panStartRef.current.y + gestureState.dy,
          });
        },
        onPanResponderRelease: (_, gestureState) => {
          const margin = 8;
          const minY = 70;
          const maxY = Math.max(minY, windowHeight - bottomInset - 180);
          const targetX =
            panStartRef.current.x + gestureState.dx < windowWidth / 2
              ? margin
              : Math.max(margin, windowWidth - COLLAPSED_SIZE - margin);
          const targetY = Math.min(maxY, Math.max(minY, panStartRef.current.y + gestureState.dy));
          Animated.spring(position, {
            toValue: {x: targetX, y: targetY},
            useNativeDriver: false,
            bounciness: 5,
          }).start();
          setUiState(prev => reduceAssistantUiState(prev, 'user_drag_end'));
        },
      }),
    [bottomInset, panelMode, position, windowHeight, windowWidth],
  );

  const panelSizeStyle = useMemo(() => {
    const availableHeight = Math.max(220, windowHeight - bottomInset - PANEL_BOTTOM_OFFSET - 68);
    const widthCap = Math.max(252, Math.min(windowWidth - 24, 340));
    if (panelMode === 'half') {
      return {
        width: Math.max(236, Math.min(widthCap - 18, Math.floor(windowWidth * 0.64))),
        maxHeight: Math.min(Math.max(220, Math.floor(windowHeight * 0.38)), availableHeight),
      };
    }
    return {
      width: Math.max(272, widthCap),
      maxHeight: Math.min(Math.max(300, Math.floor(windowHeight * 0.56)), availableHeight),
    };
  }, [bottomInset, panelMode, windowHeight, windowWidth]);

  const chatListModeStyle = useMemo(
    () => ({
      maxHeight:
        panelMode === 'half'
          ? Math.max(92, Math.floor(windowHeight * 0.18))
          : Math.max(150, Math.floor(windowHeight * 0.32)),
    }),
    [panelMode, windowHeight],
  );

  const live2dUri = useMemo(() => {
    const width = Math.max(0, Math.round(avatarViewport.width));
    const height = Math.max(0, Math.round(avatarViewport.height));
    return `${HIYORI_LIVE2D_PAGE_URI}?w=${width}&h=${height}`;
  }, [avatarViewport.height, avatarViewport.width]);

  const collapsedAvatarNode = (
    <View style={styles.avatarShellCompact}>
      <Icon name="sparkles" size={26} color="#FFE7D5" />
      <Text style={styles.avatarCompactText}>Hiyori</Text>
      {loading ? (
        <View style={styles.avatarBadge}>
          <Text style={styles.avatarBadgeText}>思考中</Text>
        </View>
      ) : null}
    </View>
  );

  const panelAvatarNode = (
    <View
      style={[
        styles.avatarPanelShell,
        panelMode === 'full' ? styles.avatarPanelShellFull : styles.avatarPanelShellHalf,
      ]}
      renderToHardwareTextureAndroid
      onLayout={event => {
        const {width, height} = event.nativeEvent.layout;
        if (
          Math.abs(width - avatarViewport.width) > 0.5 ||
          Math.abs(height - avatarViewport.height) > 0.5
        ) {
          setAvatarViewport({width, height});
        }
      }}>
      {!live2dFailed && avatarViewport.width > 8 && avatarViewport.height > 8 ? (
        <View style={styles.avatarLive2dHost}>
          <WebView
            key={`live2d-${Math.round(avatarViewport.width)}x${Math.round(avatarViewport.height)}-${panelMode}`}
            source={{uri: live2dUri}}
            originWhitelist={['*']}
            allowFileAccess
            allowUniversalAccessFromFileURLs
            mixedContentMode="always"
            androidLayerType="hardware"
            androidHardwareAccelerationDisabled={false}
            javaScriptEnabled
            scrollEnabled={false}
            bounces={false}
            onLoadStart={() => {
              setLive2dReady(false);
              setLive2dFailed(false);
            }}
            onError={() => {
              setLive2dFailed(true);
            }}
            onMessage={event => {
              try {
                const payload = JSON.parse(event.nativeEvent.data) as {
                  type?: string;
                  message?: string;
                };
                if (payload.type === 'loaded') {
                  setLive2dReady(true);
                  setLive2dFailed(false);
                }
                if (payload.type === 'error') {
                  setLive2dFailed(true);
                  if (typeof payload.message === 'string' && payload.message.trim()) {
                    setErrorText(payload.message);
                  }
                }
                if (payload.type === 'diag' && typeof payload.message === 'string') {
                  return;
                }
              } catch {
                // ignore invalid payload
              }
            }}
            style={styles.avatarLive2dWebView}
          />
        </View>
      ) : null}
      {!live2dReady || live2dFailed ? (
        <View style={styles.avatarPanelOverlay}>
          {live2dFailed ? (
            <Text style={styles.avatarPanelOverlayText}>模型加载失败</Text>
          ) : (
            <>
              <ActivityIndicator size="small" color="#F8D7C2" />
              <Text style={styles.avatarPanelOverlayText}>加载 Hiyori 模型中...</Text>
            </>
          )}
        </View>
      ) : null}
      {loading ? (
        <View style={styles.avatarBadge}>
          <Text style={styles.avatarBadgeText}>思考中</Text>
        </View>
      ) : null}
    </View>
  );

  const toRequiredContextText = useCallback((value: string | null | undefined) => {
    if (value === 'context.color.image') {
      return '调色图片';
    }
    if (value === 'context.modeling.image') {
      return '建模图片';
    }
    if (value === 'context.community.draftId') {
      return '社区草稿';
    }
    return value || '';
  }, []);

  const workflowProgressText = useMemo(() => {
    const total = Number(latestExecuteResult?.workflowState?.totalSteps || 0);
    if (!latestExecuteResult || total <= 0) {
      return '';
    }
    const current = Number(latestExecuteResult.workflowState?.currentStep || 0);
    return `链路进度 ${Math.min(Math.max(current, 0), total)}/${total}`;
  }, [latestExecuteResult]);

  const combinedResultText = useMemo(() => {
    if (!latestExecuteResult) {
      return '';
    }
    const clientHandledCount = latestExecuteResult.clientHandledActions?.length || 0;
    const appliedCount = latestExecuteResult.actionResults.filter(item => item.status === 'applied').length;
    const serverAppliedCount = Math.max(0, appliedCount - clientHandledCount);
    if (serverAppliedCount > 0 && clientHandledCount > 0) {
      return `服务端已执行 ${serverAppliedCount} 项，客户端补执行 ${clientHandledCount} 项`;
    }
    if (clientHandledCount > 0) {
      return `客户端补执行 ${clientHandledCount} 项`;
    }
    return '';
  }, [latestExecuteResult]);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {bubbleVisible && panelMode === 'hidden' ? (
        <Pressable
          style={[
            styles.bubble,
            styles.bubbleAnchor,
            {
              bottom: bottomInset + PANEL_BOTTOM_OFFSET + 84,
            },
          ]}
          onPress={() => {
            hideBubble();
            openHalfPanel();
          }}>
          <Text style={styles.bubbleText}>{bubbleText}</Text>
        </Pressable>
      ) : null}

      {panelMode === 'hidden' ? (
        <Animated.View
          style={[
            styles.collapsedWrap,
            {
              transform: [{translateX: position.x}, {translateY: position.y}],
            },
          ]}
          {...panResponder.panHandlers}>
          <Pressable
            style={styles.collapsedPressable}
            onPress={openHalfPanel}
            onLongPress={() => {
              hideBubble();
              const currentRuleId = currentRuleIdRef.current;
              if (currentRuleId) {
                setAssistantFrequency(prev => markRuleIgnored(prev, currentRuleId));
              }
            }}>
            {collapsedAvatarNode}
          </Pressable>
        </Animated.View>
      ) : null}

      {panelMode !== 'hidden' ? (
        <Animated.View
          style={[
            styles.panelWrap,
            styles.panelAnchor,
            panelSizeStyle,
            {
              bottom: bottomInset + PANEL_BOTTOM_OFFSET,
              opacity: panelAnim,
              transform: [
                {
                  translateY: panelAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
            },
          ]}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Hiyori 对话助手</Text>
            <View style={styles.panelHeaderActions}>
              {panelMode === 'half' ? (
                <Pressable style={styles.headerBtn} onPress={openFullPanel}>
                  <Icon name="expand" size={14} color="#F3DDCD" />
                </Pressable>
              ) : null}
              <Pressable style={styles.headerBtn} onPress={closePanel}>
                <Icon name="close" size={15} color="#F3DDCD" />
              </Pressable>
            </View>
          </View>
          <View
            style={[
              styles.panelBody,
              PANEL_CONFIG.expandedLayout?.avatarAnchor === 'top' ? styles.panelBodyTop : styles.panelBodyLeft,
            ]}>
            <View
              style={[
                styles.panelAvatarArea,
                panelMode === 'half' ? styles.panelAvatarAreaCompact : null,
                panelMode === 'full'
                  ? {flex: Math.max(0.28, PANEL_CONFIG.expandedLayout?.avatarRatio || 0.32)}
                  : null,
              ]}>
              {panelAvatarNode}
              <Text style={styles.avatarName}>Hiyori</Text>
              {panelMode === 'full' ? <Text style={styles.avatarHint}>动漫助手 · 对话模式</Text> : null}
            </View>
            <View style={styles.panelContentArea}>
              <ScrollView
                style={[styles.chatList, chatListModeStyle]}
                contentContainerStyle={styles.chatListContent}
                keyboardShouldPersistTaps="handled">
                {chatMessages.map(message => (
                  <View
                    key={message.id}
                    style={[
                      styles.chatBubble,
                      message.role === 'assistant' ? styles.chatBubbleAssistant : styles.chatBubbleUser,
                    ]}>
                    <Text
                      style={[
                        styles.chatBubbleText,
                        message.role === 'assistant' ? styles.chatBubbleTextAssistant : styles.chatBubbleTextUser,
                      ]}>
                      {message.text}
                    </Text>
                  </View>
                ))}
                {loading ? (
                  <View style={[styles.chatBubble, styles.chatBubbleAssistant]}>
                    <Text style={[styles.chatBubbleText, styles.chatBubbleTextAssistant]}>正在处理你的请求...</Text>
                  </View>
                ) : null}
              </ScrollView>
              <View style={styles.customGoalWrap}>
                <TextInput
                  value={customGoal}
                  onChangeText={setCustomGoal}
                  placeholder="输入你的需求，按发送开始执行"
                  placeholderTextColor="rgba(252,236,227,0.46)"
                  style={styles.customGoalInput}
                  editable={!loading && (!agentAvailabilityKnown || agentAvailable)}
                  onSubmitEditing={sendCustomGoal}
                />
                <Pressable
                  style={[
                    styles.customGoalBtn,
                    ((agentAvailabilityKnown && !agentAvailable) || loading) &&
                      styles.customGoalBtnDisabled,
                  ]}
                  disabled={loading || (agentAvailabilityKnown && !agentAvailable)}
                  onPress={sendCustomGoal}>
                  <Icon name="send" size={13} color="#FFEEDF" />
                  <Text style={styles.customGoalBtnText}>发送</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.customGoalBtn,
                    voiceRecording && styles.customGoalBtnVoiceActive,
                    ((agentAvailabilityKnown && !agentAvailable) || loading) &&
                      styles.customGoalBtnDisabled,
                  ]}
                  disabled={loading || (agentAvailabilityKnown && !agentAvailable)}
                  onPressIn={onVoicePressIn}
                  onPressOut={onVoicePressOut}>
                  <Icon name={voiceRecording ? 'mic' : 'mic-outline'} size={13} color="#FFEEDF" />
                  <Text style={styles.customGoalBtnText}>{voiceRecording ? '松开' : '语音'}</Text>
                </Pressable>
              </View>
              <Text style={styles.voiceMetaText}>
                语音阶段: {voicePhase}
                {voiceLiveTranscript ? ` | ${voiceLiveTranscript}` : ''}
              </Text>
            </View>
          </View>

          {(statusText || errorText || pendingActionIds.length > 0 || missingContextGuides.length > 0) && (
            <View style={styles.feedbackBar}>
              {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
              {!errorText && statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}
              {latestExecuteResult && !errorText ? (
                <Text style={styles.statusText}>执行状态: {toResultStatusText(latestExecuteResult.status)}</Text>
              ) : null}
              {combinedResultText ? <Text style={styles.statusText}>{combinedResultText}</Text> : null}
              {workflowProgressText ? <Text style={styles.statusText}>{workflowProgressText}</Text> : null}
              {latestExecuteResult?.workflowState?.nextRequiredContext ? (
                <Text style={styles.statusText}>
                  下一步需要: {toRequiredContextText(latestExecuteResult.workflowState.nextRequiredContext)}
                </Text>
              ) : null}
              {missingContextGuides[0] ? (
                <Pressable
                  style={styles.pendingBtn}
                  onPress={() => onNavigateTab(missingContextGuides[0].targetTab)}>
                  <Icon name="arrow-forward-circle" size={14} color="#FFEEDF" />
                  <Text style={styles.pendingBtnText}>{toContextJumpLabel(missingContextGuides[0])}</Text>
                </Pressable>
              ) : null}
              {pendingActionIds.length > 0 ? (
                <View style={styles.pendingActions}>
                  <Pressable style={styles.pendingBtn} onPress={confirmPending} disabled={loading}>
                    <Icon name="checkmark-circle" size={14} color="#FFEEDF" />
                    <Text style={styles.pendingBtnText}>确认执行</Text>
                  </Pressable>
                  <Pressable style={[styles.pendingBtn, styles.pendingBtnGhost]} onPress={dismissPending}>
                    <Icon name="close-circle" size={14} color="#FFD8D8" />
                    <Text style={[styles.pendingBtnText, styles.pendingBtnTextGhost]}>取消</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          )}
        </Animated.View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  collapsedWrap: {
    position: 'absolute',
    width: COLLAPSED_SIZE,
    height: COLLAPSED_SIZE,
    zIndex: 20,
  },
  collapsedPressable: {
    width: COLLAPSED_SIZE,
    height: COLLAPSED_SIZE,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,211,187,0.42)',
    backgroundColor: 'rgba(39,26,22,0.9)',
    overflow: 'hidden',
    shadowColor: '#100A08',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 6},
  },
  avatarShellCompact: {
    flex: 1,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(25,17,14,0.84)',
  },
  avatarCompactText: {
    color: '#FCE2CF',
    fontSize: 11,
    fontWeight: '700',
  },
  avatarPanelShell: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    backgroundColor: 'rgba(28,19,16,0.9)',
  },
  avatarPanelShellHalf: {
    height: 100,
  },
  avatarPanelShellFull: {
    height: 138,
  },
  avatarLive2dHost: {
    flex: 1,
    alignSelf: 'stretch',
    minWidth: 1,
    minHeight: 1,
  },
  avatarLive2dWebView: {
    flex: 1,
    minWidth: 1,
    minHeight: 1,
    backgroundColor: 'transparent',
  },
  avatarPanelOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(28,19,16,0.72)',
  },
  avatarPanelOverlayText: {
    color: '#F8DCCB',
    fontSize: 11,
    fontWeight: '600',
  },
  avatarBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: 'rgba(22,16,14,0.72)',
  },
  avatarBadgeText: {
    color: '#F9E0CD',
    fontSize: 10,
    fontWeight: '700',
  },
  bubble: {
    position: 'absolute',
    maxWidth: 248,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,206,183,0.52)',
    backgroundColor: 'rgba(46,29,24,0.94)',
    zIndex: 21,
  },
  bubbleAnchor: {
    right: 14,
  },
  bubbleText: {
    color: '#FEEDE2',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  panelWrap: {
    position: 'absolute',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(212,156,132,0.45)',
    backgroundColor: 'rgba(25,16,14,0.94)',
    padding: 12,
    zIndex: 22,
    shadowColor: '#0D0908',
    shadowOpacity: 0.42,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 8},
  },
  panelAnchor: {
    right: 12,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  panelTitle: {
    color: '#FCE7D8',
    fontSize: 14,
    fontWeight: '700',
  },
  panelHeaderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(243,197,174,0.32)',
    backgroundColor: 'rgba(72,46,39,0.55)',
  },
  panelBody: {
    gap: 10,
  },
  panelBodyLeft: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  panelBodyTop: {
    flexDirection: 'column',
  },
  panelAvatarArea: {
    width: 112,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,210,184,0.34)',
    backgroundColor: 'rgba(53,34,28,0.7)',
    padding: 8,
    marginRight: 10,
  },
  panelAvatarAreaCompact: {
    width: 90,
    padding: 6,
    marginRight: 8,
    minHeight: 150,
  },
  avatarName: {
    color: '#FEE6D4',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  avatarHint: {
    color: 'rgba(254,230,212,0.72)',
    fontSize: 10,
    marginTop: 2,
  },
  panelContentArea: {
    flex: 1,
    gap: 8,
  },
  chatList: {
    flex: 1,
  },
  chatListContent: {
    gap: 6,
    paddingBottom: 4,
  },
  chatBubble: {
    maxWidth: '94%',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  chatBubbleAssistant: {
    alignSelf: 'flex-start',
    borderColor: 'rgba(248,193,166,0.3)',
    backgroundColor: 'rgba(84,52,43,0.42)',
  },
  chatBubbleUser: {
    alignSelf: 'flex-end',
    borderColor: 'rgba(241,214,198,0.3)',
    backgroundColor: 'rgba(150,89,73,0.56)',
  },
  chatBubbleText: {
    fontSize: 12,
    lineHeight: 17,
  },
  chatBubbleTextAssistant: {
    color: '#FEEADC',
  },
  chatBubbleTextUser: {
    color: '#FFF3EA',
  },
  customGoalWrap: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customGoalInput: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(252,215,192,0.28)',
    color: '#FEEDE2',
    fontSize: 12,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(71,45,38,0.45)',
  },
  customGoalBtn: {
    height: 38,
    borderRadius: 11,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
    backgroundColor: '#A34A3C',
  },
  customGoalBtnDisabled: {
    opacity: 0.55,
  },
  customGoalBtnVoiceActive: {
    backgroundColor: '#8A3529',
  },
  customGoalBtnText: {
    color: '#FFEEDF',
    fontSize: 12,
    fontWeight: '700',
  },
  voiceMetaText: {
    color: 'rgba(255,233,219,0.78)',
    fontSize: 10,
    marginTop: 2,
  },
  feedbackBar: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,204,180,0.28)',
    backgroundColor: 'rgba(57,37,31,0.6)',
    padding: 9,
    gap: 8,
  },
  statusText: {
    color: '#FDE9DB',
    fontSize: 11,
    fontWeight: '600',
  },
  errorText: {
    color: '#FFD0D0',
    fontSize: 11,
    fontWeight: '600',
  },
  pendingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  pendingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 10,
    backgroundColor: '#9B4A3C',
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  pendingBtnGhost: {
    backgroundColor: 'rgba(128,67,67,0.42)',
  },
  pendingBtnText: {
    color: '#FFEEDF',
    fontSize: 11,
    fontWeight: '700',
  },
  pendingBtnTextGhost: {
    color: '#FFD4D4',
  },
});
