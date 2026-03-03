import React, {useState, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {FilteredImageView} from './FilteredImageView';
import type {ColorGradingParams} from '../../types/colorGrading';

interface BeforeAfterViewerProps {
  imageUri: string;
  params: ColorGradingParams;
  showComparison: boolean;
  onToggleComparison: () => void;
}

const {width: SCREEN_WIDTH} = Dimensions.get('window');

export const BeforeAfterViewer: React.FC<BeforeAfterViewerProps> = ({
  imageUri,
  params,
  showComparison,
  onToggleComparison,
}) => {
  const [sliderPosition, setSliderPosition] = useState(SCREEN_WIDTH / 2);
  const [isDragging, setIsDragging] = useState(false);
  const containerWidth = SCREEN_WIDTH - 40; // 减去左右 margin
  const viewRef = useRef<View>(null);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gestureState) => {
      return Math.abs(gestureState.dx) > 5;
    },
    onPanResponderGrant: () => {
      setIsDragging(true);
    },
    onPanResponderMove: (_, gestureState) => {
      const newPosition = sliderPosition + gestureState.dx;
      const clampedPosition = Math.max(
        0,
        Math.min(containerWidth, newPosition)
      );
      setSliderPosition(clampedPosition);
    },
    onPanResponderRelease: () => {
      setIsDragging(false);
    },
  });

  // 如果只显示单图（调色后）
  if (!showComparison) {
    return (
      <View style={styles.singleContainer}>
        <FilteredImageView
          uri={imageUri}
          params={params}
          isBefore={false}
        />
      </View>
    );
  }

  // 对比模式：左右分屏
  return (
    <View style={styles.container}>
      {/* 原图（左侧） */}
      <View
        style={[
          styles.halfContainer,
          {width: sliderPosition, overflow: 'hidden'},
        ]}
      >
        <FilteredImageView
          uri={imageUri}
          params={params}
          isBefore={true}
        />
        <View style={styles.label}>
          <Text style={styles.labelText}>原图</Text>
        </View>
      </View>

      {/* 调色后（右侧） */}
      <View
        style={[
          styles.halfContainer,
          {
            left: sliderPosition,
            width: containerWidth - sliderPosition,
            overflow: 'hidden',
          },
        ]}
      >
        <FilteredImageView
          uri={imageUri}
          params={params}
          isBefore={false}
        />
        <View style={[styles.label, styles.rightLabel]}>
          <Text style={styles.labelText}>调色后</Text>
        </View>
      </View>

      {/* 滑动条 */}
      <View
        style={[
          styles.slider,
          {left: sliderPosition - 2},
          isDragging && styles.sliderActive,
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity style={styles.sliderButton} activeOpacity={0.8}>
          <Icon name="chevron-back-outline" size={20} color="#fff" />
          <Icon name="chevron-forward-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* 对比开关 */}
      <TouchableOpacity
        style={styles.toggleButton}
        onPress={onToggleComparison}
        activeOpacity={0.7}
      >
        <Icon name="layers-outline" size={20} color="#fff" />
        <Text style={styles.toggleButtonText}>
          {showComparison ? '关闭对比' : '开启对比'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginTop: 20,
    height: 400,
    position: 'relative',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  halfContainer: {
    height: '100%',
    position: 'absolute',
    top: 0,
  },
  singleContainer: {
    marginHorizontal: 20,
    marginTop: 20,
    height: 400,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  label: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  rightLabel: {
    left: 'auto',
    right: 12,
  },
  labelText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  slider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  sliderActive: {
    backgroundColor: '#6C63FF',
  },
  sliderButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6C63FF',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  toggleButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  toggleButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
