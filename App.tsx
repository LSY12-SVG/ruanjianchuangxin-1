import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {StatusBar, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
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
import {VISION_THEME} from './src/theme/visionTheme';
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
          setActiveMainTab(tab);
          if (tab === 'home') {
            setHomeRoute(asHomeRoute(args.homeRoute ?? args.route));
          }
          return {
            ok: true,
            message: `已跳转到 ${tab}`,
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

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={VISION_THEME.background.top} />
      <View style={styles.screenArea}>{screen}</View>
      <View
        style={[
          styles.tabBar,
          {
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ]}>
        {TABS.map(tab => {
          const active = activeMainTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              activeOpacity={0.85}
              onPress={() => setActiveMainTab(tab.key)}>
              <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                <Icon
                  name={tab.icon}
                  size={18}
                  color={active ? VISION_THEME.accent.strong : VISION_THEME.text.muted}
                />
              </View>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <GlobalAgentSprite />
    </View>
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
    backgroundColor: VISION_THEME.background.bottom,
  },
  screenArea: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: VISION_THEME.border.soft,
    backgroundColor: VISION_THEME.surface.elevated,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  iconWrap: {
    width: 34,
    height: 28,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: VISION_THEME.surface.active,
  },
  tabLabel: {
    fontSize: 11,
    color: VISION_THEME.text.muted,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: VISION_THEME.accent.strong,
  },
});

export default App;
