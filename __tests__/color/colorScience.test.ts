import {
  applyHighlightRolloffFilmicSoft,
  applyPerceptualGamutMapToSrgb,
  eotfSrgb,
  filmicSoftRollOff,
  oetfSrgb,
} from '../../src/colorEngine/core/colorScience';

describe('color science helpers', () => {
  it('round-trips sRGB transfer functions with low error', () => {
    const samples = [0, 0.01, 0.02, 0.18, 0.5, 0.75, 1];
    samples.forEach(sample => {
      const roundTrip = oetfSrgb(eotfSrgb(sample));
      expect(Math.abs(roundTrip - sample)).toBeLessThan(1e-5);
    });
  });

  it('applies monotonic filmic soft roll-off', () => {
    const a = filmicSoftRollOff(0.82);
    const b = filmicSoftRollOff(0.92);
    const c = filmicSoftRollOff(1);
    expect(a).toBeLessThanOrEqual(b);
    expect(b).toBeLessThanOrEqual(c);
    expect(c).toBeLessThanOrEqual(1);
  });

  it('compresses out-of-gamut color into sRGB bounds', () => {
    const mapped = applyPerceptualGamutMapToSrgb([1.24, 0.42, -0.08]);
    expect(mapped[0]).toBeGreaterThanOrEqual(0);
    expect(mapped[0]).toBeLessThanOrEqual(1);
    expect(mapped[1]).toBeGreaterThanOrEqual(0);
    expect(mapped[1]).toBeLessThanOrEqual(1);
    expect(mapped[2]).toBeGreaterThanOrEqual(0);
    expect(mapped[2]).toBeLessThanOrEqual(1);
  });

  it('preserves highlight hue ratio during roll-off', () => {
    const source: [number, number, number] = [1.08, 0.74, 0.5];
    const rolled = applyHighlightRolloffFilmicSoft(source);
    const srcRatio = source[1] / source[0];
    const rolledRatio = rolled[1] / rolled[0];
    expect(Math.abs(srcRatio - rolledRatio)).toBeLessThan(1e-4);
  });
});
