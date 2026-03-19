import {BRAND_THEME_TOKENS, PAPER_THEME} from '../../src/theme/brandTheme';
import {VISION_THEME} from '../../src/theme/visionTheme';

describe('brand theme tokens', () => {
  it('has complete core palette', () => {
    expect(BRAND_THEME_TOKENS.background.primary).toBe('#0B1020');
    expect(BRAND_THEME_TOKENS.accent.aiBlue).toBe('#4DA3FF');
    expect(BRAND_THEME_TOKENS.warm.glow).toBe('#FFC58F');
  });

  it('maps primary color to paper theme', () => {
    expect(PAPER_THEME.colors.primary).toBe(BRAND_THEME_TOKENS.accent.aiBlue);
  });

  it('exposes saturated gradient tokens', () => {
    expect(VISION_THEME.gradients.page).toHaveLength(3);
    expect(VISION_THEME.gradients.hero).toHaveLength(3);
    expect(VISION_THEME.gradients.cta).toHaveLength(3);
    expect(VISION_THEME.background.secondary).toBe('#12192B');
  });
});
