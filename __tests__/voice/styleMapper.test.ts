import {mapStyleToVector, matchStyleFromTranscript} from '../../src/voice/styleMapper';

describe('styleMapper', () => {
  it('maps style with strength', () => {
    const vector = mapStyleToVector('cinematic_cool', 0.5);
    expect(vector.temperature).toBeLessThan(0);
    expect(vector.contrast).toBeGreaterThan(0);
    expect(vector.exposure).toBeLessThanOrEqual(0);
    expect(vector.highlights).toBeLessThan(0);
    expect(vector.curve_master).toBeGreaterThan(0);
  });

  it('matches portrait style transcript', () => {
    const style = matchStyleFromTranscript('我想要更通透一点的人像风格');
    expect(style).toBe('portrait_clean');
  });

  it('returns null when transcript has no style clue', () => {
    const style = matchStyleFromTranscript('随便调一下');
    expect(style).toBeNull();
  });
});
