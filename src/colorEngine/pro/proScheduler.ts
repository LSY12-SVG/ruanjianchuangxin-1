import type {ImagePickerResult} from '../../hooks/useImagePicker';
import type {ColorEngineDiagnostics} from '../../types/colorEngine';

export interface PreviewBudget {
  targetWidth: number;
  targetHeight: number;
  downsampleApplied: boolean;
}

export const createPreviewBudget = (
  image: ImagePickerResult | null,
  diagnostics: ColorEngineDiagnostics,
): PreviewBudget => {
  const width = image?.width || 0;
  const height = image?.height || 0;
  if (!width || !height) {
    return {
      targetWidth: 0,
      targetHeight: 0,
      downsampleApplied: false,
    };
  }

  const longEdge = Math.max(width, height);
  const maxLongEdge = diagnostics.maxPreviewDimension;
  const scale = Math.min(
    1,
    diagnostics.recommendedPreviewScale,
    maxLongEdge > 0 ? maxLongEdge / longEdge : 1,
  );

  return {
    targetWidth: Math.max(1, Math.round(width * scale)),
    targetHeight: Math.max(1, Math.round(height * scale)),
    downsampleApplied: scale < 0.999,
  };
};
