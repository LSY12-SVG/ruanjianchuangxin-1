import React, {useMemo, useState} from 'react';
import {StatusBar, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import GPUColorGradingScreen from './src/screens/GPUColorGradingScreen';
import {TwoDToThreeDScreen} from './src/screens/TwoDToThreeDScreen';
import {AIAgentScreen} from './src/screens/AIAgentScreen';
import {CommunityScreen} from './src/screens/CommunityScreen';
import {ProfileSettingsScreen} from './src/screens/ProfileSettingsScreen';
import {VISION_THEME} from './src/theme/visionTheme';

type AppTab = 'grading' | 'convert' | 'agent' | 'community' | 'profile';

interface TabConfig {
  key: AppTab;
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

const AppShell: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('grading');
  const insets = useSafeAreaInsets();

  const screen = useMemo(() => {
    switch (activeTab) {
      case 'grading':
        return <GPUColorGradingScreen />;
      case 'convert':
        return <TwoDToThreeDScreen />;
      case 'agent':
        return <AIAgentScreen />;
      case 'community':
        return <CommunityScreen />;
      case 'profile':
        return <ProfileSettingsScreen />;
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
              <View
                style={[
                  styles.iconWrap,
                  active && styles.iconWrapActive,
                ]}>
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
    </View>
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

