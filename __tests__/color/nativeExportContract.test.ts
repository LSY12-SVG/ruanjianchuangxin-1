import {NativeModules} from 'react-native';
import {captureRef} from 'react-native-view-shot';
import {defaultColorGradingParams} from '../../src/types/colorGrading';
import {defaultHslSecondaryAdjustments} from '../../src/types/colorEngine';
import {buildFilmicLut} from '../../src/colorEngine/lut/runtime';
import {
  exportGradedResult,
  getExportHistory,
} from '../../src/colorEngine/exportService';
import {appMMKV} from '../../src/store/mmkvStorage';

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => '/tmp/fallback-export.jpg'),
}));

describe('native export contract', () => {
  const historyKey = 'visiongenie.export.history';

  beforeEach(() => {
    appMMKV.delete(historyKey);
    jest.clearAllMocks();
  });

  it('sends android native export snapshot contract and records successful native export', async () => {
    const filmicLut = buildFilmicLut(16);
    const result = await exportGradedResult({
      targetRef: {current: {}},
      spec: {
        format: 'png16',
        bitDepth: 16,
        iccProfile: 'display_p3',
        quality: 1,
      },
      metadata: {
        engineMode: 'pro',
        workingSpace: 'linear_prophoto',
        sourceUri: 'file:///storage/emulated/0/DCIM/IMG_0001.HEIC',
        nativeSourcePath: '/tmp/staged/source.HEIC',
        isRawSource: false,
      },
      params: defaultColorGradingParams,
      hsl: defaultHslSecondaryAdjustments(),
      lut: {
        enabled: true,
        lutId: filmicLut.id,
        strength: 0.8,
      },
      lutData: filmicLut,
      localMasks: [],
    });

    expect(NativeModules.ProColorEngine.exportImage).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePathMode: 'converted_heif',
        parameterSnapshotId: expect.any(String),
        graphHash: expect.any(String),
        iccProfile: 'display_p3',
        params: defaultColorGradingParams,
        lut: {
          enabled: true,
          lutId: filmicLut.id,
          strength: 0.8,
        },
        lutData: expect.objectContaining({
          id: filmicLut.id,
          size: 16,
          data: expect.any(Array),
        }),
        localMasks: [],
      }),
    );
    expect(captureRef).not.toHaveBeenCalled();
    expect(NativeModules.ProColorEngine.saveToGallery).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUri: '/tmp/fake-export.png',
        albumName: 'VisionGenie',
        mimeType: 'image/png',
      }),
    );
    expect(result.nativeExportSucceeded).toBe(true);
    expect(result.degradedExport).toBe(false);
    expect(result.savedToGallery).toBe(true);
    expect(result.galleryUri).toContain('content://media/external/images/media/');
    expect(result.warnings).toEqual([]);

    const history = getExportHistory();
    expect(history[0].nativeExportSucceeded).toBe(true);
    expect(history[0].degradedExport).toBe(false);
  });

  it('falls back to view-shot and marks degraded export when native export fails', async () => {
    NativeModules.ProColorEngine.exportImage.mockRejectedValueOnce(
      new Error('native pipeline unavailable'),
    );

    const result = await exportGradedResult({
      targetRef: {current: {}},
      spec: {
        format: 'jpeg',
        bitDepth: 8,
        iccProfile: 'srgb',
        sourcePolicy: 'allow_fallback',
        quality: 0.9,
      },
      metadata: {
        engineMode: 'legacy',
        workingSpace: 'linear_srgb',
        sourceUri: 'file:///storage/emulated/0/DCIM/IMG_0002.jpg',
      },
      params: defaultColorGradingParams,
      hsl: defaultHslSecondaryAdjustments(),
      localMasks: [],
    });

    expect(captureRef).toHaveBeenCalled();
    expect(NativeModules.ProColorEngine.saveToGallery).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUri: '/tmp/fallback-export.jpg',
        albumName: 'VisionGenie',
        mimeType: 'image/jpeg',
      }),
    );
    expect(result.nativeExportSucceeded).toBe(false);
    expect(result.degradedExport).toBe(true);
    expect(result.savedToGallery).toBe(true);
    expect(result.degradeReason).toContain('原生导出失败');

    const history = getExportHistory();
    expect(history[0].degradedExport).toBe(true);
    expect(history[0].nativeExportSucceeded).toBe(false);
  });
});
