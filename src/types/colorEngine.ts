import type {
  BasicLightParams,
  ColorBalanceParams,
  ColorGradingParams,
  ColorWheels,
  VoiceControllableParam,
  ToneCurves,
} from './colorGrading';

export type ColorEngineMode = 'legacy' | 'pro' | 'auto';
export type ResolvedColorEngineMode = Exclude<ColorEngineMode, 'auto'>;

export type WorkingColorSpace = 'linear_prophoto' | 'linear_srgb';

export type LocalMaskType = 'subject' | 'sky' | 'skin' | 'background' | 'brush';

export type ExportFormat = 'jpeg' | 'png16' | 'tiff16';
export type IccProfile = 'srgb' | 'display_p3' | 'prophoto_rgb';
export type RenderIntent = 'perceptual' | 'relative_colorimetric' | 'saturation' | 'absolute_colorimetric';
export type SourcePolicy = 'original_only' | 'allow_fallback';
export type CloudServiceState = 'healthy' | 'degraded' | 'offline';
export type CloudFallbackReason =
  | 'timeout'
  | 'host_unreachable'
  | 'http_5xx'
  | 'model_unavailable'
  | 'bad_payload'
  | 'dns_error'
  | 'auth_error'
  | 'unknown';

export interface LocalMaskAdjustments {
  exposure: number; // -2 ~ 2
  temperature: number; // -100 ~ 100
  saturation: number; // -100 ~ 100
  clarity: number; // -100 ~ 100
  denoise: number; // -100 ~ 100
}

export interface LocalMaskLayer {
  id: string;
  type: LocalMaskType;
  enabled: boolean;
  strength: number; // 0 ~ 1
  confidence: number; // 0 ~ 1
  feather?: number; // 0 ~ 1
  density?: number; // 0 ~ 1
  invert?: boolean;
  edgeAwareRefine?: number; // 0 ~ 1
  source: 'cloud' | 'brush' | 'fallback';
  recommendedBy?: 'cloud_model' | 'heuristic_fallback';
  adjustments: LocalMaskAdjustments;
}

export interface Lut3D {
  id: string;
  name: string;
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  data: number[];
}

export interface LutSlot {
  enabled: boolean;
  strength: number; // 0 ~ 1
  lutId: string;
}

export interface HslBandAdjustment {
  hue: number;
  saturation: number;
  luminance: number;
}

export interface HslSecondaryAdjustments {
  red: HslBandAdjustment;
  orange: HslBandAdjustment;
  yellow: HslBandAdjustment;
  green: HslBandAdjustment;
  aqua: HslBandAdjustment;
  blue: HslBandAdjustment;
  purple: HslBandAdjustment;
  magenta: HslBandAdjustment;
}

export interface GradePresetV2 {
  id: string;
  name: string;
  global: {
    basic: BasicLightParams;
    colorBalance: ColorBalanceParams;
  };
  curve: ToneCurves;
  wheels: ColorWheels;
  hsl: HslSecondaryAdjustments;
  lut?: LutSlot | null;
  localMasks: LocalMaskLayer[];
  metadata: {
    version: 2;
    engine: 'pro';
    createdAt: string;
    semanticVersion?: number;
    sourcePresetId?: string;
  };
}

export interface ExportSpec {
  format: ExportFormat;
  bitDepth: 8 | 16;
  iccProfile: IccProfile;
  renderIntent?: RenderIntent;
  embedMetadata?: boolean;
  sourcePolicy?: SourcePolicy;
  size?: {
    width?: number;
    height?: number;
  };
  quality: number; // 0 ~ 1
}

export type OperatorNodeId =
  | 'decode'
  | 'input_icc'
  | 'linearize'
  | 'working_space'
  | 'basic'
  | 'curves'
  | 'wheels'
  | 'hsl'
  | 'lut'
  | 'local_masks'
  | 'rolloff'
  | 'gamut_map'
  | 'output_icc'
  | 'export';

export interface OperatorNodeV1 {
  id: OperatorNodeId;
  enabled: boolean;
  paramsHash: string;
}

export interface OperatorGraphV1 {
  version: 1;
  workingSpace: WorkingColorSpace;
  outputProfile: IccProfile;
  renderIntent: RenderIntent;
  nodes: OperatorNodeV1[];
  graphHash: string;
}

export interface ExportValidationResult {
  normalized: ExportSpec;
  warnings: string[];
}

export interface ColorEngineDiagnostics {
  supportsNativePro: boolean;
  recommendedPreviewScale: number;
  recommendedExportFormat: ExportFormat;
  maxPreviewDimension: number;
  fallbackReason?: string;
  source: 'native' | 'javascript';
}

export interface NativeDecodeResult {
  width: number;
  height: number;
  previewBase64: string;
  nativeSourcePath: string;
  bitDepthHint: 8 | 10 | 12 | 14 | 16;
  workingSpace: WorkingColorSpace;
  sourceType: 'raw' | 'bitmap';
  sourceTypeHint?: 'raw' | 'heif' | 'jpeg_png';
}

export interface NativeExportRequest {
  sourceUri: string;
  nativeSourcePath?: string;
  sourcePathMode: 'native_original' | 'staged_copy' | 'converted_heif';
  parameterSnapshotId: string;
  operatorGraph?: OperatorGraphV1;
  graphHash?: string;
  format: ExportFormat;
  bitDepth: 8 | 16;
  iccProfile: IccProfile;
  renderIntent?: RenderIntent;
  embedMetadata?: boolean;
  sourcePolicy?: SourcePolicy;
  quality: number;
  workingSpace: WorkingColorSpace;
  isRawSource?: boolean;
  params: ColorGradingParams;
  hsl: HslSecondaryAdjustments;
  lut?: LutSlot | null;
  lutData?: Lut3D | null;
  localMasks: LocalMaskLayer[];
}

export interface NativeExportResult {
  uri: string;
  width: number;
  height: number;
  fileSize: number;
  format: ExportFormat;
  bitDepth: 8 | 16;
  effectiveBitDepth?: 8 | 10 | 12 | 14 | 16;
  iccProfile: IccProfile;
  graphHash?: string;
  gamutMappingApplied?: boolean;
  toneMapApplied?: boolean;
  warnings: string[];
}

export interface ExportHistoryEntry {
  uri: string;
  spec: ExportSpec;
  warnings: string[];
  exportedAt: string;
  graphHash?: string;
  metadata?: {
    engineMode?: ResolvedColorEngineMode;
    workingSpace?: WorkingColorSpace;
    sourceUri?: string;
    nativeSourcePath?: string;
    isRawSource?: boolean;
    sourceBitDepth?: number;
    inputIccProfile?: IccProfile;
    outputIccProfile?: IccProfile;
    degradeAt?: OperatorNodeId;
  };
  nativeExportSucceeded: boolean;
  degradedExport: boolean;
  degradeReason?: string;
}

export interface QualityReport {
  deltaE: number;
  previewExportDelta: number;
  bandingScore: number;
  clipStats: {
    highlights: number;
    shadows: number;
    outOfGamut: number;
  };
}

export interface SegmentationMaskDescriptor {
  type: Exclude<LocalMaskType, 'brush'>;
  confidence: number;
  coverage: number;
}

export interface SegmentationResult {
  model: string;
  latencyMs: number;
  fallbackUsed: boolean;
  fallbackReason?: CloudFallbackReason;
  cloudState: CloudServiceState;
  endpoint?: string;
  nextRecoveryAction?: string;
  retrying?: boolean;
  masks: SegmentationMaskDescriptor[];
}

export type AutoGradeStatus =
  | 'idle'
  | 'analyzing'
  | 'refining'
  | 'applying'
  | 'completed'
  | 'degraded'
  | 'failed';

export interface AutoGradeAction {
  action: 'set_param' | 'adjust_param' | 'apply_style' | 'reset';
  target: VoiceControllableParam | 'style';
  value?: number;
  delta?: number;
  style?: string;
  strength?: number;
}

export interface AutoGradeRequest {
  mode: 'upload_autograde';
  phase?: 'fast' | 'refine';
  locale: string;
  currentParams: ColorGradingParams;
  image: {
    uri?: string;
    mimeType: string;
    width: number;
    height: number;
    base64: string;
    payloadBytes?: number;
    encodeQuality?: number;
    maxEdgeApplied?: number;
  };
  imageStats: {
    lumaMean: number;
    lumaStd: number;
    highlightClipPct: number;
    shadowClipPct: number;
    saturationMean: number;
    skinPct?: number;
    skyPct?: number;
    greenPct?: number;
  };
}

export interface AutoGradeReport {
  phase: 'fast' | 'refine';
  sceneProfile: string;
  qualityRiskFlags: string[];
  explanation: string;
  fallbackUsed: boolean;
  fallbackReason?: CloudFallbackReason;
  refineApplied: boolean;
  refineFallbackReason?: CloudFallbackReason;
  cloudState: CloudServiceState;
  endpoint?: string;
  lockedEndpoint?: string;
  latencyMs: number;
  nextRecoveryAction: string;
  phaseTimeoutMs?: number;
  phaseBudgetMs?: number;
  payloadBytes?: number;
  encodeQuality?: number;
}

export interface AutoGradeResult {
  phase: 'fast' | 'refine';
  sceneProfile: string;
  confidence: number;
  globalActions: AutoGradeAction[];
  localMaskPlan: LocalMaskLayer[];
  qualityRiskFlags: string[];
  explanation: string;
  fallbackUsed: boolean;
  fallbackReason?: CloudFallbackReason;
  cloudState: CloudServiceState;
  latencyMs: number;
  endpoint?: string;
  lockedEndpoint?: string;
  nextRecoveryAction: string;
  phaseTimeoutMs?: number;
  phaseBudgetMs?: number;
  payloadBytes?: number;
  encodeQuality?: number;
  mimeType?: string;
  modelUsed?: string;
  modelRoute?: string;
}

export interface EngineSelectionResult {
  preferredMode: ColorEngineMode;
  resolvedMode: ResolvedColorEngineMode;
  workingSpace: WorkingColorSpace;
  diagnostics: ColorEngineDiagnostics;
}

export const defaultMaskAdjustments = (): LocalMaskAdjustments => ({
  exposure: 0,
  temperature: 0,
  saturation: 0,
  clarity: 0,
  denoise: 0,
});

export const normalizeLocalMaskLayer = (layer: LocalMaskLayer): LocalMaskLayer => ({
  ...layer,
  feather: layer.feather ?? 0.35,
  density: layer.density ?? 1,
  invert: layer.invert ?? false,
  edgeAwareRefine: layer.edgeAwareRefine ?? 0.4,
});

export const defaultHslSecondaryAdjustments = (): HslSecondaryAdjustments => ({
  red: {hue: 0, saturation: 0, luminance: 0},
  orange: {hue: 0, saturation: 0, luminance: 0},
  yellow: {hue: 0, saturation: 0, luminance: 0},
  green: {hue: 0, saturation: 0, luminance: 0},
  aqua: {hue: 0, saturation: 0, luminance: 0},
  blue: {hue: 0, saturation: 0, luminance: 0},
  purple: {hue: 0, saturation: 0, luminance: 0},
  magenta: {hue: 0, saturation: 0, luminance: 0},
});

export const DEFAULT_EXPORT_SPEC: ExportSpec = {
  format: 'png16',
  bitDepth: 16,
  iccProfile: 'display_p3',
  renderIntent: 'perceptual',
  embedMetadata: true,
  sourcePolicy: 'original_only',
  quality: 1,
};
