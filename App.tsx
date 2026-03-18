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
import {AIAgentScreen} from './src/screens/AIAgentScreen';
import {
  CommunityScreen,
  type CommunityAgentBridge,
} from './src/screens/CommunityScreen';
import {
  ProfileSettingsScreen,
  type ProfileSettingsAgentBridge,
} from './src/screens/ProfileSettingsScreen';
import {HomeHubScreen} from './src/screens/HomeHubScreen';
import {HomeModuleShell} from './src/components/home/HomeModuleShell';
import {AgentRuntimeProvider, useAgentRuntime} from './src/agent/runtimeContext';
import type {AgentAppTab} from './src/agent/types';
import type {HomeRouteKey, MainTabKey} from './src/types/navigation';
import {GlobalAgentSprite} from './src/components/agent/GlobalAgentSprite';
import type {ColorGradingParams} from './src/types/colorGrading';
import {RootProviders} from './src/providers/RootProviders';
import {useAppStore} from './src/store/appStore';

interface TabConfig {
  key: MainTabKey;
  label: string;
  icon: string;
}

const TABS: TabConfig[] = [
  {key: 'home', label: '首页', icon: 'home-outline'},
  {key: 'agent', label: '助手', icon: 'sparkles-outline'},
  {key: 'community', label: '社区', icon: 'people-outline'},
  {key: 'profile', label: '我的', icon: 'person-outline'},
];

const HOME_ROUTES: Array<{key: HomeRouteKey; label: string; icon: string}> = [
  {key: 'hub', label: '总览', icon: 'grid-outline'},
  {key: 'grading', label: '调色', icon: 'color-filter-outline'},
  {key: 'modeling', label: '建模', icon: 'cube-outline'},
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
  homeRoute: HomeRouteKey;
  setHomeRoute: (route: HomeRouteKey) => void;
}

const asTab = (value: unknown): MainTabKey => {
  if (value === 'home' || value === 'agent' || value === 'community' || value === 'profile') {
    return value;
  }
  return 'agent';
};

const asHomeRoute = (value: unknown): HomeRouteKey => {
  if (value === 'hub' || value === 'grading' || value === 'modeling') {
    return value;
  }
  return 'hub';
};

const AppShellContent: React.FC<AppShellContentProps> = ({
  activeMainTab,
  setActiveMainTab,
  homeRoute,
  setHomeRoute,
}) => {
  const insets = useSafeAreaInsets();
  const {registerOperation} = useAgentRuntime();
  const shellAnim = useRef(new Animated.Value(0)).current;

  const gradingBridgeRef = useRef<GPUColorGradingAgentBridge | null>(null);
  const convertBridgeRef = useRef<TwoDToThreeDAgentBridge | null>(null);
  const communityBridgeRef = useRef<CommunityAgentBridge | null>(null);
  const profileBridgeRef = useRef<ProfileSettingsAgentBridge | null>(null);
  const [reuseRequest, setReuseRequest] = useState<{
    id: number;
    params: ColorGradingParams;
  } | null>(null);

  const collectAgentSnapshot = useCallback(() => {
    const grading = gradingBridgeRef.current?.getSnapshot() || null;
    const convert = convertBridgeRef.current?.getSnapshot() || null;
    const community = communityBridgeRef.current?.getSnapshot() || null;
    const profile = profileBridgeRef.current?.getSnapshot() || null;
    return {
      currentMainTab: activeMainTab,
      currentHomeRoute: homeRoute,
      'home.grading': grading || undefined,
      'home.modeling': convert || undefined,
      'community.snapshot': community || undefined,
      'profile.snapshot': profile || undefined,
      'community.lastDraftTitle': community?.draftTitle || '',
    };
  }, [activeMainTab, homeRoute]);

  useEffect(() => {
    Animated.timing(shellAnim, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [shellAnim]);

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
          const tab = asTab(args.mainTab ?? args.tab);
          const hasExplicitHomeRoute =
            typeof args.homeRoute === 'string' || typeof args.route === 'string';
          setActiveMainTab(tab);
          if (tab === 'home' && hasExplicitHomeRoute) {
            setHomeRoute(asHomeRoute(args.homeRoute ?? args.route));
          }
          return {
            ok: true,
            message: `已跳转到 ${tab}${tab === 'home' && hasExplicitHomeRoute ? `/${asHomeRoute(args.homeRoute ?? args.route)}` : ''}`,
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
          setActiveMainTab('home');
          setHomeRoute('grading');
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
          setActiveMainTab('home');
          setHomeRoute('grading');
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
          setActiveMainTab('home');
          setHomeRoute('modeling');
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
          setActiveMainTab('community');
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
          setActiveMainTab('community');
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
          setActiveMainTab('profile');
          const bridge = profileBridgeRef.current;
          if (!bridge) {
            return {ok: false, message: '设置页面未就绪'};
          }
          const args = action.args || {};
          return bridge.applyPatch({
            syncOnWifi: typeof args.syncOnWifi === 'boolean' ? args.syncOnWifi : undefined,
            communityNotify:
              typeof args.communityNotify === 'boolean' ? args.communityNotify : undefined,
            voiceAutoApply:
              typeof args.voiceAutoApply === 'boolean' ? args.voiceAutoApply : undefined,
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
          message: `当前页面: ${activeMainTab}${activeMainTab === 'home' ? `/${homeRoute}` : ''}`,
        }),
      }),
    );

    return () => {
      unregisterList.forEach(unregister => unregister());
    };
  }, [activeMainTab, collectAgentSnapshot, homeRoute, registerOperation, setActiveMainTab, setHomeRoute]);

  const homeScreen = useMemo(() => {
    if (homeRoute === 'hub') {
      return <HomeHubScreen onNavigateModule={route => setHomeRoute(route)} />;
    }
    if (homeRoute === 'grading') {
      return (
        <HomeModuleShell route={homeRoute} onRouteChange={setHomeRoute}>
          <GPUColorGradingScreen
            onAgentBridgeReady={bridge => {
              gradingBridgeRef.current = bridge;
            }}
            externalApplyParamsRequest={reuseRequest}
          />
        </HomeModuleShell>
      );
    }
    return (
      <HomeModuleShell route={homeRoute} onRouteChange={setHomeRoute}>
        <TwoDToThreeDScreen
          onAgentBridgeReady={bridge => {
            convertBridgeRef.current = bridge;
          }}
        />
      </HomeModuleShell>
    );
  }, [homeRoute, reuseRequest, setHomeRoute]);

  const screen = useMemo(() => {
    switch (activeMainTab) {
      case 'home':
        return homeScreen;
      case 'agent':
        return <AIAgentScreen />;
      case 'community':
        return (
          <CommunityScreen
            onAgentBridgeReady={bridge => {
              communityBridgeRef.current = bridge;
            }}
            onReuseGradingParams={params => {
              setReuseRequest({
                id: Date.now(),
                params,
              });
              setActiveMainTab('home');
              setHomeRoute('grading');
            }}
          />
        );
      case 'profile':
        return (
          <ProfileSettingsScreen
            onAgentBridgeReady={bridge => {
              profileBridgeRef.current = bridge;
            }}
          />
        );
      default:
        return homeScreen;
    }
  }, [activeMainTab, homeScreen, setActiveMainTab, setHomeRoute]);

  const activeTabMeta = useMemo(
    () => TABS.find(tab => tab.key === activeMainTab) || TABS[0],
    [activeMainTab],
  );

  const homeRouteMeta = useMemo(
    () => HOME_ROUTES.find(route => route.key === homeRoute) || HOME_ROUTES[0],
    [homeRoute],
  );

  const headerSubtitle =
    activeMainTab === 'home'
      ? `当前模块 · ${homeRouteMeta.label}`
      : `当前区域 · ${activeTabMeta.label}`;

  const topPanelAnimatedStyle = {
    opacity: shellAnim,
    transform: [
      {
        translateY: shellAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-14, 0],
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
          outputRange: [18, 0],
        }),
      },
    ],
  };

  return (
    <LinearGradient
      colors={['#2a0f18', '#4a1628', '#1d0b12']}
      locations={[0.02, 0.48, 1]}
      style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#2a0f18" />
      <Animated.View
        style={[
          styles.topPanel,
          topPanelAnimatedStyle,
          {
            paddingTop: Math.max(insets.top + 10, 20),
          },
        ]}>
        <View style={styles.topPanelCard}>
          <Text style={styles.brandTitle}>VISION GENIE STUDIO</Text>
          <Text style={styles.brandSubtitle}>{headerSubtitle}</Text>
          <View style={styles.topPanelMetaRow}>
            <View style={styles.metaBadge}>
              <Icon name={activeTabMeta.icon} size={14} color="#ffc799" />
              <Text style={styles.metaBadgeText}>{activeTabMeta.label}</Text>
            </View>
            <View style={styles.metaBadgeMuted}>
              <Text style={styles.metaBadgeMutedText}>AI Driven Workflow</Text>
            </View>
          </View>
          <View style={styles.routeChipRow}>
            {HOME_ROUTES.map(route => {
              const active = activeMainTab === 'home' && homeRoute === route.key;
              return (
                <Pressable
                  key={route.key}
                  style={[styles.routeChip, active && styles.routeChipActive]}
                  onPress={() => {
                    setActiveMainTab('home');
                    setHomeRoute(route.key);
                  }}>
                  <Icon
                    name={route.icon}
                    size={14}
                    color={active ? '#ffe9d6' : 'rgba(255, 226, 202, 0.72)'}
                  />
                  <Text style={[styles.routeChipText, active && styles.routeChipTextActive]}>
                    {route.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Animated.View>
      <View style={styles.screenArea}>
        <View style={styles.screenSurface}>{screen}</View>
      </View>
      <Animated.View
        style={[
          styles.tabBarOuter,
          dockAnimatedStyle,
          {
            paddingBottom: Math.max(insets.bottom, 10),
          },
        ]}>
        <View style={styles.tabBar}>
          {TABS.map(tab => {
            const active = activeMainTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[styles.tabItem, active && styles.tabItemActive]}
                onPress={() => setActiveMainTab(tab.key)}>
                <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                  <Icon
                    name={tab.icon}
                    size={18}
                    color={active ? '#fff3e8' : 'rgba(255, 225, 198, 0.68)'}
                  />
                </View>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
      <GlobalAgentSprite />
    </LinearGradient>
  );
};

const AppShell: React.FC = () => {
  const activeMainTab = useAppStore(state => state.activeMainTab);
  const setActiveMainTab = useAppStore(state => state.setActiveMainTab);
  const homeRoute = useAppStore(state => state.homeRoute);
  const setHomeRoute = useAppStore(state => state.setHomeRoute);

  return (
    <AgentRuntimeProvider
      currentTab={activeMainTab as AgentAppTab}
      userId={AGENT_RUNTIME_USER_ID}
      namespace={AGENT_RUNTIME_NAMESPACE}
      grantedScopes={AGENT_DEFAULT_GRANTED_SCOPES}
      debugPermissionOverride={AGENT_DEBUG_PERMISSION_OVERRIDE}
      contextSnapshot={() => ({
        currentMainTab: activeMainTab,
        currentHomeRoute: homeRoute,
      })}>
      <AppShellContent
        activeMainTab={activeMainTab}
        setActiveMainTab={setActiveMainTab}
        homeRoute={homeRoute}
        setHomeRoute={setHomeRoute}
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
    paddingBottom: 10,
  },
  topPanelCard: {
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(22, 10, 16, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 188, 150, 0.24)',
    gap: 8,
  },
  brandTitle: {
    color: '#ffe9d2',
    fontSize: 13,
    letterSpacing: 1.4,
    fontWeight: '800',
  },
  brandSubtitle: {
    color: 'rgba(255, 224, 201, 0.86)',
    fontSize: 12,
    fontWeight: '500',
  },
  topPanelMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 144, 84, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 177, 124, 0.32)',
  },
  metaBadgeText: {
    color: '#ffd9bc',
    fontSize: 11,
    fontWeight: '700',
  },
  metaBadgeMuted: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 237, 224, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 192, 160, 0.2)',
  },
  metaBadgeMutedText: {
    color: 'rgba(255, 221, 198, 0.72)',
    fontSize: 10,
    fontWeight: '600',
  },
  routeChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 198, 164, 0.2)',
    backgroundColor: 'rgba(255, 246, 236, 0.04)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  routeChipActive: {
    borderColor: 'rgba(255, 203, 148, 0.72)',
    backgroundColor: 'rgba(255, 153, 102, 0.24)',
  },
  routeChipText: {
    color: 'rgba(255, 214, 185, 0.8)',
    fontSize: 11,
    fontWeight: '600',
  },
  routeChipTextActive: {
    color: '#fff3e8',
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
    borderColor: 'rgba(255, 191, 150, 0.24)',
    backgroundColor: 'rgba(24, 11, 17, 0.48)',
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
    borderColor: 'rgba(255, 185, 145, 0.28)',
    backgroundColor: 'rgba(16, 8, 12, 0.86)',
    paddingVertical: 8,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 8},
    elevation: 10,
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
    backgroundColor: 'rgba(255, 143, 86, 0.22)',
  },
  iconWrap: {
    width: 34,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: 'rgba(255, 178, 133, 0.28)',
  },
  tabLabel: {
    fontSize: 11,
    color: 'rgba(255, 216, 188, 0.68)',
    fontWeight: '700',
  },
  tabLabelActive: {
    color: '#fff4e8',
  },
});

export default App;
