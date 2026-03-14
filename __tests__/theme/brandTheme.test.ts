import {BRAND_THEME_TOKENS, PAPER_THEME} from '../../src/theme/brandTheme';

describe('brand theme tokens', () => {
  it('has complete core palette', () => {
    expect(BRAND_THEME_TOKENS.palette.sunset).toBeTruthy();
    expect(BRAND_THEME_TOKENS.palette.merlot).toBeTruthy();
    expect(BRAND_THEME_TOKENS.surface.card).toContain('#');
  });

  it('maps primary color to paper theme', () => {
    expect(PAPER_THEME.colors.primary).toBe(BRAND_THEME_TOKENS.palette.sunset);
  });
});
