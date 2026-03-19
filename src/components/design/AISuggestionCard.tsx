import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {VISION_THEME} from '../../theme/visionTheme';
import {GlassCard} from './GlassCard';
import {PrimaryButton} from './PrimaryButton';
import {StatusStrip} from './StatusStrip';

interface AISuggestionCardProps {
  title: string;
  subtitle?: string;
  badge?: string;
  minimal?: boolean;
  onApply?: () => void;
}

export const AISuggestionCard: React.FC<AISuggestionCardProps> = ({
  title,
  subtitle,
  badge = 'AI 推荐',
  minimal = true,
  onApply,
}) => {
  return (
    <GlassCard style={styles.container} subtitleMode="hidden">
      <View style={styles.head}>
        <View style={styles.badge}>
          <Icon name="sparkles-outline" size={12} color={VISION_THEME.accent.strong} />
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      </View>
      <Text style={styles.title}>{title}</Text>
      {!minimal && subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <StatusStrip items={[{label: '可直接应用', icon: 'flash-outline', tone: 'active'}]} compact />
      <PrimaryButton label="一键应用" icon="flash-outline" onPress={onApply} focusPulse />
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 286,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(111,231,255,0.4)',
    backgroundColor: 'rgba(111,231,255,0.12)',
  },
  badgeText: {
    color: VISION_THEME.text.secondary,
    fontSize: 11,
    fontWeight: '600',
  },
  title: {
    color: VISION_THEME.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: VISION_THEME.text.muted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
});
