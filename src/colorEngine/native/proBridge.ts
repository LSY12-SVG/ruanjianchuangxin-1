import {NativeModules, Platform} from 'react-native';
import type {
  ColorEngineDiagnostics,
  ExportSpec,
  NativeGallerySaveRequest,
  NativeGallerySaveResult,
  NativeDecodeResult,
  NativeExportRequest,
  NativeExportResult,
  WorkingColorSpace,
} from '../../types/colorEngine';

interface NativeCapabilityPayload {
  platform?: string;
  supportsNativePro?: boolean;
  recommendedPreviewScale?: number;
  recommendedExportFormat?: ExportSpec['format'];
  maxPreviewDimension?: number;
  fallbackReason?: string | null;
  workingSpace?: WorkingColorSpace;
}

interface NativeDecodePayload {
  width?: number;
  height?: number;
  previewBase64?: string;
  nativeSourcePath?: string;
  bitDepthHint?: number;
  workingSpace?: WorkingColorSpace;
  sourceType?: 'raw' | 'bitmap';
}

interface NativeExportPayload {
  uri?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  format?: ExportSpec['format'];
  bitDepth?: 8 | 16;
  effectiveBitDepth?: 8 | 10 | 12 | 14 | 16;
  iccProfile?: ExportSpec['iccProfile'];
  graphHash?: string;
  gamutMappingApplied?: boolean;
  toneMapApplied?: boolean;
  warnings?: string[];
}

interface NativeGallerySavePayload {
  uri?: string;
  displayName?: string;
  mimeType?: string;
  fileSize?: number;
  relativePath?: string;
}

interface ProColorEngineNativeModule {
  getCapabilities?: () => Promise<NativeCapabilityPayload>;
  decodeSource?: (uri: string, maxDimension: number) => Promise<NativeDecodePayload>;
  exportImage?: (request: NativeExportRequest) => Promise<NativeExportPayload>;
  saveToGallery?: (request: NativeGallerySaveRequest) => Promise<NativeGallerySavePayload>;
}

const nativeModule = NativeModules?.ProColorEngine as ProColorEngineNativeModule | undefined;

export const isNativeProBridgeAvailable = (): boolean =>
  Boolean(nativeModule && typeof nativeModule.getCapabilities === 'function');

export const getNativeProDiagnostics = async (): Promise<{
  diagnostics: ColorEngineDiagnostics;
  workingSpace?: WorkingColorSpace;
}> => {
  if (!isNativeProBridgeAvailable()) {
    return {
      diagnostics: {
        supportsNativePro: false,
        recommendedPreviewScale: Platform.OS === 'android' ? 0.75 : 1,
        recommendedExportFormat: 'png16',
        maxPreviewDimension: 2048,
        fallbackReason: 'native_bridge_unavailable',
        source: 'javascript',
      },
    };
  }

  try {
    const payload = await nativeModule?.getCapabilities?.();
    return {
      diagnostics: {
        supportsNativePro: Boolean(payload?.supportsNativePro),
        recommendedPreviewScale: Number(payload?.recommendedPreviewScale || 1),
        recommendedExportFormat: payload?.recommendedExportFormat || 'png16',
        maxPreviewDimension: Number(payload?.maxPreviewDimension || 4096),
        fallbackReason: payload?.fallbackReason || undefined,
        source: 'native',
      },
      workingSpace: payload?.workingSpace,
    };
  } catch {
    return {
      diagnostics: {
        supportsNativePro: false,
        recommendedPreviewScale: 0.75,
        recommendedExportFormat: 'png16',
        maxPreviewDimension: 2048,
        fallbackReason: 'native_bridge_error',
        source: 'javascript',
      },
    };
  }
};

export const decodeNativeImageSource = async (
  uri: string,
  maxDimension: number,
): Promise<NativeDecodeResult | null> => {
  if (!isNativeProBridgeAvailable() || typeof nativeModule?.decodeSource !== 'function') {
    return null;
  }

  const payload = await nativeModule.decodeSource(uri, maxDimension);
  if (!payload?.previewBase64 || !payload.nativeSourcePath) {
    return null;
  }

  return {
    width: Number(payload.width || 0),
    height: Number(payload.height || 0),
    previewBase64: payload.previewBase64,
    nativeSourcePath: payload.nativeSourcePath,
    bitDepthHint:
      payload.bitDepthHint === 10 ||
      payload.bitDepthHint === 12 ||
      payload.bitDepthHint === 14 ||
      payload.bitDepthHint === 16
        ? payload.bitDepthHint
        : 8,
    workingSpace: payload.workingSpace || 'linear_srgb',
    sourceType: payload.sourceType || 'bitmap',
  };
};

export const exportNativeImage = async (
  request: NativeExportRequest,
): Promise<NativeExportResult | null> => {
  if (!isNativeProBridgeAvailable() || typeof nativeModule?.exportImage !== 'function') {
    return null;
  }

  const payload = await nativeModule.exportImage(request);
  if (!payload?.uri) {
    return null;
  }

  return {
    uri: payload.uri,
    width: Number(payload.width || 0),
    height: Number(payload.height || 0),
    fileSize: Number(payload.fileSize || 0),
    format: payload.format || request.format,
    bitDepth: payload.bitDepth || request.bitDepth,
    effectiveBitDepth: payload.effectiveBitDepth || request.bitDepth,
    iccProfile: payload.iccProfile || request.iccProfile,
    graphHash: payload.graphHash || request.graphHash,
    gamutMappingApplied: Boolean(payload.gamutMappingApplied),
    toneMapApplied: Boolean(payload.toneMapApplied),
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
  };
};

export const saveNativeImageToGallery = async (
  request: NativeGallerySaveRequest,
): Promise<NativeGallerySaveResult | null> => {
  if (!isNativeProBridgeAvailable() || typeof nativeModule?.saveToGallery !== 'function') {
    return null;
  }

  const payload = await nativeModule.saveToGallery(request);
  if (!payload?.uri) {
    return null;
  }

  return {
    uri: payload.uri,
    displayName: payload.displayName || request.displayName || '',
    mimeType: payload.mimeType || request.mimeType || 'image/jpeg',
    fileSize: Number(payload.fileSize || 0),
    relativePath: payload.relativePath || undefined,
  };
};
