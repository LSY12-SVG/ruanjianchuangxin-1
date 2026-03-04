import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import Slider from '@react-native-community/slider';
import Icon from 'react-native-vector-icons/Ionicons';

interface ParamSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  onReset: () => void;
}

export const ParamSlider: React.FC<ParamSliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  onReset,
}) => {
  const isDefault = value === 0;

  return (
    <View style={styles.sliderContainer}>
      <View style={styles.sliderHeader}>
        <Text style={styles.sliderLabel}>{label}</Text>
        <View style={styles.sliderValueContainer}>
          <Text style={[styles.sliderValue, !isDefault && styles.sliderValueActive]}>
            {value > 0 ? '+' : ''}{value}{unit}
          </Text>
          {!isDefault && (
            <TouchableOpacity onPress={onReset} style={styles.resetButton}>
              <Icon name="refresh" size={14} color="#666" />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor="#6C63FF"
        maximumTrackTintColor="#444"
        thumbTintColor="#6C63FF"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  sliderContainer: {
    paddingVertical: 8,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sliderLabel: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },
  sliderValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sliderValue: {
    fontSize: 12,
    color: '#999',
    minWidth: 45,
    textAlign: 'right',
  },
  sliderValueActive: {
    color: '#6C63FF',
    fontWeight: '600',
  },
  resetButton: {
    marginLeft: 8,
    padding: 2,
  },
  slider: {
    height: 40,
  },
});
