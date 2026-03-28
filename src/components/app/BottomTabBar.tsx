import React, {useMemo, useRef} from 'react';
import {Animated, Easing, Pressable, StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {canvasText, glassShadow} from '../../theme/canvasDesign';
import {radius} from '../../theme/radius';
import {semanticColors} from '../../theme/tokens';
import {VISION_THEME} from '../../theme/visionTheme';

export type AppTabKey = 'create' | 'model' | 'agent' | 'community' | 'profile';

const TAB_CONFIG: Array<{
  key: AppTabKey;
  label: string;
  icon: string;
}> = [
  {key: 'create', label: '创作', icon: 'color-wand'},
  {key: 'model', label: '模型', icon: 'cube'},
  {key: 'agent', label: 'Agent', icon: 'sparkles'},
  {key: 'community', label: '社区', icon: 'people'},
  {key: 'profile', label: '我的', icon: 'person-circle'},
];

interface BottomTabBarProps {
  activeTab: AppTabKey;
  onChangeTab: (tab: AppTabKey) => void;
  bottomInset: number;
  activeStyle?: 'fill' | 'outline';
  motionPreset?: 'soft' | 'snappy';
}

export const BottomTabBar: React.FC<BottomTabBarProps> = ({
  activeTab,
  onChangeTab,
  bottomInset,
  activeStyle = 'fill',
  motionPreset = 'soft',
}) => {
  const scales = useRef(
    Object.fromEntries(TAB_CONFIG.map(tab => [tab.key, new Animated.Value(1)])) as Record<
      AppTabKey,
      Animated.Value
    >,
  ).current;
  const pressDuration = useMemo(
    () => (motionPreset === 'snappy' ? 110 : VISION_THEME.motionPresets.press.duration),
    [motionPreset],
  );
  const pressIn = (key: AppTabKey) => {
    Animated.timing(scales[key], {
      toValue: VISION_THEME.motionPresets.press.activeScale,
      duration: pressDuration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };
  const pressOut = (key: AppTabKey) => {
    Animated.timing(scales[key], {
      toValue: 1,
      duration: pressDuration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  return (
    <View style={[styles.wrap, {paddingBottom: Math.max(bottomInset, 8)}]}>
      <View style={styles.tabBar}>
        {TAB_CONFIG.map(tab => {
          const active = tab.key === activeTab;
          return (
            <Animated.View
              key={tab.key}
              style={{
                flex: 1,
                transform: [{scale: scales[tab.key]}],
              }}>
              <Pressable
                testID={`tab-${tab.key}`}
                style={[
                  styles.item,
                  active && (activeStyle === 'outline' ? styles.itemActiveOutline : styles.itemActive),
                ]}
                onPress={() => onChangeTab(tab.key)}
                onPressIn={() => pressIn(tab.key)}
                onPressOut={() => pressOut(tab.key)}>
                <View style={styles.iconWrap}>
                  <Icon
                    name={tab.icon}
                    size={18}
                    color={active ? '#FFFFFF' : semanticColors.text.secondary}
                  />
                </View>
                <Text style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 10,
    paddingHorizontal: 14,
  },
  tabBar: {
    ...glassShadow,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.92)',
    backgroundColor: VISION_THEME.surface.nav,
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 7,
    paddingVertical: 8,
  },
  item: {
    width: '100%',
    minHeight: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    paddingBottom: 7,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  itemActive: {
    backgroundColor: semanticColors.accent.primary,
    borderColor: 'transparent',
  },
  itemActiveOutline: {
    borderColor: semanticColors.border.focus,
    backgroundColor: 'rgba(79,70,229,0.1)',
  },
  iconWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...canvasText.caption,
    color: semanticColors.text.secondary,
    marginTop: 2,
    lineHeight: 14,
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
    minWidth: 34,
  },
  labelActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
