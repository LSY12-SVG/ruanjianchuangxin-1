import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type {ModuleHealthItem} from '../../modules/api';
import {canvasText} from '../../theme/canvasDesign';
import {VISION_THEME} from '../../theme/visionTheme';

interface SystemStatusBarProps {
  loading: boolean;
  error: string;
  modules: ModuleHealthItem[];
}

const stateColor = (status: ModuleHealthItem['status']): string => {
  if (status === 'healthy') {
    return VISION_THEME.feedback.success;
  }
  if (status === 'degraded') {
    return '#C48738';
  }
  return VISION_THEME.feedback.danger;
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

  const summaryColor =
    error || down.length > 0
      ? VISION_THEME.feedback.danger
      : degraded.length > 0
        ? '#C48738'
        : VISION_THEME.feedback.success;

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
          <View key={item.module} style={styles.modulePill}>
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
    borderBottomColor: 'rgba(160, 132, 118, 0.24)',
    backgroundColor: 'rgba(247, 241, 236, 0.92)',
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
    gap: 6,
  },
  modulePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(171,129,110,0.22)',
    backgroundColor: 'rgba(255,248,243,0.75)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  moduleLabel: {
    ...canvasText.caption,
    fontSize: 9,
    color: 'rgba(89, 73, 65, 0.86)',
    textTransform: 'uppercase',
  },
});
