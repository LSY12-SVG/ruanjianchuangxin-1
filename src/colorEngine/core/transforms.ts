import type {ExportSpec, WorkingColorSpace} from '../../types/colorEngine';

const DISPLAY_PROFILE_BY_WORKING_SPACE: Record<WorkingColorSpace, ExportSpec['iccProfile']> = {
  linear_prophoto: 'display_p3',
  linear_srgb: 'srgb',
};

export const resolveDisplayProfile = (
  workingSpace: WorkingColorSpace,
): ExportSpec['iccProfile'] => DISPLAY_PROFILE_BY_WORKING_SPACE[workingSpace];

export const shouldUseWideGamutPreview = (workingSpace: WorkingColorSpace): boolean =>
  workingSpace === 'linear_prophoto';

export const normalizeWorkingSpace = (
  requested: WorkingColorSpace | undefined,
  isRaw: boolean | undefined,
): WorkingColorSpace => {
  if (requested) {
    return requested;
  }
  return isRaw ? 'linear_prophoto' : 'linear_srgb';
};
