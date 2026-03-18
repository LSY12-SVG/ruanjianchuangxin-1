import type {RefObject} from 'react';
import {captureRef} from 'react-native-view-shot';
import {appMMKV} from '../store/mmkvStorage';
import type {ColorGradingParams} from '../types/colorGrading';
import type {
  IccProfile,
  ExportHistoryEntry,
  ExportSpec,
  HslSecondaryAdjustments,
  LocalMaskLayer,
  Lut3D,
  LutSlot,
  OperatorGraphV1,
  ResolvedColorEngineMode,
  WorkingColorSpace,
} from '../types/colorEngine';
import {validateExportSpec} from './exportSpec';
import {defaultHslSecondaryAdjustments, normalizeLocalMaskLayer} from '../types/colorEngine';
import {exportNativeImage, saveNativeImageToGallery} from './native/proBridge';
import {buildOperatorGraphV1} from './core/operatorGraph';

interface ExportRequest {
  targetRef: RefObject<unknown> | unknown;
  spec: Partial<ExportSpec>;
  params?: ColorGradingParams;
  hsl?: HslSecondaryAdjustments;
  lut?: LutSlot | null;
  lutData?: Lut3D | null;
  localMasks?: LocalMaskLayer[];
  metadata?: {
    engineMode?: ResolvedColorEngineMode;
    workingSpace?: WorkingColorSpace;
    sourceUri?: string;
    nativeSourcePath?: string;
    isRawSource?: boolean;
    sourceBitDepth?: number;
    inputIccProfile?: IccProfile;
    outputIccProfile?: IccProfile;
    degradeAt?: 'export';
  };
}

export interface ExportResult {
  uri: string;
  galleryUri?: string;
  savedToGallery: boolean;
  galleryDisplayName?: string;
  spec: ExportSpec;
  warnings: string[];
  exportedAt: string;
  metadata?: ExportRequest['metadata'];
  operatorGraph?: OperatorGraphV1;
  graphHash?: string;
  nativeExportSucceeded: boolean;
  degradedExport: boolean;
  degradeReason?: string;
}

const HISTORY_KEY = 'visiongenie.export.history';
const EXPORT_ALBUM_NAME = 'VisionGenie';

const toViewShotFormat = (format: ExportSpec['format']): 'jpg' | 'png' =>
  format === 'jpeg' ? 'jpg' : 'png';

const getExportMimeType = (format: ExportSpec['format']): string => {
  switch (format) {
    case 'png16':
      return 'image/png';
    case 'tiff16':
      return 'image/tiff';
    case 'jpeg':
    default:
      return 'image/jpeg';
  }
};

const getExportExtension = (format: ExportSpec['format']): string => {
  switch (format) {
    case 'png16':
      return 'png';
    case 'tiff16':
      return 'tiff';
    case 'jpeg':
    default:
      return 'jpg';
  }
};

const buildExportDisplayName = (format: ExportSpec['format']): string => {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `visiongenie_${timestamp}.${getExportExtension(format)}`;
};

interface GallerySaveOutcome {
  savedToGallery: boolean;
  galleryUri?: string;
  galleryDisplayName?: string;
  warnings: string[];
}

const saveExportToGallery = async (
  sourceUri: string,
  format: ExportSpec['format'],
): Promise<GallerySaveOutcome> => {
  const mimeType = getExportMimeType(format);
  const displayName = buildExportDisplayName(format);

  try {
    const saved = await saveNativeImageToGallery({
      sourceUri,
      albumName: EXPORT_ALBUM_NAME,
      displayName,
      mimeType,
    });

    if (!saved?.uri) {
      return {
        savedToGallery: false,
        warnings: ['相册写入模块不可用，导出文件已保留在临时目录。'],
      };
    }

    return {
      savedToGallery: true,
      galleryUri: saved.uri,
      galleryDisplayName: saved.displayName || displayName,
      warnings: [],
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '原生相册写入失败，已保留临时导出文件。';
    return {
      savedToGallery: false,
      warnings: [`保存到相册失败：${message}`],
    };
  }
};

const resolveSourcePathMode = (metadata?: ExportRequest['metadata']) => {
  if (!metadata?.nativeSourcePath) {
    return 'staged_copy' as const;
  }

  const source = (metadata.sourceUri || '').toLowerCase();
  const nativePath = metadata.nativeSourcePath.toLowerCase();
  const heifHint =
    source.includes('.heic') ||
    source.includes('.heif') ||
    nativePath.endsWith('.heic') ||
    nativePath.endsWith('.heif');

  if (heifHint) {
    return 'converted_heif' as const;
  }
  return 'native_original' as const;
};

const persistExportHistory = (entry: ExportHistoryEntry) => {
  const existing = appMMKV.getString(HISTORY_KEY);
  let history: ExportHistoryEntry[] = [];
  if (existing) {
    try {
      history = JSON.parse(existing) as ExportHistoryEntry[];
    } catch {
      history = [];
    }
  }
  const nextHistory = [entry, ...history].slice(0, 30);
  appMMKV.set(HISTORY_KEY, JSON.stringify(nextHistory));
};

export const exportGradedResult = async ({
  targetRef,
  spec,
  params,
  hsl,
  lut,
  lutData,
  localMasks,
  metadata,
}: ExportRequest): Promise<ExportResult> => {
  const {normalized, warnings} = validateExportSpec(spec);

  if (!targetRef) {
    throw new Error('导出目标不可用');
  }

  const downgradedWarnings = [...warnings];
  const resolvedHsl = hsl || defaultHslSecondaryAdjustments();
  const resolvedMasks = (localMasks || []).map(mask => normalizeLocalMaskLayer(mask));
  const shouldAllowFallback = normalized.sourcePolicy === 'allow_fallback';
  let operatorGraph: OperatorGraphV1 | undefined;

  if (params && metadata?.workingSpace) {
    operatorGraph = buildOperatorGraphV1({
      params,
      hsl: resolvedHsl,
      lut,
      localMasks: resolvedMasks,
      workingSpace: metadata.workingSpace,
      outputProfile: normalized.iccProfile,
      renderIntent: normalized.renderIntent || 'perceptual',
    });
  }

  if (metadata?.sourceUri && params && metadata.workingSpace) {
    try {
      const nativeResult = await exportNativeImage({
        sourceUri: metadata.sourceUri,
        nativeSourcePath: metadata.nativeSourcePath,
        sourcePathMode: resolveSourcePathMode(metadata),
        parameterSnapshotId: `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`,
        operatorGraph,
        graphHash: operatorGraph?.graphHash,
        format: normalized.format,
        bitDepth: normalized.bitDepth,
        iccProfile: normalized.iccProfile,
        renderIntent: normalized.renderIntent,
        embedMetadata: normalized.embedMetadata,
        sourcePolicy: normalized.sourcePolicy,
        quality: normalized.quality,
        workingSpace: metadata.workingSpace,
        isRawSource: metadata.isRawSource,
        params,
        hsl: resolvedHsl,
        lut,
        lutData,
        localMasks: resolvedMasks,
      });

      if (nativeResult) {
        const gallerySave = await saveExportToGallery(nativeResult.uri, normalized.format);
        const result: ExportResult = {
          uri: nativeResult.uri,
          galleryUri: gallerySave.galleryUri,
          savedToGallery: gallerySave.savedToGallery,
          galleryDisplayName: gallerySave.galleryDisplayName,
          spec: normalized,
          warnings: [...downgradedWarnings, ...nativeResult.warnings, ...gallerySave.warnings],
          exportedAt: new Date().toISOString(),
          metadata: {
            ...metadata,
            sourceBitDepth: metadata.sourceBitDepth || nativeResult.effectiveBitDepth,
            inputIccProfile:
              metadata.inputIccProfile ||
              (metadata.workingSpace === 'linear_prophoto' ? 'prophoto_rgb' : 'srgb'),
            outputIccProfile: normalized.iccProfile,
          },
          operatorGraph,
          graphHash: nativeResult.graphHash || operatorGraph?.graphHash,
          nativeExportSucceeded: true,
          degradedExport: false,
        };

        persistExportHistory(result);
        return result;
      }
    } catch (error) {
      const nativeFailMessage =
        error instanceof Error
          ? `原生导出失败，已回退预览导出: ${error.message}`
          : '原生导出失败，已回退预览导出。';
      downgradedWarnings.push(nativeFailMessage);
      if (!shouldAllowFallback) {
        throw new Error(`sourcePolicy=original_only 禁止回退导出。${nativeFailMessage}`);
      }
    }
  }

  if (!shouldAllowFallback) {
    throw new Error('sourcePolicy=original_only 要求原生导出成功，当前条件不满足。');
  }

  if (normalized.format === 'tiff16') {
    downgradedWarnings.push('当前已回退为预览导出，TIFF 容器临时输出为兼容 PNG。');
  }

  const uri = await captureRef(targetRef as never, {
    format: toViewShotFormat(normalized.format),
    quality: normalized.quality,
    result: 'tmpfile',
  });
  const gallerySave = await saveExportToGallery(uri, normalized.format);

  const result: ExportResult = {
    uri,
    galleryUri: gallerySave.galleryUri,
    savedToGallery: gallerySave.savedToGallery,
    galleryDisplayName: gallerySave.galleryDisplayName,
    spec: normalized,
    warnings: [...downgradedWarnings, ...gallerySave.warnings],
    exportedAt: new Date().toISOString(),
    metadata: {
      ...metadata,
      outputIccProfile: normalized.iccProfile,
      degradeAt: 'export',
    },
    operatorGraph,
    graphHash: operatorGraph?.graphHash,
    nativeExportSucceeded: false,
    degradedExport: true,
    degradeReason:
      downgradedWarnings.find(item => item.includes('原生导出失败')) || 'fallback_view_shot',
  };

  persistExportHistory(result);

  return result;
};

export const getExportHistory = (): ExportHistoryEntry[] => {
  const existing = appMMKV.getString(HISTORY_KEY);
  if (!existing) {
    return [];
  }

  try {
    return JSON.parse(existing) as ExportHistoryEntry[];
  } catch {
    return [];
  }
};
