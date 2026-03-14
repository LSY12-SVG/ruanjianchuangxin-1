import React from 'react';
import {StyleSheet} from 'react-native';
import {SegmentedButtons} from 'react-native-paper';
import {VISION_THEME} from '../../theme/visionTheme';

interface SegmentItem {
  value: string;
  label: string;
}

interface TopSegmentProps {
  value: string;
  items: SegmentItem[];
  onValueChange: (value: string) => void;
}

export const TopSegment: React.FC<TopSegmentProps> = ({value, items, onValueChange}) => {
  return (
    <SegmentedButtons
      value={value}
      onValueChange={onValueChange}
      style={styles.segment}
      buttons={items.map(item => ({
        value: item.value,
        label: item.label,
        checkedColor: VISION_THEME.accent.dark,
        uncheckedColor: VISION_THEME.text.secondary,
        style: {
          backgroundColor:
            value === item.value ? VISION_THEME.accent.strong : 'rgba(255,255,255,0.03)',
          borderColor: VISION_THEME.border.soft,
        },
      }))}
    />
  );
};

const styles = StyleSheet.create({
  segment: {
    marginBottom: 10,
  },
});
