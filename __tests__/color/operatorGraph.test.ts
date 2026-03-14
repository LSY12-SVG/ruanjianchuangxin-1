import {defaultColorGradingParams} from '../../src/types/colorGrading';
import {defaultHslSecondaryAdjustments} from '../../src/types/colorEngine';
import {buildOperatorGraphV1} from '../../src/colorEngine/core/operatorGraph';

describe('operator graph serializer', () => {
  it('builds deterministic graph hash for equal payload', () => {
    const input = {
      params: defaultColorGradingParams,
      hsl: defaultHslSecondaryAdjustments(),
      localMasks: [],
      workingSpace: 'linear_prophoto' as const,
      outputProfile: 'display_p3' as const,
      renderIntent: 'perceptual' as const,
    };

    const graphA = buildOperatorGraphV1(input);
    const graphB = buildOperatorGraphV1(input);

    expect(graphA.graphHash).toBe(graphB.graphHash);
    expect(graphA.nodes.some(node => node.id === 'gamut_map')).toBe(true);
  });

  it('changes graph hash when grading params differ', () => {
    const base = buildOperatorGraphV1({
      params: defaultColorGradingParams,
      hsl: defaultHslSecondaryAdjustments(),
      localMasks: [],
      workingSpace: 'linear_srgb',
      outputProfile: 'srgb',
      renderIntent: 'relative_colorimetric',
    });

    const nextParams = {
      ...defaultColorGradingParams,
      basic: {...defaultColorGradingParams.basic, exposure: 0.5},
    };
    const changed = buildOperatorGraphV1({
      params: nextParams,
      hsl: defaultHslSecondaryAdjustments(),
      localMasks: [],
      workingSpace: 'linear_srgb',
      outputProfile: 'srgb',
      renderIntent: 'relative_colorimetric',
    });

    expect(changed.graphHash).not.toBe(base.graphHash);
  });
});

