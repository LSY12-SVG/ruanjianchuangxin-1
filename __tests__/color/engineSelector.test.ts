import {NativeModules} from 'react-native';

jest.mock('../../src/colorEngine/capability', () => ({
  getColorEngineCapabilities: jest.fn(() => ({
    platform: 'android',
    runtimeShaderAvailable: true,
    memoryTier: 'high',
    thermalBudget: 'normal',
    gpuTier: 'high',
    supportsPro: true,
  })),
  resolveColorEngineMode: jest.requireActual('../../src/colorEngine/capability')
    .resolveColorEngineMode,
}));

import {selectColorEngine} from '../../src/colorEngine/engineSelector';

describe('selectColorEngine', () => {
  it('keeps pro mode when native bridge and device capabilities are available', async () => {
    NativeModules.ProColorEngine.getCapabilities.mockResolvedValueOnce({
      supportsNativePro: true,
      recommendedPreviewScale: 1,
      recommendedExportFormat: 'png16',
      maxPreviewDimension: 4096,
      workingSpace: 'linear_prophoto',
    });

    const result = await selectColorEngine({
      preferredMode: 'pro',
      preferredWorkingSpace: 'linear_prophoto',
      image: {
        success: true,
        width: 4000,
        height: 3000,
        isRaw: true,
      },
    });

    expect(result.resolvedMode).toBe('pro');
    expect(result.workingSpace).toBe('linear_prophoto');
    expect(result.diagnostics.recommendedExportFormat).toBe('png16');
  });

  it('falls back to legacy mode when native bridge blocks pro mode', async () => {
    NativeModules.ProColorEngine.getCapabilities.mockResolvedValueOnce({
      supportsNativePro: false,
      recommendedPreviewScale: 0.66,
      recommendedExportFormat: 'jpeg',
      maxPreviewDimension: 2048,
      fallbackReason: 'thermal_restricted',
      workingSpace: 'linear_srgb',
    });

    const result = await selectColorEngine({
      preferredMode: 'auto',
      preferredWorkingSpace: 'linear_prophoto',
      image: {
        success: true,
        width: 1600,
        height: 1200,
        isRaw: false,
      },
    });

    expect(result.resolvedMode).toBe('legacy');
    expect(result.diagnostics.fallbackReason).toBe('thermal_restricted');
    expect(result.workingSpace).toBe('linear_prophoto');
  });
});
