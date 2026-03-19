import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import GPUColorGradingScreen, {
  type GPUColorGradingAgentBridge,
} from './src/screens/GPUColorGradingScreen';
import {
  TwoDToThreeDScreen,
  type TwoDToThreeDAgentBridge,
} from './src/screens/TwoDToThreeDScreen';
import {
  CommunityScreen,
  type CommunityAgentBridge,
} from './src/screens/CommunityScreen';
import {
  ProfileSettingsScreen,
  type ProfileSettingsAgentBridge,
} from './src/screens/ProfileSettingsScreen';
import {CreateHubScreen} from './src/screens/CreateHubScreen';
import {WorksScreen} from './src/screens/WorksScreen';
import {AgentRuntimeProvider, useAgentRuntime} from './src/agent/runtimeContext';
import type {AgentAppTab} from './src/agent/types';
import {
  applySettingsPatchWithBridge,
  type AgentSettingsPatch,
} from './src/agent/operations/settingsApplyPatch';
import {GlobalAgentSprite} from './src/components/agent/GlobalAgentSprite';
import {BottomSheetPanel, StatusStrip} from './src/components/design';
import {resolveAgentNavigationTarget, mapCreateRouteToLegacy} from './src/navigation/compat';
import {RootProviders} from './src/providers/RootProviders';
import {useAppStore} from './src/store/appStore';
import {VISION_THEME} from './src/theme/visionTheme';
import type {ColorGradingParams} from './src/types/colorGrading';
import type {CreateRouteKey, MainTabKey, WorksSubPageKey} from './src/types/navigation';

interface TabConfig {
  key: 'create' | 'assistantAction' | 'works';
  label: string;
  icon: string;
}

const TABS: TabConfig[] = [
  {key: 'create', label: '创作', icon: 'sparkles-outline'},
  {key: 'assistantAction', label: '助手', icon: 'chatbubble-ellipses-outline'},
  {key: 'works', label: '作品', icon: 'layers-outline'},
];

const CREATE_ROUTES: Array<{key: CreateRouteKey; label: string}> = [
  {key: 'hub', label: '创作入口'},
  {key: 'editor', label: '编辑器'},
];

const AGENT_RUNTIME_USER_ID = 'local_debug_user';
const AGENT_RUNTIME_NAMESPACE = 'app.agent';
const AGENT_DEBUG_PERMISSION_OVERRIDE = (globalThis as {__DEV__?: boolean}).__DEV__ === true;
const AGENT_DEFAULT_GRANTED_SCOPES = [
  'app:navigate',
  'app:read',
  'grading:write',
  'convert:write',
  'community:write',
  'community:publish',
  'settings:write',
];

interface AppShellContentProps {
  activeMainTab: MainTabKey;
  setActiveMainTab: (tab: MainTabKey) => void;
  createRoute: CreateRouteKey;
  setCreateRoute: (route: CreateRouteKey) => void;
  worksSubPage: WorksSubPageKey;
  setWorksSubPage: (page: WorksSubPageKey) => void;
  worksFilter: 'all' | 'native' | 'degraded';
  setWorksFilter: (filter: 'all' | 'native' | 'degraded') => void;
  worksToolsOpen: boolean;
  setWorksToolsOpen: (open: boolean) => void;
  worksSettingsOpen: boolean;
  setWorksSettingsOpen: (open: boolean) => void;
}

const worksPageLabel = (subPage: WorksSubPageKey): string => {
  if (subPage === 'community') {
    return '社区';
  }
  if (subPage === 'modeling') {
    return '2D转3D';
  }
  if (subPage === 'settings') {
    return '设置';
  }
  return '作品库';
};

const AppShellContent: React.FC<AppShellContentProps> = ({
  activeMainTab,
  setActiveMainTab,
  createRoute,
  setCreateRoute,
  worksSubPage,
  setWorksSubPage,
  worksFilter,
  setWorksFilter,
  worksToolsOpen,
  setWorksToolsOpen,
  worksSettingsOpen,
  setWorksSettingsOpen,
}) => {
  const insets = useSafeAreaInsets();
  const {registerOperation, submitGoal, openAssistantFullPanel, assistantPanelMode, emitAssistantEvent} =
    useAgentRuntime();
  const motionEnabled = useAppStore(state => state.motionEnabled);
  const shellAnim = useRef(new Animated.Value(0)).current;
  const gradingBridgeRef = useRef<GPUColorGradingAgentBridge | null>(null);
  const convertBridgeRef = useRef<TwoDToThreeDAgentBridge | null>(null);
  const communityBridgeRef = useRef<CommunityAgentBridge | null>(null);
  const profileBridgeRef = useRef<ProfileSettingsAgentBridge | null>(null);
  const [reuseRequest, setReuseRequest] = useState<{
    id: number;
    params: ColorGradingParams;
  } | null>(null);
  const [importRequest, setImportRequest] = useState<{
    id: number;
    source?: 'gallery' | 'camera';
  } | null>(null);

  const openSettingsSheet = useCallback(() => {
    setActiveMainTab('works');
    setWorksSubPage('settings');
    setWorksSettingsOpen(true);
  }, [setActiveMainTab, setWorksSettingsOpen, setWorksSubPage]);

  const collectAgentSnapshot = useCallback(() => {
    const grading = gradingBridgeRef.current?.getSnapshot() || null;
    const convert = convertBridgeRef.current?.getSnapshot() || null;
    const community = communityBridgeRef.current?.getSnapshot() || null;
    const profile = profileBridgeRef.current?.getSnapshot() || null;
    return {
      currentMainTab: activeMainTab,
      currentCreateRoute: createRoute,
      currentWorksSubPage: worksSubPage,
      currentHomeRoute: mapCreateRouteToLegacy(createRoute),
      'create.editor': grading || undefined,
      'works.modeling': convert || undefined,
      'works.community': community || undefined,
      'works.settings': profile || undefined,
      'community.lastDraftTitle': community?.draftTitle || '',
    };
  }, [activeMainTab, createRoute, worksSubPage]);

  useEffect(() => {
    if (!motionEnabled) {
      shellAnim.setValue(1);
      return;
    }
    Animated.timing(shellAnim, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [motionEnabled, shellAnim]);

  useEffect(() => {
    const unregisterList: Array<() => void> = [];

    unregisterList.push(
      registerOperation({
        domain: 'navigation',
        operation: 'navigate_tab',
        description: '页面跳转',
        defaultRisk: 'low',
        defaultIdempotent: true,
        defaultRequiredScopes: ['app:navigate'],
        defaultSkillName: 'agent-tool-router',
        snapshot: collectAgentSnapshot,
        execute: async action => {
          const args = action.args || {};
          const target = resolveAgentNavigationTarget(args);
          if (target.openAssistantPanel) {
            openAssistantFullPanel();
            return {
              ok: true,
              message: '已打开助手面板',
            };
          }
          setActiveMainTab(target.mainTab);
          if (target.mainTab === 'create') {
            setCreateRoute(target.createRoute || 'hub');
          }
          if (target.mainTab === 'works') {
            const nextSubPage = target.worksSubPage || 'library';
            setWorksSubPage(nextSubPage);
            setWorksToolsOpen(nextSubPage !== 'library');
            setWorksSettingsOpen(Boolean(target.openSettingsSheet));
          }
          return {
            ok: true,
            message:
              target.mainTab === 'works'
                ? `已跳转到 works/${target.worksSubPage || 'library'}`
                : `已跳转到 create/${target.createRoute || 'hub'}`,
          };
        },
      }),
    );

    unregisterList.push(
      registerOperation({
        domain: 'grading',
        operation: 'apply_visual_suggest',
        description: '执行调色视觉首轮建议',
        defaultRisk: 'low',
        defaultIdempotent: false,
        defaultRequiredScopes: ['grading:write'],
        defaultSkillName: 'agent-tool-router',
        snapshot: () => gradingBridgeRef.current?.getSnapshot() || null,
        execute: async () => {
          setActiveMainTab('create');
          setCreateRoute('editor');
          const bridge = gradingBridgeRef.current;
          if (!bridge) {
            return {ok: false, message: '调色页面未就绪'};
          }
          return bridge.optimizeCurrentImage();
        },
      }),
    );

    unregisterList.push(
      registerOperation({
        domain: 'grading',
        operation: 'reset_params',
        description: '重置调色参数',
        defaultRisk: 'medium',
        defaultRequiresConfirmation: true,
        defaultIdempotent: true,
        defaultRequiredScopes: ['grading:write'],
        defaultSkillName: 'agent-permission-gate',
        snapshot: () => gradingBridgeRef.current?.getSnapshot() || null,
        execute: async () => {
          setActiveMainTab('create');
          setCreateRoute('editor');
          const bridge = gradingBridgeRef.current;
          if (!bridge) {
            return {ok: false, message: '调色页面未就绪'};
          }
          return bridge.resetAll();
        },
      }),
    );

    unregisterList.push(
      registerOperation({
        domain: 'convert',
        operation: 'start_task',
        description: '启动2D转3D任务',
        defaultRisk: 'medium',
        defaultRequiresConfirmation: true,
        defaultIdempotent: false,
        defaultRequiredScopes: ['convert:write'],
        defaultSkillName: 'agent-permission-gate',
        snapshot: () => convertBridgeRef.current?.getSnapshot() || null,
        execute: async action => {
          setActiveMainTab('works');
          setWorksSubPage('modeling');
          setWorksToolsOpen(true);
          const bridge = convertBridgeRef.current;
          if (!bridge) {
            return {ok: false, message: '2D转3D页面未就绪'};
          }
          const level = String(action.args?.level || 'balanced');
          return bridge.startTask(level === 'preview' || level === 'quality' ? level : 'balanced');
        },
      }),
    );

    unregisterList.push(
      registerOperation({
        domain: 'community',
        operation: 'create_draft',
        description: '生成社区草稿',
        defaultRisk: 'low',
        defaultIdempotent: false,
        defaultRequiredScopes: ['community:write'],
        defaultSkillName: 'agent-tool-router',
        snapshot: () => communityBridgeRef.current?.getSnapshot() || null,
        execute: async action => {
          setActiveMainTab('works');
          setWorksSubPage('community');
          setWorksToolsOpen(true);
          const bridge = communityBridgeRef.current;
          if (!bridge) {
            return {ok: false, message: '社区页面未就绪'};
          }
          const args = action.args || {};
          return bridge.createDraft({
            title: typeof args.title === 'string' ? args.title : undefined,
            description: typeof args.description === 'string' ? args.description : undefined,
            tags: Array.isArray(args.tags)
              ? args.tags.filter((item): item is string => typeof item === 'string')
              : undefined,
          });
        },
      }),
    );

    unregisterList.push(
      registerOperation({
        domain: 'community',
        operation: 'publish_draft',
        description: '发布社区草稿',
        defaultRisk: 'high',
        defaultRequiresConfirmation: true,
        defaultIdempotent: false,
        defaultRequiredScopes: ['community:publish'],
        defaultSkillName: 'agent-permission-gate',
        snapshot: () => communityBridgeRef.current?.getSnapshot() || null,
        execute: async () => {
          setActiveMainTab('works');
          setWorksSubPage('community');
          setWorksToolsOpen(true);
          const bridge = communityBridgeRef.current;
          if (!bridge) {
            return {ok: false, message: '社区页面未就绪'};
          }
          return bridge.publishDraft();
        },
      }),
    );

    unregisterList.push(
      registerOperation({
        domain: 'settings',
        operation: 'apply_patch',
        description: '应用设置优化建议',
        defaultRisk: 'medium',
        defaultRequiresConfirmation: true,
        defaultIdempotent: true,
        defaultRequiredScopes: ['settings:write'],
        defaultSkillName: 'agent-permission-gate',
        snapshot: () => {
          const snapshot = profileBridgeRef.current?.getSnapshot();
          return snapshot ? {...snapshot} : null;
        },
        execute: async action => {
          const args = action.args || {};
          const patch: AgentSettingsPatch = {
            syncOnWifi: typeof args.syncOnWifi === 'boolean' ? args.syncOnWifi : undefined,
            communityNotify:
              typeof args.communityNotify === 'boolean' ? args.communityNotify : undefined,
            voiceAutoApply:
              typeof args.voiceAutoApply === 'boolean' ? args.voiceAutoApply : undefined,
          };
          return applySettingsPatchWithBridge({
            openSettings: openSettingsSheet,
            getBridge: () => profileBridgeRef.current,
            patch,
            timeoutMs: 2000,
            pollIntervalMs: 50,
          });
        },
      }),
    );

    unregisterList.push(
      registerOperation({
        domain: 'app',
        operation: 'summarize_current_page',
        description: '总结当前页状态',
        defaultRisk: 'low',
        defaultIdempotent: true,
        defaultRequiredScopes: ['app:read'],
        defaultSkillName: 'agent-task-planner',
        snapshot: collectAgentSnapshot,
        execute: async () => ({
          ok: true,
          message:
            activeMainTab === 'create'
              ? `当前页面: create/${createRoute}`
              : `当前页面: works/${worksSubPage}`,
        }),
      }),
    );

    return () => {
      unregisterList.forEach(unregister => unregister());
    };
  }, [
    activeMainTab,
    collectAgentSnapshot,
    createRoute,
    registerOperation,
    setActiveMainTab,
    setCreateRoute,
    openSettingsSheet,
    openAssistantFullPanel,
    setWorksSettingsOpen,
    setWorksSubPage,
    setWorksToolsOpen,
    worksSubPage,
  ]);

  const createScreen = useMemo(() => {
    if (createRoute === 'hub') {
      return (
        <CreateHubScreen
          onImportPhoto={() => {
            setCreateRoute('editor');
            setImportRequest({id: Date.now(), source: 'gallery'});
          }}
          onContinueEdit={() => {
            setCreateRoute('editor');
          }}
          onApplySuggestion={goal => {
            openAssistantFullPanel();
            submitGoal(goal).catch(() => undefined);
          }}
        />
      );
    }

    return (
      <GPUColorGradingScreen
        onAgentBridgeReady={bridge => {
          gradingBridgeRef.current = bridge;
        }}
        onAssistantSceneEvent={event => {
          emitAssistantEvent({
            id: `grading_${event.trigger}_${Date.now()}`,
            page: event.page,
            trigger: event.trigger,
          });
        }}
        externalApplyParamsRequest={reuseRequest}
        externalImportRequest={importRequest}
      />
    );
  }, [
    createRoute,
    emitAssistantEvent,
    importRequest,
    openAssistantFullPanel,
    reuseRequest,
    setCreateRoute,
    submitGoal,
  ]);

  const worksScreen = useMemo(() => {
    if (worksSubPage === 'community') {
      return (
        <View style={styles.secondaryPage}>
          <View style={styles.secondaryHeader}>
            <Pressable
              style={styles.backChip}
              onPress={() => {
                setWorksSubPage('library');
                setWorksToolsOpen(false);
              }}>
              <Icon name="chevron-back-outline" size={14} color={VISION_THEME.text.secondary} />
              <Text style={styles.backChipText}>返回作品</Text>
            </Pressable>
          </View>
          <View style={styles.secondaryBody}>
            <CommunityScreen
              onAgentBridgeReady={bridge => {
                communityBridgeRef.current = bridge;
              }}
              onReuseGradingParams={params => {
                setReuseRequest({id: Date.now(), params});
                setActiveMainTab('create');
                setCreateRoute('editor');
              }}
            />
          </View>
        </View>
      );
    }
    if (worksSubPage === 'modeling') {
      return (
        <View style={styles.secondaryPage}>
          <View style={styles.secondaryHeader}>
            <Pressable
              style={styles.backChip}
              onPress={() => {
                setWorksSubPage('library');
                setWorksToolsOpen(false);
              }}>
              <Icon name="chevron-back-outline" size={14} color={VISION_THEME.text.secondary} />
              <Text style={styles.backChipText}>返回作品</Text>
            </Pressable>
          </View>
          <View style={styles.secondaryBody}>
            <TwoDToThreeDScreen
              onAgentBridgeReady={bridge => {
                convertBridgeRef.current = bridge;
              }}
            />
          </View>
        </View>
      );
    }
    return (
      <WorksScreen
        filter={worksFilter}
        onChangeFilter={setWorksFilter}
        onOpenCommunity={() => {
          setWorksSubPage('community');
          setWorksToolsOpen(true);
        }}
        onOpenModeling={() => {
          setWorksSubPage('modeling');
          setWorksToolsOpen(true);
        }}
        onOpenSettings={() => {
          setWorksSubPage('settings');
          setWorksSettingsOpen(true);
        }}
        onReuseInEditor={() => {
          setActiveMainTab('create');
          setCreateRoute('editor');
        }}
      />
    );
  }, [
    setActiveMainTab,
    setCreateRoute,
    setWorksFilter,
    setWorksSettingsOpen,
    setWorksSubPage,
    setWorksToolsOpen,
    worksFilter,
    worksSubPage,
  ]);

  const screen = useMemo(() => {
    if (activeMainTab === 'works') {
      return worksScreen;
    }
    return createScreen;
  }, [activeMainTab, createScreen, worksScreen]);

  const activeDockKey = assistantPanelMode === 'full' ? 'assistantAction' : activeMainTab;

  const activeTabMeta = useMemo(
    () => TABS.find(tab => tab.key === activeDockKey) || TABS[0],
    [activeDockKey],
  );

  const subtitle =
    activeMainTab === 'create'
      ? `创作/${createRoute === 'hub' ? '入口' : '编辑器'}`
      : `作品/${worksPageLabel(worksSubPage)}`;

  const topPanelAnimatedStyle = {
    opacity: shellAnim,
    transform: [
      {
        translateY: shellAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-16, 0],
        }),
      },
    ],
  };

  const dockAnimatedStyle = {
    opacity: shellAnim,
    transform: [
      {
        translateY: shellAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      },
    ],
  };

  return (
    <LinearGradient colors={VISION_THEME.gradients.page} style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={VISION_THEME.background.top} />
      <Animated.View
        style={[
          styles.topPanel,
          topPanelAnimatedStyle,
          {paddingTop: Math.max(insets.top + 8, 16)},
        ]}>
        <View style={styles.topPanelCard}>
          <Text style={styles.brandTitle}>AI CAMERA STUDIO</Text>
          <Text style={styles.brandSubtitle}>{subtitle}</Text>
          <StatusStrip
            compact
            items={[
              {label: activeTabMeta.label, icon: activeTabMeta.icon, tone: 'active'},
              {
                label: activeMainTab === 'works' && worksToolsOpen ? '工具态' : '主流程',
                icon: activeMainTab === 'works' ? 'construct-outline' : 'navigate-outline',
                tone: activeMainTab === 'works' && worksToolsOpen ? 'warning' : 'idle',
                pulse: activeMainTab === 'works' && worksToolsOpen,
              },
            ]}
          />
          {activeMainTab === 'create' ? (
            <View style={styles.routeChipRow}>
              {CREATE_ROUTES.map(route => {
                const active = route.key === createRoute;
                return (
                  <Pressable
                    key={route.key}
                    style={[styles.routeChip, active && styles.routeChipActive]}
                    onPress={() => setCreateRoute(route.key)}>
                    <Text style={[styles.routeChipText, active && styles.routeChipTextActive]}>
                      {route.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {activeMainTab === 'works' ? (
            <View style={styles.routeChipRow}>
              <View style={[styles.routeChip, styles.routeChipActive]}>
                <Text style={styles.routeChipTextActive}>{worksPageLabel(worksSubPage)}</Text>
              </View>
            </View>
          ) : null}
        </View>
      </Animated.View>

      <View style={styles.screenArea}>
        <View style={styles.screenSurface}>{screen}</View>
      </View>

      <Animated.View
        style={[
          styles.tabBarOuter,
          dockAnimatedStyle,
          {paddingBottom: Math.max(insets.bottom, 10)},
        ]}>
        <View style={styles.tabBar}>
          {TABS.map(tab => {
            const active = activeDockKey === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[styles.tabItem, active && styles.tabItemActive]}
                onPress={() => {
                  if (tab.key === 'assistantAction') {
                    openAssistantFullPanel();
                    return;
                  }
                  setActiveMainTab(tab.key);
                }}>
                <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                  <Icon
                    name={tab.icon}
                    size={18}
                    color={active ? '#EAF4FF' : 'rgba(245,247,251,0.66)'}
                  />
                </View>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      <BottomSheetPanel
        visible={worksSettingsOpen}
        title="账号与偏好"
        onClose={() => setWorksSettingsOpen(false)}>
        <ProfileSettingsScreen
          onAgentBridgeReady={bridge => {
            profileBridgeRef.current = bridge;
          }}
        />
      </BottomSheetPanel>

      <GlobalAgentSprite />
    </LinearGradient>
  );
};

const AppShell: React.FC = () => {
  const activeMainTab = useAppStore(state => state.activeMainTab);
  const setActiveMainTab = useAppStore(state => state.setActiveMainTab);
  const createRoute = useAppStore(state => state.createRoute);
  const setCreateRoute = useAppStore(state => state.setCreateRoute);
  const worksSubPage = useAppStore(state => state.worksSubPage);
  const setWorksSubPage = useAppStore(state => state.setWorksSubPage);
  const worksFilter = useAppStore(state => state.worksFilter);
  const setWorksFilter = useAppStore(state => state.setWorksFilter);
  const worksToolsOpen = useAppStore(state => state.worksToolsOpen);
  const setWorksToolsOpen = useAppStore(state => state.setWorksToolsOpen);
  const worksSettingsOpen = useAppStore(state => state.worksSettingsOpen);
  const setWorksSettingsOpen = useAppStore(state => state.setWorksSettingsOpen);
  useEffect(() => {
    if (activeMainTab === 'assistant') {
      setActiveMainTab('create');
    }
  }, [activeMainTab, setActiveMainTab]);

  const runtimeTab = (activeMainTab === 'assistant' ? 'create' : activeMainTab) as AgentAppTab;

  return (
    <AgentRuntimeProvider
      currentTab={runtimeTab}
      userId={AGENT_RUNTIME_USER_ID}
      namespace={AGENT_RUNTIME_NAMESPACE}
      grantedScopes={AGENT_DEFAULT_GRANTED_SCOPES}
      debugPermissionOverride={AGENT_DEBUG_PERMISSION_OVERRIDE}
      contextSnapshot={() => ({
        currentMainTab: activeMainTab,
        currentCreateRoute: createRoute,
        currentWorksSubPage: worksSubPage,
        currentHomeRoute: mapCreateRouteToLegacy(createRoute),
      })}>
      <AppShellContent
        activeMainTab={activeMainTab}
        setActiveMainTab={setActiveMainTab}
        createRoute={createRoute}
        setCreateRoute={setCreateRoute}
        worksSubPage={worksSubPage}
        setWorksSubPage={setWorksSubPage}
        worksFilter={worksFilter}
        setWorksFilter={setWorksFilter}
        worksToolsOpen={worksToolsOpen}
        setWorksToolsOpen={setWorksToolsOpen}
        worksSettingsOpen={worksSettingsOpen}
        setWorksSettingsOpen={setWorksSettingsOpen}
      />
    </AgentRuntimeProvider>
  );
};

function App() {
  return (
    <RootProviders>
      <AppShell />
    </RootProviders>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topPanel: {
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  topPanelCard: {
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(14, 24, 40, 0.76)',
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    gap: 8,
  },
  brandTitle: {
    color: VISION_THEME.text.primary,
    fontSize: 13,
    letterSpacing: 1.2,
    fontWeight: '800',
  },
  brandSubtitle: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
    fontWeight: '500',
  },
  routeChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeChip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  routeChipActive: {
    borderColor: 'rgba(77,163,255,0.6)',
    backgroundColor: 'rgba(77,163,255,0.2)',
  },
  routeChipText: {
    color: VISION_THEME.text.secondary,
    fontSize: 11,
    fontWeight: '600',
  },
  routeChipTextActive: {
    color: '#EAF4FF',
    fontSize: 11,
    fontWeight: '700',
  },
  screenArea: {
    flex: 1,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  screenSurface: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(12, 18, 31, 0.6)',
  },
  tabBarOuter: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(10, 16, 27, 0.9)',
    paddingVertical: 8,
    paddingHorizontal: 8,
    shadowColor: '#4DA3FF',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 6},
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  tabItemActive: {
    backgroundColor: 'rgba(77,163,255,0.2)',
  },
  iconWrap: {
    width: 34,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: 'rgba(111,231,255,0.2)',
  },
  tabLabel: {
    fontSize: 11,
    color: 'rgba(245,247,251,0.66)',
    fontWeight: '700',
  },
  tabLabelActive: {
    color: '#EAF4FF',
  },
  secondaryPage: {
    flex: 1,
    backgroundColor: VISION_THEME.background.secondary,
  },
  secondaryHeader: {
    paddingTop: 8,
    paddingHorizontal: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(10,16,27,0.74)',
  },
  backChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  backChipText: {
    color: VISION_THEME.text.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  secondaryBody: {
    flex: 1,
  },
});

export default App;
