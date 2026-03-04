import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {ParamSlider} from './ParamSlider';
import type {ColorBalanceParams} from '../../types/colorGrading';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ColorBalanceModuleProps {
  params: ColorBalanceParams;
  onChange: (params: ColorBalanceParams) => void;
}

export const ColorBalanceModule: React.FC<ColorBalanceModuleProps> = ({
  params,
  onChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(!isExpanded);
  };

  const updateParam = (key: keyof ColorBalanceParams, value: number) => {
    onChange({...params, [key]: value});
  };

  const resetAll = () => {
    onChange({
      temperature: 0,
      tint: 0,
      redBalance: 0,
      greenBalance: 0,
      blueBalance: 0,
      vibrance: 0,
      saturation: 0,
    });
  };

  const hasChanges = Object.values(params).some(v => v !== 0);

  return (
    <View style={styles.moduleContainer}>
      <TouchableOpacity style={styles.moduleHeader} onPress={toggleExpand} activeOpacity={0.7}>
        <View style={styles.moduleHeaderLeft}>
          <Icon name="color-palette-outline" size={20} color="#FF6B9D" />
          <Text style={styles.moduleTitle}>色彩平衡</Text>
          {hasChanges && <View style={styles.indicator} />}
        </View>
        <View style={styles.moduleHeaderRight}>
          {hasChanges && (
            <TouchableOpacity onPress={resetAll} style={styles.resetAllButton}>
              <Text style={styles.resetAllText}>重置</Text>
            </TouchableOpacity>
          )}
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={24}
            color="#fff"
          />
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.moduleContent}>
          <View style={styles.subSection}>
            <Text style={styles.subSectionTitle}>白平衡</Text>
          </View>
          <ParamSlider
            label="色温"
            value={params.temperature}
            min={-100}
            max={100}
            onChange={(value) => updateParam('temperature', value)}
            onReset={() => updateParam('temperature', 0)}
          />
          <ParamSlider
            label="色调"
            value={params.tint}
            min={-100}
            max={100}
            onChange={(value) => updateParam('tint', value)}
            onReset={() => updateParam('tint', 0)}
          />

          <View style={styles.subSection}>
            <Text style={styles.subSectionTitle}>通道平衡</Text>
          </View>
          <ParamSlider
            label="红色"
            value={params.redBalance}
            min={-100}
            max={100}
            onChange={(value) => updateParam('redBalance', value)}
            onReset={() => updateParam('redBalance', 0)}
          />
          <ParamSlider
            label="绿色"
            value={params.greenBalance}
            min={-100}
            max={100}
            onChange={(value) => updateParam('greenBalance', value)}
            onReset={() => updateParam('greenBalance', 0)}
          />
          <ParamSlider
            label="蓝色"
            value={params.blueBalance}
            min={-100}
            max={100}
            onChange={(value) => updateParam('blueBalance', value)}
            onReset={() => updateParam('blueBalance', 0)}
          />

          <View style={styles.subSection}>
            <Text style={styles.subSectionTitle}>饱和度</Text>
          </View>
          <ParamSlider
            label="色彩增强"
            value={params.vibrance}
            min={-100}
            max={100}
            onChange={(value) => updateParam('vibrance', value)}
            onReset={() => updateParam('vibrance', 0)}
          />
          <ParamSlider
            label="饱和度"
            value={params.saturation}
            min={-100}
            max={100}
            onChange={(value) => updateParam('saturation', value)}
            onReset={() => updateParam('saturation', 0)}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  moduleContainer: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  moduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  moduleHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  moduleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 10,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6C63FF',
    marginLeft: 8,
  },
  moduleHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resetAllButton: {
    marginRight: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
  },
  resetAllText: {
    fontSize: 12,
    color: '#fff',
  },
  moduleContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  subSection: {
    marginTop: 12,
    marginBottom: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  subSectionTitle: {
    fontSize: 13,
    color: '#999',
    fontWeight: '500',
  },
});
