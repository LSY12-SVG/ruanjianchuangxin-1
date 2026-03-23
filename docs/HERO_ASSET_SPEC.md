# Hero Asset Spec (Stage 2.1)

## Goal
- Keep the four pages visually continuous while retaining page identity.
- Use richer same-family gradients with soft geometry instead of hard split blocks.

## Asset Matrix
- Aspect ratio: `2.5:1`
- Sizes:
  - `1x`: `600x240`
  - `2x`: `1200x480`
  - `3x`: `1800x720`
- Formats:
  - Primary: `webp`
  - Fallback: `jpg`

## Naming
- Create: `hero-create(.webp|.jpg)`, `hero-create@2x`, `hero-create@3x`
- Model: `hero-model(.webp|.jpg)`, `hero-model@2x`, `hero-model@3x`
- Agent: `hero-agent(.webp|.jpg)`, `hero-agent@2x`, `hero-agent@3x`
- Community: `hero-community(.webp|.jpg)`, `hero-community@2x`, `hero-community@3x`

## Runtime Mapping
- Android prefers `webp`.
- iOS and default targets use `jpg` as fallback.
- The exports in `src/assets/design/index.ts` keep the same symbol names.

## Visual Rules
- Shared base language: warm editorial gradient + low-contrast grid + subtle noise.
- Differences are local only (shape placement and accent shift), not full style forks.
- Keep bottom-center reading zone clean for `PageHero` title/subtitle.
