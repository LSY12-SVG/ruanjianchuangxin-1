import React from 'react';
import {StyleSheet, Text, View, type ViewStyle} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {VISION_THEME} from '../../theme/visionTheme';
import {PulseDot} from './PulseDot';

export interface StatusStripItem {
  key?: string;
  label?: string;
  icon?: string;
  tone?: 'active' | 'warning' | 'idle';
  pulse?: boolean;
}

interface StatusStripProps {
  items: StatusStripItem[];
  compact?: boolean;
  style?: ViewStyle;
}

export const StatusStrip: React.FC<StatusStripProps> = ({items, compact = false, style}) => {
  return (
    <View style={[styles.row, style]}>
      {items.map((item, index) => (
        <View key={item.key || `${item.label || 'item'}_${index}`} style={[styles.chip, compact && styles.compactChip]}>
          {item.icon ? (
            <Icon
              name={item.icon}
              size={compact ? 12 : 13}
              color={item.tone === 'warning' ? VISION_THEME.feedback.warning : VISION_THEME.accent.strong}
            />
          ) : null}
          <PulseDot tone={item.tone || 'active'} size={compact ? 5 : 6} animated={item.pulse === true} />
          {item.label ? <Text style={[styles.label, compact && styles.compactLabel]}>{item.label}</Text> : null}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  compactChip: {
    minHeight: 21,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 5,
  },
  label: {
    color: VISION_THEME.text.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  compactLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
});
