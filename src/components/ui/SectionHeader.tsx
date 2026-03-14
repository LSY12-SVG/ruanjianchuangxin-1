import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {VISION_THEME} from '../../theme/visionTheme';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({title, subtitle, rightSlot}) => (
  <View style={styles.row}>
    <View style={styles.left}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
    {rightSlot}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  left: {
    flex: 1,
  },
  title: {
    color: VISION_THEME.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 2,
    color: VISION_THEME.text.muted,
    fontSize: 12,
  },
});
