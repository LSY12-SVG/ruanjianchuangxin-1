import {NativeModules} from 'react-native';
import {defaultColorGradingParams} from '../../src/types/colorGrading';
import {defaultHslSecondaryAdjustments} from '../../src/types/colorEngine';
import {exportGradedResult} from '../../src/colorEngine/exportService';

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => '/tmp/fallback-export.jpg'),
}));

describe('export source policy', () => {
  it('blocks fallback when sourcePolicy is original_only', async () => {
    NativeModules.ProColorEngine.exportImage.mockRejectedValueOnce(new Error('native failed'));

    await expect(
      exportGradedResult({
        targetRef: {current: {}},
        spec: {
          format: 'png16',
          bitDepth: 16,
          iccProfile: 'display_p3',
          sourcePolicy: 'original_only',
          quality: 1,
        },
        metadata: {
          engineMode: 'pro',
          workingSpace: 'linear_prophoto',
          sourceUri: 'file:///storage/emulated/0/DCIM/IMG_0100.dng',
          nativeSourcePath: '/tmp/source.dng',
          isRawSource: true,
        },
        params: defaultColorGradingParams,
        hsl: defaultHslSecondaryAdjustments(),
        localMasks: [],
      }),
    ).rejects.toThrow('sourcePolicy=original_only');
  });
});
