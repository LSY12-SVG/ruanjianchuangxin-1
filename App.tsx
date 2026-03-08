import React, {useEffect, useMemo, useRef, useState} from 'react';
import {StatusBar, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
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
import {VISION_THEME} from './src/theme/visionTheme';
import {AgentRuntimeProvider, useAgentRuntime} from './src/agent/runtimeContext';
import type {AgentAppTab} from './src/agent/types';
import {GlobalAgentSprite} from './src/components/agent/GlobalAgentSprite';
import type {ColorGradingParams} from './src/types/colorGrading';

interface TabConfig {
  key: AgentAppTab;
  label: string;
  icon: string;
}

const TABS: TabConfig[] = [
  {key: 'grading', label: '智能调色', icon: 'color-filter-outline'},
  {key: 'convert', label: '2D转3D', icon: 'cube-outline'},
  {key: 'agent', label: 'AI助手', icon: 'sparkles-outline'},
  {key: 'community', label: '社区', icon: 'people-outline'},
  {key: 'profile', label: '我的', icon: 'person-outline'},
];

interface AppShellContentProps {
  activeTab: AgentAppTab;
  setActiveTab: React.Dispatch<React.SetStateAction<AgentAppTab>>;
}

const asTab = (value: unknown): AgentAppTab => {
  if (
    value === 'grading' ||
    value === 'convert' ||
    value === 'agent' ||
    value === 'community' ||
    value === 'profile'
  ) {
    return value;
  }
  return 'agent';
};

const AppShellContent: React.FC<AppShellContentProps> = ({activeTab, setActiveTab}) => {
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

  useEffect(() => {
    const unregisterList: Array<() => void> = [];

    unregisterList.push(
      registerOperation({
        domain: 'navigation',
        operation: 'navigate_tab',
        description: '页面跳转',
        defaultRisk: 'low',
        execute: async action => {
          const tab = asTab(action.args?.tab);
          setActiveTab(tab);
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
        execute: async () => {
          setActiveTab('grading');
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
        execute: async () => {
          setActiveTab('grading');
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
        execute: async action => {
          setActiveTab('convert');
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
        execute: async action => {
          setActiveTab('community');
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
        execute: async () => {
          setActiveTab('community');
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
        execute: async action => {
          setActiveTab('profile');
          const bridge = profileBridgeRef.current;
          if (!bridge) {
            return {ok: false, message: '设置页面未就绪'};
          }
          const args = action.args || {};
          return bridge.applyPatch({
            syncOnWifi:
              typeof args.syncOnWifi === 'boolean' ? args.syncOnWifi : undefined,
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
        execute: async () => ({
          ok: true,
          message: `当前页面: ${activeTab}`,
        }),
      }),
    );

    return () => {
      unregisterList.forEach(unregister => unregister());
    };
  }, [activeTab, registerOperation, setActiveTab]);

  const screen = useMemo(() => {
    switch (activeTab) {
      case 'grading':
        return (
          <GPUColorGradingScreen
            onAgentBridgeReady={bridge => {
              gradingBridgeRef.current = bridge;
            }}
            externalApplyParamsRequest={reuseRequest}
          />
        );
      case 'convert':
        return (
          <TwoDToThreeDScreen
            onAgentBridgeReady={bridge => {
              convertBridgeRef.current = bridge;
            }}
          />
        );
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
              setActiveTab('grading');
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
        return <GPUColorGradingScreen />;
    }
  }, [activeTab]);

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
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              activeOpacity={0.82}
              onPress={() => setActiveTab(tab.key)}>
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
  const [activeTab, setActiveTab] = useState<AgentAppTab>('grading');

  return (
    <AgentRuntimeProvider currentTab={activeTab}>
      <AppShellContent activeTab={activeTab} setActiveTab={setActiveTab} />
    </AgentRuntimeProvider>
  );
};

function App() {
  return (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
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
