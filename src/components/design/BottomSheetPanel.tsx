import React, {useEffect, useRef} from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useAppStore} from '../../store/appStore';
import {MOTION_PRESETS} from '../../theme/motion';
import {VISION_THEME} from '../../theme/visionTheme';

interface BottomSheetPanelProps {
  visible: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export const BottomSheetPanel: React.FC<BottomSheetPanelProps> = ({
  visible,
  title = '设置',
  onClose,
  children,
}) => {
  const insets = useSafeAreaInsets();
  const motionEnabled = useAppStore(state => state.motionEnabled);
  const translateY = useRef(new Animated.Value(460)).current;
  const overlay = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      if (!motionEnabled) {
        overlay.setValue(1);
        translateY.setValue(0);
        return;
      }
      Animated.parallel([
        Animated.timing(overlay, {
          toValue: 1,
          duration: MOTION_PRESETS.buttonPress.duration,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: MOTION_PRESETS.sheetTransition.duration,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }
    overlay.setValue(0);
    translateY.setValue(460);
  }, [motionEnabled, overlay, translateY, visible]);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, {opacity: overlay}]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          {
            paddingBottom: Math.max(12, insets.bottom),
            transform: [{translateY}],
          },
        ]}>
        <View style={styles.header}>
          <View style={styles.dragger} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.close}>
              <Icon name="close-outline" size={18} color={VISION_THEME.text.secondary} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.content}>{children}</View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4,8,14,0.62)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
    backgroundColor: 'rgba(15,24,40,0.98)',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
  },
  header: {
    paddingTop: 10,
    paddingHorizontal: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(111,231,255,0.24)',
  },
  dragger: {
    width: 42,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: VISION_THEME.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  content: {
    flex: 1,
  },
});
