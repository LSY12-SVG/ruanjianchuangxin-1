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

const PAGE_GRADIENT = ['#060C1E', '#132A5C', '#2A195B'] as [string, string, string];

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
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeTab, screenAnim]);

  const page = useMemo(() => {
    if (activeTab === 'create') {
      return <CreateScreen capabilities={capabilities} />;
    }
    if (activeTab === 'model') {
      return <ModelScreen capabilities={capabilities} />;
    }
    if (activeTab === 'agent') {
      return <AgentScreen capabilities={capabilities} />;
    }
    return <CommunityScreen capabilities={capabilities} />;
  }, [activeTab, capabilities]);

  return (
    <LinearGradient colors={PAGE_GRADIENT} style={styles.root}>
      <View pointerEvents="none" style={styles.orbLayer}>
        <View style={[styles.orb, styles.orbPrimary]} />
        <View style={[styles.orb, styles.orbAccent]} />
        <View style={[styles.orb, styles.orbWarm]} />
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
    opacity: 0.16,
  },
  orbPrimary: {
    width: 380,
    height: 380,
    right: -120,
    top: -110,
    backgroundColor: '#35D5C5',
  },
  orbAccent: {
    width: 320,
    height: 320,
    left: -130,
    bottom: '22%',
    backgroundColor: '#AA63F9',
    opacity: 0.12,
  },
  orbWarm: {
    width: 260,
    height: 260,
    right: 16,
    top: '40%',
    backgroundColor: '#FF9B39',
    opacity: 0.07,
  },
  pageWrap: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
});
