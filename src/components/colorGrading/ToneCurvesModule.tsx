import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {ParamSlider} from './ParamSlider';
import type {ToneCurvePoints, ToneCurves} from '../../types/colorGrading.ts';

interface ToneCurvesModuleProps {
  curves: ToneCurves;
  onChange: (curves: ToneCurves) => void;
}

const CURVE_KEYS: Array<keyof ToneCurves> = ['master', 'r', 'g', 'b'];
const CURVE_LABELS: Record<keyof ToneCurves, string> = {
  master: '主曲线',
  r: '红曲线',
  g: '绿曲线',
  b: '蓝曲线',
};
const ANCHOR_LABELS = ['暗部', '暗中', '中灰', '亮中', '高光'];

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const resetCurve = (): ToneCurvePoints => [0, 0.25, 0.5, 0.75, 1];

const toSliderValue = (point: number): number => Math.round((point - 0.5) * 200);
const fromSliderValue = (value: number): number => clamp01(value / 200 + 0.5);

export const ToneCurvesModule: React.FC<ToneCurvesModuleProps> = ({
  curves,
  onChange,
}) => {
  const updatePoint = (key: keyof ToneCurves, index: number, value: number) => {
    const nextCurve = [...curves[key]] as ToneCurvePoints;
    nextCurve[index] = fromSliderValue(value);
    onChange({
      ...curves,
      [key]: nextCurve,
    });
  };

  const resetSingleCurve = (key: keyof ToneCurves) => {
    onChange({
      ...curves,
      [key]: resetCurve(),
    });
  };

  const resetAll = () => {
    onChange({
      master: resetCurve(),
      r: resetCurve(),
      g: resetCurve(),
      b: resetCurve(),
    });
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>曲线</Text>
        <TouchableOpacity style={styles.resetButton} onPress={resetAll}>
          <Text style={styles.resetText}>重置曲线</Text>
        </TouchableOpacity>
      </View>
      {CURVE_KEYS.map(key => (
        <View key={key} style={styles.curveBlock}>
          <View style={styles.curveHeader}>
            <Text style={styles.curveTitle}>{CURVE_LABELS[key]}</Text>
            <TouchableOpacity
              style={styles.resetButton}
              onPress={() => resetSingleCurve(key)}>
              <Text style={styles.resetText}>重置</Text>
            </TouchableOpacity>
          </View>
          {curves[key].map((point, index) => (
            <ParamSlider
              key={`${key}_${index}`}
              label={ANCHOR_LABELS[index]}
              value={toSliderValue(point)}
              min={-100}
              max={100}
              onChange={value => updatePoint(key, index, value)}
              onReset={() => updatePoint(key, index, toSliderValue(resetCurve()[index]))}
            />
          ))}
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
  curveBlock: {
    marginTop: 8,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  curveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  curveTitle: {
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

