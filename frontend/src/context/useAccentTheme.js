// Domain: context — per-project accent theming (CSS variables on :root).
// Re-tints the whole UI whenever the active project (or its accentColor) changes.
import { useEffect } from 'react';
import { accentTokens } from '../theme/accentTokens';
export function useAccentTheme({ projects }) {
  // Inject per-project custom accent color CSS variables onto root.
  // `--accent`/`--accent-on` are RGB triplets (for Tailwind opacity modifiers),
  // `--accent-glow` is a translucent variant, and `--accent-hex` is the raw hex
  // for SVG/`var()` consumers. Keys on the active project so switching projects
  // re-tints the whole UI automatically.
  useEffect(() => {
    const activeProj = projects.projects.find((p) => p.id === projects.activeProjectId);
    const tokens = accentTokens(activeProj?.accentColor);
    if (typeof document !== 'undefined' && document.documentElement) {
      const root = document.documentElement;
      root.style.setProperty('--accent', tokens.triplet);
      root.style.setProperty('--accent-on', tokens.accentOn);
      root.style.setProperty('--accent-glow', tokens.glow);
      root.style.setProperty('--accent-hex', tokens.hex);
    }
  }, [projects.activeProjectId, projects.projects]);
}
