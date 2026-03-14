import type {ImagePickerResult} from '../hooks/useImagePicker';
import type {
  ColorEngineMode,
  ColorEngineDiagnostics,
  EngineSelectionResult,
  WorkingColorSpace,
} from '../types/colorEngine';
import {getNativeProDiagnostics} from './native/proBridge';
import {
  getColorEngineCapabilities,
  resolveColorEngineMode,
  type EngineCapabilities,
} from './capability';
import {normalizeWorkingSpace} from './core/transforms';

const toDiagnostics = (
  capabilities: EngineCapabilities,
  fallbackReason?: string,
): ColorEngineDiagnostics => ({
  supportsNativePro: capabilities.supportsPro,
  recommendedPreviewScale:
    capabilities.gpuTier === 'high' ? 1 : capabilities.gpuTier === 'mid' ? 0.8 : 0.65,
  recommendedExportFormat: capabilities.supportsPro ? 'png16' : 'jpeg',
  maxPreviewDimension:
    capabilities.gpuTier === 'high' ? 4096 : capabilities.gpuTier === 'mid' ? 3072 : 2048,
  fallbackReason,
  source: 'javascript',
});

export const selectColorEngine = async (input: {
  preferredMode: ColorEngineMode;
  preferredWorkingSpace?: WorkingColorSpace;
  image?: ImagePickerResult | null;
}): Promise<EngineSelectionResult> => {
  const capabilities = getColorEngineCapabilities();
  const nativeState = await getNativeProDiagnostics();
  const supportsPro = capabilities.supportsPro && nativeState.diagnostics.supportsNativePro;
  const resolvedMode = resolveColorEngineMode(input.preferredMode, {
    ...capabilities,
    supportsPro,
  });

  const workingSpace = normalizeWorkingSpace(
    input.preferredWorkingSpace || nativeState.workingSpace,
    input.image?.isRaw,
  );

  return {
    preferredMode: input.preferredMode,
    resolvedMode,
    workingSpace,
    diagnostics:
      nativeState.diagnostics.source === 'native'
        ? {
            ...nativeState.diagnostics,
            fallbackReason:
              resolvedMode === 'legacy'
                ? nativeState.diagnostics.fallbackReason || 'native_capability_restricted'
                : nativeState.diagnostics.fallbackReason,
          }
        : toDiagnostics(
            capabilities,
            resolvedMode === 'legacy' ? 'javascript_capability_restricted' : undefined,
          ),
  };
};
