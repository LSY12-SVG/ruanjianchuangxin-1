import React, {useMemo, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {ParamSlider} from './ParamSlider';
import {
  AdvancedPalette,
  type AdvancedPaletteLayer,
} from './AdvancedPalette';
import {
  COLOR_PARAM_SPECS,
  type BasicLightParams,
} from '../../types/colorGrading.ts';

interface BasicLightModuleProps {
  params: BasicLightParams;
  onChange: (params: BasicLightParams) => void;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const toDisplay = (value: number): number => Math.round(value);

export const BasicLightModule: React.FC<BasicLightModuleProps> = ({
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
        highlights: x,
        shadows: y,
      });
      return;
    }

    onChange({
      ...params,
      whites: x,
      blacks: y,
    });
  };

  const layers: AdvancedPaletteLayer[] = useMemo(() => {
    const highlightWeight = weights[0] || 1;
    const rangeWeight = weights[1] || 1;
    return [
      {
        id: 'tone',
        label: '高光/阴影',
        xLabel: '高光',
        yLabel: '阴影',
        xNorm: clamp(params.highlights / (100 * highlightWeight), -1, 1),
        yNorm: clamp(params.shadows / (100 * highlightWeight), -1, 1),
        xDisplay: toDisplay(params.highlights),
        yDisplay: toDisplay(params.shadows),
      },
      {
        id: 'range',
        label: '白场/黑场',
        xLabel: '白场',
        yLabel: '黑场',
        xNorm: clamp(params.whites / (100 * rangeWeight), -1, 1),
        yNorm: clamp(params.blacks / (100 * rangeWeight), -1, 1),
        xDisplay: toDisplay(params.whites),
        yDisplay: toDisplay(params.blacks),
      },
    ];
  }, [
    params.blacks,
    params.highlights,
    params.shadows,
    params.whites,
    weights,
  ]);

  const updateFineTune = (key: keyof BasicLightParams, value: number) => {
    onChange({...params, [key]: value});
  };

  const handleRingChange = (value: number) => {
    const next = [...weights];
    const previousWeight = weights[activeLayerIndex] || 1;
    const xNorm =
      activeLayerIndex === 0
        ? clamp(params.highlights / (100 * previousWeight), -1, 1)
        : clamp(params.whites / (100 * previousWeight), -1, 1);
    const yNorm =
      activeLayerIndex === 0
        ? clamp(params.shadows / (100 * previousWeight), -1, 1)
        : clamp(params.blacks / (100 * previousWeight), -1, 1);
    next[activeLayerIndex] = value;
    setWeights(next);
    applyLayerValue(activeLayerIndex, xNorm, yNorm, value);
  };

  const resetLayer = () => {
    if (activeLayerIndex === 0) {
      onChange({...params, highlights: 0, shadows: 0});
      return;
    }
    onChange({...params, whites: 0, blacks: 0});
  };

  const resetAll = () => {
    setWeights([1, 1]);
    onChange({
      ...params,
      exposure: 0,
      brightness: 0,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
    });
  };

  return (
    <View>
      <AdvancedPalette
        title="光影控制调色盘"
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
        <Text style={styles.fineTuneTitle}>光影精调</Text>
        <ParamSlider
          label="曝光"
          value={params.exposure}
          min={COLOR_PARAM_SPECS.exposure.min}
          max={COLOR_PARAM_SPECS.exposure.max}
          step={COLOR_PARAM_SPECS.exposure.step}
          precision={2}
          onChange={value => updateFineTune('exposure', value)}
          onReset={() => updateFineTune('exposure', 0)}
        />
        <ParamSlider
          label="亮度"
          value={params.brightness}
          min={COLOR_PARAM_SPECS.brightness.min}
          max={COLOR_PARAM_SPECS.brightness.max}
          onChange={value => updateFineTune('brightness', value)}
          onReset={() => updateFineTune('brightness', 0)}
        />
        <ParamSlider
          label="对比度"
          value={params.contrast}
          min={COLOR_PARAM_SPECS.contrast.min}
          max={COLOR_PARAM_SPECS.contrast.max}
          onChange={value => updateFineTune('contrast', value)}
          onReset={() => updateFineTune('contrast', 0)}
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
    color: '#e4efff',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
});
