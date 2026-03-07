import {
  composeColorMatrices,
  createBrightnessMatrix,
  createContrastMatrix,
} from '../../src/utils/colorMatrix';

const applyMatrix = (
  matrix: number[],
  rgba: [number, number, number, number],
): [number, number, number, number] => {
  const [r, g, b, a] = rgba;
  return [
    matrix[0] * r + matrix[1] * g + matrix[2] * b + matrix[3] * a + matrix[4],
    matrix[5] * r + matrix[6] * g + matrix[7] * b + matrix[8] * a + matrix[9],
    matrix[10] * r + matrix[11] * g + matrix[12] * b + matrix[13] * a + matrix[14],
    matrix[15] * r + matrix[16] * g + matrix[17] * b + matrix[18] * a + matrix[19],
  ];
};

describe('composeColorMatrices', () => {
  it('returns identity for empty input', () => {
    const composed = composeColorMatrices([]);
    expect(composed).toEqual([
      1, 0, 0, 0, 0,
      0, 1, 0, 0, 0,
      0, 0, 1, 0, 0,
      0, 0, 0, 1, 0,
    ]);
  });

  it('matches sequential matrix application', () => {
    const brightness = createBrightnessMatrix(12);
    const contrast = createContrastMatrix(25);
    const composed = composeColorMatrices([brightness, contrast]);

    const input: [number, number, number, number] = [0.2, 0.4, 0.6, 1];
    const sequential = applyMatrix(contrast, applyMatrix(brightness, input));
    const once = applyMatrix(composed, input);

    sequential.forEach((value, index) => {
      expect(once[index]).toBeCloseTo(value, 6);
    });
  });
});

