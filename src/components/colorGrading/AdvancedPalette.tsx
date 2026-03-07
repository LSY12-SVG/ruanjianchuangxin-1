import React, {useMemo, useRef} from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export interface AdvancedPaletteLayer {
  id: string;
  label: string;
  xLabel: string;
  yLabel: string;
  xNorm: number;
  yNorm: number;
  xDisplay: number;
  yDisplay: number;
}

interface AdvancedPaletteProps {
  title: string;
  layers: AdvancedPaletteLayer[];
  activeLayerIndex: number;
  ringValue: number;
  ringMin?: number;
  ringMax?: number;
  onLayerChange: (index: number) => void;
  onXYChange: (xNorm: number, yNorm: number) => void;
  onRingValueChange: (value: number) => void;
  onResetLayer: () => void;
  onResetAll: () => void;
  accentColor: string;
}

type GestureMode = 'idle' | 'center' | 'ring' | 'swipe';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const TRACK_SIZE = 252;
const CENTER_SIZE = 186;
const CENTER_RADIUS = CENTER_SIZE / 2;
const RING_INNER_RADIUS = 104;
const RING_OUTER_RADIUS = 126;
const SWIPE_THRESHOLD = 36;
const SWIPE_TIME_MS = 260;
const LONG_PRESS_MS = 170;
const CENTER_DRAG_THRESHOLD = 12;

const angleToValue = (
  angle: number,
  min: number,
  max: number,
): number => {
  const clamped = clamp(angle, -135, 135);
  const ratio = (clamped + 135) / 270;
  return min + ratio * (max - min);
};

const valueToAngle = (value: number, min: number, max: number): number => {
  const ratio = clamp((value - min) / (max - min), 0, 1);
  return -135 + ratio * 270;
};

const toNorm = (
  locationX: number,
  locationY: number,
): {xNorm: number; yNorm: number; distance: number} => {
  const cx = TRACK_SIZE / 2;
  const cy = TRACK_SIZE / 2;
  const dx = locationX - cx;
  const dy = locationY - cy;
  const xNorm = clamp(dx / CENTER_RADIUS, -1, 1);
  const yNorm = clamp(-dy / CENTER_RADIUS, -1, 1);
  return {
    xNorm,
    yNorm,
    distance: Math.sqrt(dx * dx + dy * dy),
  };
};

export const AdvancedPalette: React.FC<AdvancedPaletteProps> = ({
  title,
  layers,
  activeLayerIndex,
  ringValue,
  ringMin = 0.25,
  ringMax = 1.75,
  onLayerChange,
  onXYChange,
  onRingValueChange,
  onResetLayer,
  onResetAll,
  accentColor,
}) => {
  const layer = layers[activeLayerIndex];
  const gestureModeRef = useRef<GestureMode>('idle');
  const startedAtRef = useRef(0);

  const knobPos = useMemo(() => {
    return {
      left: TRACK_SIZE / 2 + layer.xNorm * CENTER_RADIUS,
      top: TRACK_SIZE / 2 - layer.yNorm * CENTER_RADIUS,
    };
  }, [layer.xNorm, layer.yNorm]);

  const ringAngle = useMemo(
    () => valueToAngle(ringValue, ringMin, ringMax),
    [ringValue, ringMin, ringMax],
  );

  const ringKnobPos = useMemo(() => {
    const rad = (ringAngle * Math.PI) / 180;
    const radius = (RING_INNER_RADIUS + RING_OUTER_RADIUS) / 2;
    const cx = TRACK_SIZE / 2;
    const cy = TRACK_SIZE / 2;
    return {
      left: cx + Math.cos(rad) * radius,
      top: cy + Math.sin(rad) * radius,
    };
  }, [ringAngle]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          gestureModeRef.current = 'idle';
          startedAtRef.current = Date.now();
        },
        onPanResponderMove: (event, gesture) => {
          const elapsed = Date.now() - startedAtRef.current;
          const absDx = Math.abs(gesture.dx);
          const absDy = Math.abs(gesture.dy);

          if (gestureModeRef.current === 'idle') {
            const horizontalSwipe =
              absDx > SWIPE_THRESHOLD &&
              absDx > absDy * 1.3 &&
              elapsed < SWIPE_TIME_MS;
            if (horizontalSwipe) {
              const nextIndex =
                gesture.dx > 0
                  ? (activeLayerIndex - 1 + layers.length) % layers.length
                  : (activeLayerIndex + 1) % layers.length;
              onLayerChange(nextIndex);
              gestureModeRef.current = 'swipe';
              return;
            }

            const {distance} = toNorm(
              event.nativeEvent.locationX,
              event.nativeEvent.locationY,
            );
            const movedEnough = absDx + absDy > CENTER_DRAG_THRESHOLD;
            const longPressReady = elapsed > LONG_PRESS_MS;

            if (!movedEnough && !longPressReady) {
              return;
            }

            if (
              distance >= RING_INNER_RADIUS &&
              distance <= RING_OUTER_RADIUS
            ) {
              gestureModeRef.current = 'ring';
            } else {
              gestureModeRef.current = 'center';
            }
          }

          if (gestureModeRef.current === 'center') {
            const norm = toNorm(
              event.nativeEvent.locationX,
              event.nativeEvent.locationY,
            );
            onXYChange(norm.xNorm, norm.yNorm);
          }

          if (gestureModeRef.current === 'ring') {
            const cx = TRACK_SIZE / 2;
            const cy = TRACK_SIZE / 2;
            const dx = event.nativeEvent.locationX - cx;
            const dy = event.nativeEvent.locationY - cy;
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
            onRingValueChange(angleToValue(angle, ringMin, ringMax));
          }
        },
        onPanResponderRelease: () => {
          gestureModeRef.current = 'idle';
        },
        onPanResponderTerminate: () => {
          gestureModeRef.current = 'idle';
        },
      }),
    [
      activeLayerIndex,
      layers.length,
      onLayerChange,
      onRingValueChange,
      onXYChange,
      ringMax,
      ringMin,
    ],
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={onResetLayer} style={styles.ghostButton}>
            <Text style={styles.ghostText}>重置当前层</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onResetAll} style={styles.ghostButton}>
            <Text style={styles.ghostText}>重置全部</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.layerRow}>
        {layers.map((item, index) => {
          const active = index === activeLayerIndex;
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.layerChip,
                active && {borderColor: accentColor, backgroundColor: `${accentColor}20`},
              ]}
              onPress={() => onLayerChange(index)}>
              <Text
                style={[
                  styles.layerChipText,
                  active && {color: accentColor},
                ]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.trackWrap} {...panResponder.panHandlers}>
        <View style={styles.trackOuter} />
        <View style={styles.trackCenter} />
        <View style={styles.crossHorizontal} />
        <View style={styles.crossVertical} />

        <View
          style={[
            styles.centerKnob,
            {
              left: knobPos.left - 11,
              top: knobPos.top - 11,
              borderColor: accentColor,
            },
          ]}
        />
        <View
          style={[
            styles.ringKnob,
            {
              left: ringKnobPos.left - 9,
              top: ringKnobPos.top - 9,
              backgroundColor: accentColor,
            },
          ]}
        />
      </View>

      <View style={styles.metricsRow}>
        <Text style={styles.metricText}>
          {layer.xLabel}: {layer.xDisplay > 0 ? '+' : ''}
          {layer.xDisplay}
        </Text>
        <Text style={styles.metricText}>
          {layer.yLabel}: {layer.yDisplay > 0 ? '+' : ''}
          {layer.yDisplay}
        </Text>
        <Text style={styles.metricText}>
          强度: {ringValue.toFixed(2)}x
        </Text>
      </View>
      <Text style={styles.hint}>左右滑动切层，长按后拖拽调值；外圈可调当前层强度</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    backgroundColor: 'rgba(10, 40, 65, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(145, 196, 236, 0.25)',
    padding: 12,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#eef5ff',
    fontSize: 15,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  ghostButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(146, 197, 237, 0.28)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: 'rgba(15, 57, 89, 0.68)',
  },
  ghostText: {
    color: '#d3e6ff',
    fontSize: 11,
    fontWeight: '600',
  },
  layerRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  layerChip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(146, 197, 237, 0.2)',
    backgroundColor: 'rgba(9, 36, 58, 0.74)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  layerChipText: {
    color: '#bfd6f6',
    fontSize: 12,
    fontWeight: '600',
  },
  trackWrap: {
    marginTop: 10,
    width: TRACK_SIZE,
    height: TRACK_SIZE,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackOuter: {
    position: 'absolute',
    width: TRACK_SIZE,
    height: TRACK_SIZE,
    borderRadius: TRACK_SIZE / 2,
    borderWidth: 16,
    borderColor: 'rgba(144, 194, 231, 0.24)',
  },
  trackCenter: {
    position: 'absolute',
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    borderRadius: CENTER_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(142, 196, 235, 0.29)',
    backgroundColor: 'rgba(8, 31, 51, 0.75)',
  },
  crossHorizontal: {
    position: 'absolute',
    width: CENTER_SIZE,
    height: 1,
    backgroundColor: 'rgba(152, 202, 240, 0.21)',
  },
  crossVertical: {
    position: 'absolute',
    width: 1,
    height: CENTER_SIZE,
    backgroundColor: 'rgba(152, 202, 240, 0.21)',
  },
  centerKnob: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    backgroundColor: '#0a2741',
  },
  ringKnob: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  metricsRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricText: {
    color: '#d8e9ff',
    fontSize: 12,
    fontWeight: '600',
  },
  hint: {
    marginTop: 6,
    color: '#9fb8d8',
    fontSize: 11,
  },
});
