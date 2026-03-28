import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Easing, StyleSheet, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {BottomTabBar, type AppTabKey} from './BottomTabBar';
import {SystemStatusBar} from './SystemStatusBar';
import {
  fetchModulesCapabilities,
  fetchModulesHealth,
  formatApiErrorMessage,
  type ModuleCapabilityItem,
  type ModuleHealthItem,
} from '../../modules/api';
import {CreateScreen} from '../../screens/CreateScreen';
import {ModelScreen} from '../../screens/ModelScreen';
import {AgentScreen} from '../../screens/AgentScreen';
import {CommunityScreen} from '../../screens/CommunityScreen';
import {MyScreen} from '../../screens/MyScreen';
import {VISION_THEME} from '../../theme/visionTheme';
import {HaruFloatingAgent} from '../assistant/HaruFloatingAgent';

const PAGE_GRADIENT = VISION_THEME.gradients.page;

const defaultModuleStates: ModuleHealthItem[] = [
  {module: 'color', status: 'down', ok: false},
  {module: 'modeling', status: 'down', ok: false},
  {module: 'agent', status: 'down', ok: false},
  {module: 'community', status: 'down', ok: false},
];

export const AppShell: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<AppTabKey>('create');
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState('');
  const [moduleStates, setModuleStates] = useState<ModuleHealthItem[]>(defaultModuleStates);
  const [capabilities, setCapabilities] = useState<ModuleCapabilityItem[]>([]);
  const screenAnim = useRef(new Animated.Value(1)).current;
  const ambientShift = useRef(new Animated.Value(0)).current;

  const refreshGatewayState = async () => {
    setHealthLoading(true);
    try {
      const [health, caps] = await Promise.all([
        fetchModulesHealth(),
        fetchModulesCapabilities(),
      ]);
      setModuleStates(
        health.items.length
          ? health.items
          : defaultModuleStates,
      );
      setCapabilities(caps);
      setHealthError('');
    } catch (error) {
      setHealthError(formatApiErrorMessage(error, '模块状态获取失败'));
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    refreshGatewayState().catch(() => undefined);
    const timer = setInterval(() => {
      refreshGatewayState().catch(() => undefined);
    }, 12000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    screenAnim.setValue(0.75);
    Animated.timing(screenAnim, {
      toValue: 1,
      duration: VISION_THEME.motionPresets.pageEnter.duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeTab, screenAnim]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ambientShift, {
          toValue: 1,
          duration: VISION_THEME.motionPresets.ambient.duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ambientShift, {
          toValue: 0,
          duration: VISION_THEME.motionPresets.ambient.duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [ambientShift]);

  const page = useMemo(() => {
    if (activeTab === 'create') {
      return <CreateScreen capabilities={capabilities} />;
    }
    if (activeTab === 'model') {
      return <ModelScreen capabilities={capabilities} />;
    }
    if (activeTab === 'agent') {
      return (
        <AgentScreen
          capabilities={capabilities}
          activeTab={activeTab}
          onNavigateTab={setActiveTab}
        />
      );
    }
    if (activeTab === 'community') {
      return <CommunityScreen capabilities={capabilities} />;
    }
    return <MyScreen />;
  }, [activeTab, capabilities]);

  return (
    <LinearGradient colors={PAGE_GRADIENT} style={styles.root}>
      <View pointerEvents="none" style={styles.orbLayer}>
        <Animated.View
          style={[
            styles.orb,
            styles.orbPrimary,
            {
              transform: [
                {
                  translateX: ambientShift.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -16],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.orb,
            styles.orbAccent,
            {
              transform: [
                {
                  translateY: ambientShift.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -12],
                  }),
                },
              ],
            },
          ]}
        />
        <View style={[styles.orb, styles.orbWarm]} />
        <View style={styles.textureDots} />
      </View>
      <View style={{height: insets.top}} />
      <SystemStatusBar loading={healthLoading} error={healthError} modules={moduleStates} />
      <Animated.View
        style={[
          styles.pageWrap,
          {
            opacity: screenAnim,
            transform: [
              {
                translateY: screenAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [12, 0],
                }),
              },
            ],
          },
        ]}>
        {page}
      </Animated.View>
      <HaruFloatingAgent
        activeTab={activeTab}
        capabilities={capabilities}
        bottomInset={insets.bottom}
        onNavigateTab={setActiveTab}
      />
      <BottomTabBar activeTab={activeTab} onChangeTab={setActiveTab} bottomInset={insets.bottom} />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  orbLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.14,
  },
  orbPrimary: {
    width: 380,
    height: 380,
    right: -120,
    top: -110,
    backgroundColor: 'rgba(99,102,241,0.22)',
    opacity: 1,
  },
  orbAccent: {
    width: 320,
    height: 320,
    left: -130,
    bottom: '22%',
    backgroundColor: 'rgba(56,189,248,0.18)',
    opacity: 1,
  },
  orbWarm: {
    width: 260,
    height: 260,
    right: 16,
    top: '40%',
    backgroundColor: 'rgba(139,92,246,0.12)',
    opacity: 1,
  },
  pageWrap: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  textureDots: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 0,
    opacity: 0.35,
  },
});
