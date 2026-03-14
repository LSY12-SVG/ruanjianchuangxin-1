import {normalizeExportSpec, validateExportSpec} from '../../src/colorEngine/exportSpec';

describe('exportSpec', () => {
  it('forces jpeg exports to 8-bit', () => {
    const normalized = normalizeExportSpec({
      format: 'jpeg',
      bitDepth: 16,
      iccProfile: 'display_p3',
      quality: 0.9,
    });

    expect(normalized.bitDepth).toBe(8);
    expect(normalized.format).toBe('jpeg');
  });

  it('warns when tiff16 is paired with srgb and low quality', () => {
    const result = validateExportSpec({
      format: 'tiff16',
      bitDepth: 16,
      iccProfile: 'srgb',
      quality: 0.5,
    });

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        'TIFF 16-bit 更建议使用 Display-P3 或 ProPhoto RGB。',
        '导出质量低于 0.7，可能影响专业成片质量。',
      ]),
    );
  });

  it('defaults to original_only source policy', () => {
    const normalized = normalizeExportSpec({
      format: 'png16',
      bitDepth: 16,
      iccProfile: 'display_p3',
      quality: 1,
    });

    expect(normalized.sourcePolicy).toBe('original_only');
    expect(normalized.embedMetadata).toBe(true);
    expect(normalized.renderIntent).toBe('perceptual');
  });
});
