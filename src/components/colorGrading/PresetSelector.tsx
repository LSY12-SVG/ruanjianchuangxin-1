import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type {ColorPreset} from '../../types/colorGrading.ts';

interface PresetSelectorProps {
  presets: ColorPreset[];
  selectedPresetId: string;
  onSelectPreset: (preset: ColorPreset) => void;
}

export const PresetSelector: React.FC<PresetSelectorProps> = ({
  presets,
  selectedPresetId,
  onSelectPreset,
}) => {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {presets.map((preset) => {
          const isSelected = preset.id === selectedPresetId;
          return (
            <TouchableOpacity
              key={preset.id}
              style={[
                styles.presetCard,
                isSelected && styles.presetCardSelected,
              ]}
              onPress={() => onSelectPreset(preset)}
              activeOpacity={0.7}
            >
              <View style={[
                styles.presetThumbnail,
                {backgroundColor: getPresetColor(preset.category)}
              ]}>
                {preset.isAI && (
                  <View style={styles.aiBadge}>
                    <Icon name="sparkles" size={12} color="#fff" />
                  </View>
                )}
                <Text style={styles.presetName}>{preset.name}</Text>
              </View>
              {isSelected && <View style={styles.selectedIndicator} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

function getPresetColor(category: string): string {
  const colors: Record<string, string> = {
    cinematic: '#2f628a',
    portrait: '#3c7399',
    landscape: '#2f7f8a',
    artistic: '#355c88',
    vintage: '#4a6a86',
    custom: '#476580',
  };
  return colors[category] || '#476580';
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  scrollContent: {
    paddingHorizontal: 4,
  },
  presetCard: {
    marginRight: 12,
    alignItems: 'center',
  },
  presetCardSelected: {
    transform: [{scale: 1.05}],
  },
  presetThumbnail: {
    width: 70,
    height: 70,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(155, 207, 245, 0.28)',
  },
  presetName: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  aiBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(121, 201, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedIndicator: {
    position: 'absolute',
    bottom: -8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#79c9ff',
  },
});
