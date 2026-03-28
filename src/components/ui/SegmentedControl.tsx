import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {canvasText} from '../../theme/canvasDesign';
import {componentStyles} from '../../theme/components';
import {radius} from '../../theme/radius';
import {spacing} from '../../theme/spacing';
import {semanticColors} from '../../theme/tokens';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: Array<SegmentedOption<T>>;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: SegmentedControlProps<T>): React.ReactElement {
  return (
    <View style={styles.rail}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={[styles.item, active && styles.itemActive]}
            onPress={() => onChange(option.value)}>
            {option.icon}
            <Text style={[styles.label, active && styles.labelActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    ...componentStyles.segmentedRail,
    flexDirection: 'row',
    padding: 4,
    gap: 6,
  },
  item: {
    flex: 1,
    minHeight: 50,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  itemActive: {
    ...componentStyles.segmentedItemActive,
  },
  label: {
    ...canvasText.bodyStrong,
    color: semanticColors.text.secondary,
  },
  labelActive: {
    color: semanticColors.text.primary,
  },
});
