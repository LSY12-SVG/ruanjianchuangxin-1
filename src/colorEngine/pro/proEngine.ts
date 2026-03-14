import type {ImagePickerResult} from '../../hooks/useImagePicker';
import type {
  ColorEngineDiagnostics,
  ExportSpec,
  GradePresetV2,
  HslSecondaryAdjustments,
  LocalMaskLayer,
} from '../../types/colorEngine';
import type {ColorGradingParams} from '../../types/colorGrading';
import {createPreviewBudget} from './proScheduler';

export interface ProRenderSession {
  diagnostics: ColorEngineDiagnostics;
  previewBudget: ReturnType<typeof createPreviewBudget>;
  source: Pick<ImagePickerResult, 'uri' | 'isRaw' | 'bitDepthHint' | 'width' | 'height'> | null;
  params: ColorGradingParams;
  preset: GradePresetV2;
  localMasks: LocalMaskLayer[];
  hsl: HslSecondaryAdjustments;
  exportSpec: ExportSpec;
}

export const buildProRenderSession = (input: {
  diagnostics: ColorEngineDiagnostics;
  image: ImagePickerResult | null;
  params: ColorGradingParams;
  preset: GradePresetV2;
  localMasks: LocalMaskLayer[];
  hsl: HslSecondaryAdjustments;
  exportSpec: ExportSpec;
}): ProRenderSession => ({
  diagnostics: input.diagnostics,
  previewBudget: createPreviewBudget(input.image, input.diagnostics),
  source: input.image
    ? {
        uri: input.image.uri,
        isRaw: input.image.isRaw,
        bitDepthHint: input.image.bitDepthHint,
        width: input.image.width,
        height: input.image.height,
      }
    : null,
  params: input.params,
  preset: input.preset,
  localMasks: input.localMasks,
  hsl: input.hsl,
  exportSpec: input.exportSpec,
});
