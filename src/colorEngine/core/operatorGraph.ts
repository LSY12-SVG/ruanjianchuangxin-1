import type {ColorGradingParams} from '../../types/colorGrading';
import type {
  HslSecondaryAdjustments,
  IccProfile,
  LocalMaskLayer,
  LutSlot,
  OperatorGraphV1,
  OperatorNodeId,
  OperatorNodeV1,
  RenderIntent,
  WorkingColorSpace,
} from '../../types/colorEngine';

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
};

const fnv1aHash = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

const hashParams = (params: unknown): string => fnv1aHash(stableStringify(params));

const buildNode = (id: OperatorNodeId, enabled: boolean, params: unknown): OperatorNodeV1 => ({
  id,
  enabled,
  paramsHash: hashParams(params),
});

interface BuildOperatorGraphRequest {
  params: ColorGradingParams;
  hsl: HslSecondaryAdjustments;
  localMasks: LocalMaskLayer[];
  lut?: LutSlot | null;
  workingSpace: WorkingColorSpace;
  outputProfile: IccProfile;
  renderIntent: RenderIntent;
}

export const buildOperatorGraphV1 = ({
  params,
  hsl,
  localMasks,
  lut,
  workingSpace,
  outputProfile,
  renderIntent,
}: BuildOperatorGraphRequest): OperatorGraphV1 => {
  const nodes: OperatorNodeV1[] = [
    buildNode('decode', true, {source: 'native_decode'}),
    buildNode('input_icc', true, {workingSpace}),
    buildNode('linearize', true, {workingSpace}),
    buildNode('working_space', true, {workingSpace}),
    buildNode('basic', true, {
      basic: params.basic,
      colorBalance: params.colorBalance,
    }),
    buildNode('curves', true, params.pro.curves),
    buildNode('wheels', true, params.pro.wheels),
    buildNode('hsl', true, hsl),
    buildNode('lut', Boolean(lut?.enabled), lut || {}),
    buildNode('local_masks', localMasks.length > 0, localMasks),
    buildNode('rolloff', true, {highlights: params.basic.highlights, whites: params.basic.whites}),
    buildNode('gamut_map', true, {workingSpace, outputProfile}),
    buildNode('output_icc', true, {outputProfile, renderIntent}),
    buildNode('export', true, {bitDepth: outputProfile === 'srgb' ? 8 : 16}),
  ];

  const graphHash = fnv1aHash(
    stableStringify({
      version: 1,
      workingSpace,
      outputProfile,
      renderIntent,
      nodes,
    }),
  );

  return {
    version: 1,
    workingSpace,
    outputProfile,
    renderIntent,
    nodes,
    graphHash,
  };
};

