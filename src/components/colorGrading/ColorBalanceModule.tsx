import React, {useMemo, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {ParamSlider} from './ParamSlider';
import {
  AdvancedPalette,
  type AdvancedPaletteLayer,
} from './AdvancedPalette';
import {
  COLOR_PARAM_SPECS,
  type ColorBalanceParams,
} from '../../types/colorGrading.ts';

interface ColorBalanceModuleProps {
  params: ColorBalanceParams;
  onChange: (params: ColorBalanceParams) => void;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const toDisplay = (value: number): number => Math.round(value);

export const ColorBalanceModule: React.FC<ColorBalanceModuleProps> = ({
  params,
  onChange,
}) => {
  const [activeLayerIndex, setActiveLayerIndex] = useState(0);
  const [weights, setWeights] = useState([1, 1]);

  const applyLayerValue = (
    layerIndex: number,
    xNorm: number,
    yNorm: number,
    weight: number,
  ) => {
    const x = clamp(Math.round(xNorm * 100 * weight), -100, 100);
    const y = clamp(Math.round(yNorm * 100 * weight), -100, 100);

    if (layerIndex === 0) {
      onChange({
        ...params,
        temperature: x,
        tint: y,
      });
      return;
    }

    onChange({
      ...params,
      vibrance: x,
      saturation: y,
    });
  };

  const layers: AdvancedPaletteLayer[] = useMemo(() => {
    const chromaWeight = weights[0] || 1;
    const vividWeight = weights[1] || 1;
    return [
      {
        id: 'temp_tint',
        label: '色温/色调',
        xLabel: '色温',
        yLabel: '色调',
        xNorm: clamp(params.temperature / (100 * chromaWeight), -1, 1),
        yNorm: clamp(params.tint / (100 * chromaWeight), -1, 1),
        xDisplay: toDisplay(params.temperature),
        yDisplay: toDisplay(params.tint),
      },
      {
        id: 'vivid_sat',
        label: '自然饱和/饱和',
        xLabel: '自然饱和',
        yLabel: '饱和度',
        xNorm: clamp(params.vibrance / (100 * vividWeight), -1, 1),
        yNorm: clamp(params.saturation / (100 * vividWeight), -1, 1),
        xDisplay: toDisplay(params.vibrance),
        yDisplay: toDisplay(params.saturation),
      },
    ];
  }, [
    params.saturation,
    params.temperature,
    params.tint,
    params.vibrance,
    weights,
  ]);

  const updateFineTune = (key: keyof ColorBalanceParams, value: number) => {
    onChange({...params, [key]: value});
  };

  const handleRingChange = (value: number) => {
    const next = [...weights];
    const previousWeight = weights[activeLayerIndex] || 1;
    const xNorm =
      activeLayerIndex === 0
        ? clamp(params.temperature / (100 * previousWeight), -1, 1)
        : clamp(params.vibrance / (100 * previousWeight), -1, 1);
    const yNorm =
      activeLayerIndex === 0
        ? clamp(params.tint / (100 * previousWeight), -1, 1)
        : clamp(params.saturation / (100 * previousWeight), -1, 1);
    next[activeLayerIndex] = value;
    setWeights(next);
    applyLayerValue(activeLayerIndex, xNorm, yNorm, value);
  };

  const resetLayer = () => {
    if (activeLayerIndex === 0) {
      onChange({...params, temperature: 0, tint: 0});
      return;
    }
    onChange({...params, vibrance: 0, saturation: 0});
  };

  const resetAll = () => {
    setWeights([1, 1]);
    onChange({
      ...params,
      temperature: 0,
      tint: 0,
      saturation: 0,
      vibrance: 0,
      redBalance: 0,
      greenBalance: 0,
      blueBalance: 0,
    });
  };

  return (
    <View>
      <AdvancedPalette
        title="色彩平衡调色盘"
        layers={layers}
        activeLayerIndex={activeLayerIndex}
        ringValue={weights[activeLayerIndex] || 1}
        onLayerChange={setActiveLayerIndex}
        onXYChange={(xNorm, yNorm) =>
          applyLayerValue(activeLayerIndex, xNorm, yNorm, weights[activeLayerIndex] || 1)
        }
        onRingValueChange={handleRingChange}
        onResetLayer={resetLayer}
        onResetAll={resetAll}
        accentColor="#79c9ff"
      />

      <View style={styles.fineTuneCard}>
        <Text style={styles.fineTuneTitle}>色彩精调</Text>
        <ParamSlider
          label="红色通道"
          value={params.redBalance}
          min={COLOR_PARAM_SPECS.redBalance.min}
          max={COLOR_PARAM_SPECS.redBalance.max}
          onChange={value => updateFineTune('redBalance', value)}
          onReset={() => updateFineTune('redBalance', 0)}
        />
        <ParamSlider
          label="绿色通道"
          value={params.greenBalance}
          min={COLOR_PARAM_SPECS.greenBalance.min}
          max={COLOR_PARAM_SPECS.greenBalance.max}
          onChange={value => updateFineTune('greenBalance', value)}
          onReset={() => updateFineTune('greenBalance', 0)}
        />
        <ParamSlider
          label="蓝色通道"
          value={params.blueBalance}
          min={COLOR_PARAM_SPECS.blueBalance.min}
          max={COLOR_PARAM_SPECS.blueBalance.max}
          onChange={value => updateFineTune('blueBalance', value)}
          onReset={() => updateFineTune('blueBalance', 0)}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fineTuneCard: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 12,
  },
  fineTuneTitle: {
    color: '#dbeeff',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
});
