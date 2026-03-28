import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {canvasText} from '../../theme/canvasDesign';
import {componentStyles} from '../../theme/components';
import {spacing} from '../../theme/spacing';
import {semanticColors} from '../../theme/tokens';

interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onPress?: () => void;
  trailingText?: string;
}

export const ListRow: React.FC<ListRowProps> = ({
  title,
  subtitle,
  icon,
  onPress,
  trailingText,
}) => {
  const Body = onPress ? Pressable : View;
  return (
    <Body style={[componentStyles.listRow, styles.row]} onPress={onPress}>
      <View style={styles.left}>
        {icon}
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.right}>
        {trailingText ? <Text style={styles.trailing}>{trailingText}</Text> : null}
        <Icon name="chevron-forward" size={16} color={semanticColors.text.tertiary} />
      </View>
    </Body>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...canvasText.bodyStrong,
    color: semanticColors.text.primary,
  },
  subtitle: {
    ...canvasText.bodyMuted,
    color: semanticColors.text.secondary,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  trailing: {
    ...canvasText.caption,
    color: semanticColors.text.secondary,
  },
});
