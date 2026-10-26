// Light-theme error-text contrast gate (WCAG 1.4.6 Contrast Enhanced, 7:1).
//
// The dark theme carries error copy in the pastel `text-error` token
// (#ffb4ab, ~11:1 on near-black). That pastel falls to ~1.9:1 on the light
// theme's near-white surfaces, so `index.css` remaps `.text-error` under
// `[data-theme='light']` to a dark red (#991b1b, >= 7.5:1). This suite pins that
// remap: the rule must exist, and its hex must hold 7:1 on every light-theme surface.
//
// Run in node (pure logic + fs, no DOM).
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { relativeLuminance, hexToRgb, contrastRatio } from './accentTokens.js';

// Light-theme surfaces the error text can sit on (see index.css light block).
const LIGHT_BGS = ['#ffffff', '#f1f5f9', '#f8fafc'];

function ratio(fg, bg) {
  return contrastRatio(relativeLuminance(hexToRgb(fg)), relativeLuminance(hexToRgb(bg)));
}

function css() {
  // Strip comments: documentation ratios inside /* */ are not declarations.
  return readFileSync(new URL('../index.css', import.meta.url), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
}

describe('light-theme error text holds 7:1 (WCAG 1.4.6)', () => {
  it('remaps .text-error under [data-theme=light]', () => {
    const sheet = css();
    const match = sheet.match(/\[data-theme='light'\]\s*\.text-error\s*\{([^}]*)\}/);
    expect(match, 'light .text-error override must exist in index.css').not.toBeNull();
    const hexes = [...match[1].matchAll(/#[0-9a-fA-F]{6}/g)].map((h) => h[0]);
    expect(hexes.length).toBeGreaterThan(0);
    for (const bg of LIGHT_BGS) {
      for (const hex of hexes) {
        expect(
          ratio(hex, bg),
          `${hex} must hold 7:1 on light surface ${bg}`,
        ).toBeGreaterThanOrEqual(7);
      }
    }
  });
});

describe('light-theme muted text on card surfaces holds 7:1 (WCAG 1.4.6)', () => {
  it('remaps .text-text-muted under [data-theme=light] to hold 7:1 on container and subtle surfaces', () => {
    const sheet = css();
    const match = sheet.match(/\[data-theme='light'\]\s*\.text-text-muted[^{]*\{([^}]*)\}/);
    expect(match, 'light .text-text-muted override must exist in index.css').not.toBeNull();
    const hexes = [...match[1].matchAll(/#[0-9a-fA-F]{6}/g)].map((h) => h[0]);
    expect(hexes.length).toBeGreaterThan(0);
    // Card container surfaces where text-text-muted is displayed:
    // container background (#ffffff) and subtle card surface (#f8fafc).
    const cardSurfaces = ['#ffffff', '#f8fafc'];
    for (const bg of cardSurfaces) {
      for (const hex of hexes) {
        expect(
          ratio(hex, bg),
          `${hex} must hold 7:1 on card surface ${bg}`,
        ).toBeGreaterThanOrEqual(7);
      }
    }
  });
});

