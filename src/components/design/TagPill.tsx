import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {VISION_THEME} from '../../theme/visionTheme';
import {PulseDot} from './PulseDot';

interface TagPillProps {
  label?: string;
  active?: boolean;
  icon?: string;
  showLabel?: boolean;
  animated?: boolean;
  onPress?: () => void;
}

export const TagPill: React.FC<TagPillProps> = ({
  label,
  active = false,
  icon,
  showLabel = true,
  animated = false,
  onPress,
}) => {
  return (
    <Pressable style={[styles.pill, active && styles.active]} onPress={onPress}>
      <View style={styles.content}>
        {icon ? (
          <Icon
            name={icon}
            size={12}
            color={active ? '#EAF4FF' : VISION_THEME.accent.strong}
          />
        ) : null}
        <PulseDot tone={active ? 'active' : 'idle'} size={5} animated={animated && active} />
        {showLabel && label ? <Text style={[styles.text, active && styles.activeText]}>{label}</Text> : null}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  pill: {
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: {
    borderColor: 'rgba(77,163,255,0.8)',
    backgroundColor: 'rgba(77,163,255,0.2)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  text: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  activeText: {
    color: '#EAF4FF',
  },
});
