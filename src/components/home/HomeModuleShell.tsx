import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import Icon from 'react-native-vector-icons/Ionicons';
import {AppButton} from '../ui/AppButton';
import {TopSegment} from '../ui/TopSegment';
import {VISION_THEME} from '../../theme/visionTheme';
import type {HomeRouteKey} from '../../types/navigation';

interface HomeModuleShellProps {
  route: HomeRouteKey;
  onRouteChange: (route: HomeRouteKey) => void;
  children: React.ReactNode;
}

const items = [
  {value: 'hub', label: '首页'},
  {value: 'grading', label: '调色'},
  {value: 'modeling', label: '建模'},
];

export const HomeModuleShell: React.FC<HomeModuleShellProps> = ({route, onRouteChange, children}) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Icon name="flame-outline" size={18} color={VISION_THEME.accent.strong} />
          <Text style={styles.title}>Vision 创作中心</Text>
        </View>
        <AppButton label="返回首页" mode="outlined" onPress={() => onRouteChange('hub')} />
      </View>
      <TopSegment value={route} items={items} onValueChange={value => onRouteChange(value as HomeRouteKey)} />
      <View style={styles.content}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: VISION_THEME.background.bottom,
  },
  header: {
    paddingTop: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: VISION_THEME.text.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
});
