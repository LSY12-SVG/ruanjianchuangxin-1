import {
  DEFAULT_EXPORT_SPEC,
  defaultHslSecondaryAdjustments,
  type GradePresetV2,
} from '../../types/colorEngine';
import type {ColorGradingParams} from '../../types/colorGrading';
import type {RenderPreviewRequest, ProPipelineState, PipelineStage} from './types';

const DEFAULT_STAGES: PipelineStage[] = [
  'decode',
  'linearize',
  'working_space',
  'global_grade',
  'local_masks',
  'output_transform',
  'export',
];

export const createPipelineState = (
  request: RenderPreviewRequest,
): ProPipelineState => ({
  stage: 'decode',
  workingSpace: request.workingSpace,
  source: request.source
    ? {
        uri: request.source.uri,
        width: request.source.width,
        height: request.source.height,
        type: request.source.type,
        isRaw: request.source.isRaw,
        bitDepthHint: request.source.bitDepthHint,
      }
    : null,
  params: request.params,
  preset: request.preset,
  localMasks: request.localMasks,
  hsl: request.hsl,
  exportSpec: DEFAULT_EXPORT_SPEC,
  engineMode: request.engineMode,
});

export const advancePipelineState = (
  state: ProPipelineState,
  stage: PipelineStage,
): ProPipelineState => ({
  ...state,
  stage,
});

export const summarizePipeline = (
  params: ColorGradingParams,
  preset: GradePresetV2,
): string[] => {
  const steps = [...DEFAULT_STAGES];
  if (preset.localMasks.length === 0) {
    return steps.filter(step => step !== 'local_masks');
  }
  if (params.colorBalance.saturation === 0 && params.colorBalance.vibrance === 0) {
    return steps.filter(step => step !== 'working_space');
  }
  return steps;
};

export const resolvePreviewHsl = (preset?: GradePresetV2) =>
  preset?.hsl || defaultHslSecondaryAdjustments();
