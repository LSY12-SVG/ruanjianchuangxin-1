import {
  DEFAULT_EXPORT_SPEC,
  type ExportSpec,
  type ExportValidationResult,
} from '../types/colorEngine';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const normalizeFormat = (format: ExportSpec['format']): ExportSpec['format'] => {
  if (format === 'jpeg' || format === 'png16' || format === 'tiff16') {
    return format;
  }
  return DEFAULT_EXPORT_SPEC.format;
};

export const normalizeExportSpec = (spec?: Partial<ExportSpec>): ExportSpec => {
  const format = normalizeFormat(spec?.format || DEFAULT_EXPORT_SPEC.format);
  const requestedBitDepth = spec?.bitDepth === 8 || spec?.bitDepth === 16 ? spec.bitDepth : 16;

  const bitDepth = format === 'jpeg' ? 8 : requestedBitDepth;

  return {
    format,
    bitDepth,
    iccProfile: spec?.iccProfile || DEFAULT_EXPORT_SPEC.iccProfile,
    renderIntent: spec?.renderIntent || DEFAULT_EXPORT_SPEC.renderIntent,
    embedMetadata: spec?.embedMetadata ?? DEFAULT_EXPORT_SPEC.embedMetadata,
    sourcePolicy: spec?.sourcePolicy || DEFAULT_EXPORT_SPEC.sourcePolicy,
    size: spec?.size,
    quality: clamp01(Number(spec?.quality ?? DEFAULT_EXPORT_SPEC.quality)),
  };
};

export const validateExportSpec = (spec?: Partial<ExportSpec>): ExportValidationResult => {
  const normalized = normalizeExportSpec(spec);
  const warnings: string[] = [];

  if (normalized.format === 'jpeg' && normalized.bitDepth !== 8) {
    warnings.push('JPEG 仅支持 8-bit，已自动降级为 8-bit。');
  }

  if (normalized.format === 'tiff16' && normalized.iccProfile === 'srgb') {
    warnings.push('TIFF 16-bit 更建议使用 Display-P3 或 ProPhoto RGB。');
  }

  if (normalized.quality < 0.7) {
    warnings.push('导出质量低于 0.7，可能影响专业成片质量。');
  }

  if (normalized.sourcePolicy === 'allow_fallback') {
    warnings.push('当前允许回退导出，建议专业成片改为 original_only。');
  }

  return {
    normalized,
    warnings,
  };
};
