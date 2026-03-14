import {makeFallbackBrushMask} from '../presetMigration';
import type {LocalMaskLayer, SegmentationResult} from '../../types/colorEngine';
import {toLocalMaskLayers} from '../segmentationService';

export const composeMaskLayers = (
  segmentation: SegmentationResult | null,
  existingBrushMasks: LocalMaskLayer[] = [],
): LocalMaskLayer[] => {
  const autoLayers = segmentation ? toLocalMaskLayers(segmentation) : [];
  const brushLayers = existingBrushMasks.filter(layer => layer.type === 'brush');

  if (autoLayers.length === 0 && brushLayers.length === 0) {
    return [makeFallbackBrushMask()];
  }

  return [...autoLayers, ...brushLayers];
};

export const summarizeMaskLayers = (layers: LocalMaskLayer[]): string => {
  if (layers.length === 0) {
    return '未启用局部调色';
  }

  const enabled = layers.filter(layer => layer.enabled);
  if (enabled.length === 0) {
    return '局部蒙版已创建，当前全部关闭';
  }

  return enabled.map(layer => layer.type).join(' / ');
};
