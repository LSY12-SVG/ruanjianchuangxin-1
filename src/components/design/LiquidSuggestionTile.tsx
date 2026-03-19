import React from 'react';
import {StyleSheet, Text, View, type StyleProp, type ViewStyle} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {VISION_THEME} from '../../theme/visionTheme';
import {AISuggestionCard} from './AISuggestionCard';
import {LiquidCard} from './LiquidCard';
import {PrimaryButton} from './PrimaryButton';
import {StatusStrip} from './StatusStrip';
import {isLiquidGlassSupported} from './liquidSupport';

interface LiquidSuggestionTileProps {
  title: string;
  subtitle?: string;
  badge?: string;
  onApply?: () => void;
  style?: StyleProp<ViewStyle>;
  enabled?: boolean;
}

export const LiquidSuggestionTile: React.FC<LiquidSuggestionTileProps> = ({
  title,
  subtitle,
  badge = 'AI 推荐',
  onApply,
  style,
  enabled,
}) => {
  const canUseLiquid = enabled ?? isLiquidGlassSupported();
  if (!canUseLiquid) {
    return <AISuggestionCard title={title} subtitle={subtitle || ''} badge={badge} onApply={onApply} />;
  }

  return (
    <LiquidCard
      title={title}
      subtitle={subtitle}
      subtitleMode={subtitle ? 'show' : 'hidden'}
      preset="frosted"
      style={[styles.container, style]}
      statusNode={
        <StatusStrip
          compact
          items={[{label: badge, icon: 'sparkles-outline', tone: 'active', pulse: true}]}
        />
      }>
      <View style={styles.footer}>
        <Icon name="flash-outline" size={14} color={VISION_THEME.accent.strong} />
        <Text style={styles.footerText}>建议可一键应用</Text>
      </View>
      <PrimaryButton label="一键应用" icon="checkmark-outline" onPress={onApply} focusPulse />
    </LiquidCard>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 286,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  footerText: {
    color: VISION_THEME.text.secondary,
    fontSize: 11,
    fontWeight: '600',
  },
});
