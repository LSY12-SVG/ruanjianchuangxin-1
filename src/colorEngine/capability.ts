import {Platform} from 'react-native';
import type {
  ColorEngineMode,
  ResolvedColorEngineMode,
} from '../types/colorEngine';

export interface EngineCapabilities {
  platform: string;
  runtimeShaderAvailable: boolean;
  memoryTier: 'low' | 'mid' | 'high';
  thermalBudget: 'restricted' | 'normal';
  gpuTier: 'low' | 'mid' | 'high';
  supportsPro: boolean;
}

const resolveMemoryTier = (): EngineCapabilities['memoryTier'] => {
  if (Platform.OS !== 'android') {
    return 'low';
  }

  const heapLimit = Number(
    (globalThis as unknown as {performance?: {memory?: {jsHeapSizeLimit?: number}}})
      ?.performance?.memory?.jsHeapSizeLimit || 0,
  );

  if (heapLimit >= 900 * 1024 * 1024) {
    return 'high';
  }
  if (heapLimit >= 450 * 1024 * 1024) {
    return 'mid';
  }
  return 'low';
};

const resolveGpuTier = (): EngineCapabilities['gpuTier'] => {
  if (Platform.OS !== 'android') {
    return 'low';
  }

  const model = String((Platform.constants as Record<string, unknown>)?.Model || '').toLowerCase();
  if (!model) {
    return 'mid';
  }

  const highSignals = ['sm-x', 'tab s', 'snapdragon 8', 'adreno 7', 'dimensity 9'];
  if (highSignals.some(signal => model.includes(signal))) {
    return 'high';
  }

  const lowSignals = ['go edition', 'mt67', 'helio p', 'adreno 5'];
  if (lowSignals.some(signal => model.includes(signal))) {
    return 'low';
  }

  return 'mid';
};

export const getColorEngineCapabilities = (): EngineCapabilities => {
  const isAndroid = Platform.OS === 'android';
  const runtimeShaderAvailable = isAndroid;
  const memoryTier = resolveMemoryTier();
  const gpuTier = resolveGpuTier();

  const thermalBudget: EngineCapabilities['thermalBudget'] =
    memoryTier === 'low' && gpuTier === 'low' ? 'restricted' : 'normal';

  const supportsPro =
    isAndroid && runtimeShaderAvailable && thermalBudget !== 'restricted' && gpuTier !== 'low';

  return {
    platform: Platform.OS,
    runtimeShaderAvailable,
    memoryTier,
    thermalBudget,
    gpuTier,
    supportsPro,
  };
};

export const resolveColorEngineMode = (
  preferred: ColorEngineMode,
  capabilities: EngineCapabilities,
): ResolvedColorEngineMode => {
  if (preferred === 'legacy') {
    return 'legacy';
  }
  if (preferred === 'pro') {
    return capabilities.supportsPro ? 'pro' : 'legacy';
  }
  return capabilities.supportsPro ? 'pro' : 'legacy';
};
