import type {ImagePickerResult} from '../../hooks/useImagePicker';
import type {ColorGradingParams} from '../../types/colorGrading';
import type {
  ExportSpec,
  GradePresetV2,
  HslSecondaryAdjustments,
  LocalMaskLayer,
  ResolvedColorEngineMode,
  WorkingColorSpace,
} from '../../types/colorEngine';

export type PipelineStage =
  | 'decode'
  | 'linearize'
  | 'working_space'
  | 'global_grade'
  | 'local_masks'
  | 'output_transform'
  | 'export';

export interface ProPipelineState {
  stage: PipelineStage;
  workingSpace: WorkingColorSpace;
  source: Pick<
    ImagePickerResult,
    'uri' | 'width' | 'height' | 'type' | 'isRaw' | 'bitDepthHint'
  > | null;
  params: ColorGradingParams;
  preset: GradePresetV2;
  localMasks: LocalMaskLayer[];
  hsl: HslSecondaryAdjustments;
  exportSpec: ExportSpec;
  engineMode: ResolvedColorEngineMode;
}

export interface RenderPreviewRequest {
  source: ImagePickerResult;
  params: ColorGradingParams;
  preset: GradePresetV2;
  localMasks: LocalMaskLayer[];
  hsl: HslSecondaryAdjustments;
  workingSpace: WorkingColorSpace;
  engineMode: ResolvedColorEngineMode;
}
