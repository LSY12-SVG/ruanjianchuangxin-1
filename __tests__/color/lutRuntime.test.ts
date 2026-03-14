import {
  buildFilmicLut,
  buildIdentityLut,
  lutToStripPixels,
} from '../../src/colorEngine/lut/runtime';

describe('lut runtime helpers', () => {
  it('builds identity lut with expected size', () => {
    const lut = buildIdentityLut(8);
    expect(lut.size).toBe(8);
    expect(lut.data).toHaveLength(8 * 8 * 8 * 3);
  });

  it('builds filmic lut and strip pixels', () => {
    const lut = buildFilmicLut(8);
    const strip = lutToStripPixels(lut);
    expect(strip.width).toBe(64);
    expect(strip.height).toBe(8);
    expect(strip.bytesPerRow).toBe(256);
    expect(strip.pixels.length).toBe(64 * 8 * 4);
  });
});

