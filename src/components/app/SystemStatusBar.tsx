import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type {ModuleHealthItem} from '../../modules/api';
import {canvasText} from '../../theme/canvasDesign';

interface SystemStatusBarProps {
  loading: boolean;
  error: string;
  modules: ModuleHealthItem[];
}

const stateColor = (status: ModuleHealthItem['status']): string => {
  if (status === 'healthy') {
    return '#73E2B6';
  }
  if (status === 'degraded') {
    return '#FFD187';
  }
  return '#FF9BB0';
};

export const SystemStatusBar: React.FC<SystemStatusBarProps> = ({
  loading,
  error,
  modules,
}) => {
  const down = modules.filter(item => item.status === 'down');
  const degraded = modules.filter(item => item.status === 'degraded');

  const summaryText = loading
    ? '系统检测中'
    : error
      ? error
      : down.length > 0
        ? `${down.map(item => item.module).join(' / ')} 不可用`
        : degraded.length > 0
          ? `${degraded.map(item => item.module).join(' / ')} 性能下降`
          : '所有模块在线';

  const summaryIcon = loading
    ? 'sync-outline'
    : error || down.length > 0
      ? 'alert-circle-outline'
      : degraded.length > 0
        ? 'warning-outline'
        : 'checkmark-circle-outline';

  const summaryColor = error || down.length > 0 ? '#FF9BB0' : degraded.length > 0 ? '#FFD187' : '#73E2B6';

  return (
    <View style={styles.wrap}>
      <View style={styles.left}>
        <Icon name={summaryIcon} size={14} color={summaryColor} />
        <Text numberOfLines={1} style={[styles.summary, {color: summaryColor}]}>
          {summaryText}
        </Text>
      </View>
      <View style={styles.right}>
        {modules.map(item => (
          <View key={item.module} style={styles.moduleDotWrap}>
            <View style={[styles.dot, {backgroundColor: stateColor(item.status)}]} />
            <Text style={styles.moduleLabel}>{item.module}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    minHeight: 38,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(158, 211, 255, 0.2)',
    backgroundColor: 'rgba(8, 14, 29, 0.8)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  summary: {
    ...canvasText.bodyMuted,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moduleDotWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  moduleLabel: {
    ...canvasText.caption,
    fontSize: 9,
    color: 'rgba(234,246,255,0.62)',
    textTransform: 'uppercase',
  },
});
