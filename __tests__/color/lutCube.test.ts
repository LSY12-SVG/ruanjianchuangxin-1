import {parseCubeLut, serializeCubeLut} from '../../src/colorEngine/lut/cube';

describe('cube lut parser', () => {
  it('parses basic 2x2x2 cube and can serialize back', () => {
    const cube = `
TITLE "Test LUT"
LUT_3D_SIZE 2
DOMAIN_MIN 0 0 0
DOMAIN_MAX 1 1 1
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
`;

    const lut = parseCubeLut(cube, 'lut_test');
    expect(lut.id).toBe('lut_test');
    expect(lut.size).toBe(2);
    expect(lut.data).toHaveLength(24);

    const serialized = serializeCubeLut(lut);
    expect(serialized).toContain('LUT_3D_SIZE 2');
    expect(serialized).toContain('TITLE "Test LUT"');
  });
});

