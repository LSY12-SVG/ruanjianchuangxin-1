import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {ParamSlider} from './ParamSlider';
import type {ColorWheels} from '../../types/colorGrading.ts';

interface ColorWheelsModuleProps {
  wheels: ColorWheels;
  onChange: (wheels: ColorWheels) => void;
}

const WHEEL_KEYS: Array<keyof ColorWheels> = ['shadows', 'midtones', 'highlights'];
const WHEEL_LABELS: Record<keyof ColorWheels, string> = {
  shadows: '阴影色轮',
  midtones: '中间调色轮',
  highlights: '高光色轮',
};

const resetWheel = () => ({hue: 0, sat: 0, luma: 0});

export const ColorWheelsModule: React.FC<ColorWheelsModuleProps> = ({
  wheels,
  onChange,
}) => {
  const updateWheel = (
    key: keyof ColorWheels,
    field: 'hue' | 'sat' | 'luma',
    value: number,
  ) => {
    const next = {
      ...wheels,
      [key]: {
        ...wheels[key],
        [field]: value,
      },
    };
    onChange(next);
  };

  const resetSingleWheel = (key: keyof ColorWheels) => {
    onChange({
      ...wheels,
      [key]: resetWheel(),
    });
  };

  const resetAll = () => {
    onChange({
      shadows: resetWheel(),
      midtones: resetWheel(),
      highlights: resetWheel(),
    });
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>三段色轮</Text>
        <TouchableOpacity style={styles.resetButton} onPress={resetAll}>
          <Text style={styles.resetText}>重置色轮</Text>
        </TouchableOpacity>
      </View>
      {WHEEL_KEYS.map(key => (
        <View key={key} style={styles.wheelBlock}>
          <View style={styles.wheelHeader}>
            <Text style={styles.wheelTitle}>{WHEEL_LABELS[key]}</Text>
            <TouchableOpacity
              style={styles.resetButton}
              onPress={() => resetSingleWheel(key)}>
              <Text style={styles.resetText}>重置</Text>
            </TouchableOpacity>
          </View>
          <ParamSlider
            label="色相"
            value={wheels[key].hue}
            min={-180}
            max={180}
            onChange={value => updateWheel(key, 'hue', value)}
            onReset={() => updateWheel(key, 'hue', 0)}
          />
          <ParamSlider
            label="饱和偏移"
            value={wheels[key].sat}
            min={0}
            max={100}
            onChange={value => updateWheel(key, 'sat', value)}
            onReset={() => updateWheel(key, 'sat', 0)}
          />
          <ParamSlider
            label="亮度偏移"
            value={wheels[key].luma}
            min={-100}
            max={100}
            onChange={value => updateWheel(key, 'luma', value)}
            onReset={() => updateWheel(key, 'luma', 0)}
          />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(146,197,237,0.24)',
    backgroundColor: 'rgba(9,36,59,0.7)',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    color: '#ebf6ff',
    fontSize: 15,
    fontWeight: '700',
  },
  wheelBlock: {
    marginTop: 8,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  wheelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  wheelTitle: {
    color: '#d9ecff',
    fontSize: 13,
    fontWeight: '700',
  },
  resetButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(147,197,237,0.28)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(17,60,93,0.7)',
  },
  resetText: {
    color: '#b7d9f8',
    fontSize: 11,
    fontWeight: '600',
  },
});

