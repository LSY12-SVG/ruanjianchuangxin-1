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
import type {BasicLightParams} from '../../types/colorGrading';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface BasicLightModuleProps {
  params: BasicLightParams;
  onChange: (params: BasicLightParams) => void;
}

export const BasicLightModule: React.FC<BasicLightModuleProps> = ({
  params,
  onChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(!isExpanded);
  };

  const updateParam = (key: keyof BasicLightParams, value: number) => {
    onChange({...params, [key]: value});
  };

  const resetAll = () => {
    onChange({
      exposure: 0,
      contrast: 0,
      brightness: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
    });
  };

  const hasChanges = Object.values(params).some(v => v !== 0);

  return (
    <View style={styles.moduleContainer}>
      <TouchableOpacity style={styles.moduleHeader} onPress={toggleExpand} activeOpacity={0.7}>
        <View style={styles.moduleHeaderLeft}>
          <Icon name="sunny-outline" size={20} color="#FFD700" />
          <Text style={styles.moduleTitle}>光影调整</Text>
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
          <ParamSlider
            label="曝光度"
            value={params.exposure}
            min={-2}
            max={2}
            step={0.1}
            onChange={(value) => updateParam('exposure', value)}
            onReset={() => updateParam('exposure', 0)}
          />
          <ParamSlider
            label="对比度"
            value={params.contrast}
            min={-100}
            max={100}
            onChange={(value) => updateParam('contrast', value)}
            onReset={() => updateParam('contrast', 0)}
          />
          <ParamSlider
            label="亮度"
            value={params.brightness}
            min={-100}
            max={100}
            onChange={(value) => updateParam('brightness', value)}
            onReset={() => updateParam('brightness', 0)}
          />
          <ParamSlider
            label="高光"
            value={params.highlights}
            min={-100}
            max={100}
            onChange={(value) => updateParam('highlights', value)}
            onReset={() => updateParam('highlights', 0)}
          />
          <ParamSlider
            label="阴影"
            value={params.shadows}
            min={-100}
            max={100}
            onChange={(value) => updateParam('shadows', value)}
            onReset={() => updateParam('shadows', 0)}
          />
          <ParamSlider
            label="白色色阶"
            value={params.whites}
            min={-100}
            max={100}
            onChange={(value) => updateParam('whites', value)}
            onReset={() => updateParam('whites', 0)}
          />
          <ParamSlider
            label="黑色色阶"
            value={params.blacks}
            min={-100}
            max={100}
            onChange={(value) => updateParam('blacks', value)}
            onReset={() => updateParam('blacks', 0)}
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
});
