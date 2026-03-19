import React from 'react';
import {StyleSheet, TextInput, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import {VISION_THEME} from '../../theme/visionTheme';

interface PromptInputBarProps {
  value: string;
  placeholder?: string;
  onChangeText: (value: string) => void;
  onSubmit?: () => void;
}

export const PromptInputBar: React.FC<PromptInputBarProps> = ({
  value,
  placeholder = '告诉我你要完成什么',
  onChangeText,
  onSubmit,
}) => {
  return (
    <View style={styles.wrap}>
      <View style={styles.leftIcon}>
        <Icon name="sparkles-outline" size={16} color={VISION_THEME.accent.strong} />
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={VISION_THEME.text.muted}
        style={styles.input}
      />
      <TouchableOpacity onPress={onSubmit} activeOpacity={0.85}>
        <LinearGradient
          colors={VISION_THEME.gradients.cta}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 1}}
          style={styles.send}>
          <Icon name="send" size={15} color="#EFF6FF" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    minHeight: 52,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
  },
  leftIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(111,231,255,0.12)',
  },
  input: {
    flex: 1,
    color: VISION_THEME.text.primary,
    fontSize: 14,
    paddingVertical: 0,
  },
  send: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
