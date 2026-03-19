import React, {useMemo, useState} from 'react';
import {Image, LayoutChangeEvent, PanResponder, StyleSheet, View} from 'react-native';
import {VISION_THEME} from '../../theme/visionTheme';

interface ImageCompareViewProps {
  beforeUri?: string;
  afterUri?: string;
  height?: number;
}

export const ImageCompareView: React.FC<ImageCompareViewProps> = ({
  beforeUri,
  afterUri,
  height = 176,
}) => {
  const [width, setWidth] = useState(0);
  const [ratio, setRatio] = useState(0.52);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_evt, gesture) => {
          if (width <= 0) {
            return;
          }
          const next = Math.min(0.92, Math.max(0.08, ratio + gesture.dx / width));
          setRatio(next);
        },
      }),
    [ratio, width],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={[styles.container, {height}]} onLayout={onLayout}>
      <Image
        source={{
          uri:
            beforeUri ||
            'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1200&q=80',
        }}
        resizeMode="cover"
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[styles.afterMask, {width: `${ratio * 100}%`}]} pointerEvents="none">
        <Image
          source={{
            uri:
              afterUri ||
              'https://images.unsplash.com/photo-1493244040629-496f6d136cc3?w=1200&q=80',
          }}
          resizeMode="cover"
          style={StyleSheet.absoluteFillObject}
        />
      </View>
      <View style={[styles.slider, {left: `${ratio * 100}%`}]} {...panResponder.panHandlers}>
        <View style={styles.knob} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: VISION_THEME.surface.base,
  },
  afterMask: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.45)',
  },
  slider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.8)',
    marginLeft: -1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  knob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: VISION_THEME.accent.main,
    borderWidth: 2,
    borderColor: '#EAF4FF',
  },
});
