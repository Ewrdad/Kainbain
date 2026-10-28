/***
 * MARK: accentTokens
 * @description Pure, framework-free helpers for deriving the per-project accent
 * CSS custom-property values from a hex colour. Kept DOM-free so it is trivially
 * unit-testable in isolation (no React, no jsdom layout).
 *
 * The app's Tailwind `primary`/`on-primary` tokens are defined as
 * `rgb(var(--accent) / <alpha-value>)`, so `--accent`/`--accent-on` must be
 * stored as space-separated RGB triplets (NOT hex) for opacity modifiers like
 * `bg-primary/20` to compile to valid CSS. A companion `--accent-hex` var holds
 * the raw hex for SVG/`var()` consumers (e.g. BrandMark) that cannot read a
 * triplet.
 *
 * @example accentTokens('#7bdb85') => { hex, triplet, accentOn, glow }
 ***/

export const DEFAULT_ACCENT_HEX = '#7bdb85';

/***
 * MARK: ENHANCED_CONTRAST_MINIMUM
 * @description WCAG 1.4.6 Contrast (Enhanced, AAA) minimum ratio for text.
 * Every pair emitted by accentTextPair() meets or exceeds this.
 ***/
export const ENHANCED_CONTRAST_MINIMUM = 7;

/***
 * MARK: normalizeHex
 * @description Coerces a user-supplied colour into a canonical 6-digit lowercase
 * hex string. Accepts `#rgb` and `#rrggbb` (with or without the leading `#`).
 * Any other input falls back to the default emerald so the app never receives an
 * invalid CSS colour.
 * @param {*} input
 * @returns {string} 6-digit lowercase hex, e.g. '#7bdb85'
 ***/
export function normalizeHex(input) {
  if (typeof input !== 'string') return DEFAULT_ACCENT_HEX;
  let hex = input.trim();
  if (!hex.startsWith('#')) hex = `#${hex}`;
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toLowerCase();
  return DEFAULT_ACCENT_HEX;
}

/***
 * MARK: hexToRgb
 * @description Parses a hex string into 0-255 RGB channels.
 * @param {string} hex
 * @returns {{r: number, g: number, b: number}}
 ***/
export function hexToRgb(hex) {
  const h = normalizeHex(hex);
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

/***
 * MARK: relativeLuminance
 * @description WCAG 2.x relative luminance of an RGB colour (0..1).
 * @param {{r: number, g: number, b: number}} rgb
 * @returns {number}
 ***/
export function relativeLuminance({ r, g, b }) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/***
 * MARK: contrastRatio
 * @description WCAG contrast ratio between two relative luminances (1..21).
 * @param {number} l1
 * @param {number} l2
 * @returns {number}
 ***/
export function contrastRatio(l1, l2) {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/***
 * MARK: mixHexTowards
 * @description Linear-RGB mix of two hex colours. `t = 0` returns `hex`,
 * `t = 1` returns `targetHex`; hue is preserved because the mix moves along
 * the straight line between the two colours (no rebrand — only a lightness
 * shift towards black or white).
 * @param {string} hex
 * @param {string} targetHex
 * @param {number} t - Mix factor in [0, 1].
 * @returns {string} Canonical 6-digit hex.
 ***/
export function mixHexTowards(hex, targetHex, t) {
  const a = hexToRgb(hex);
  const b = hexToRgb(targetHex);
  const mix = (ca, cb) => Math.round(ca + (cb - ca) * Math.min(1, Math.max(0, t)));
  const r = mix(a.r, b.r);
  const g = mix(a.g, b.g);
  const bl = mix(a.b, b.b);
  const to2 = (c) => c.toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(bl)}`;
}

/***
 * MARK: contrastOfPair
 * @description WCAG contrast ratio between two hex colours (1..21).
 * @param {string} fgHex
 * @param {string} bgHex
 * @returns {number}
 ***/
export function contrastOfPair(fgHex, bgHex) {
  return contrastRatio(relativeLuminance(hexToRgb(fgHex)), relativeLuminance(hexToRgb(bgHex)));
}

/***
 * MARK: accentTextPair
 * @description Contrast-safe (WCAG 1.4.6, AAA ≥ 7:1) text-on-accent pair for a
 * project accent. Black or white text is preferred on the accent unchanged;
 * when neither reaches the minimum (mid-luminance accents — no foreground on
 * earth can, so the surface itself must move), the background is shifted the
 * smallest distance towards black or white that reaches it. The hue never
 * changes, only lightness, and already-conformant accents pass through
 * byte-identical.
 * @param {*} [input] - Hex colour (defaults to emerald).
 * @param {number} [minRatio] - Minimum contrast (default 7, AAA enhanced).
 * @returns {{background: string, foreground: string}} Canonical hexes with
 *   `contrastOfPair(foreground, background) >= minRatio` (guaranteed:
 *   t = 1 always yields 21:1).
 ***/
export function accentTextPair(input = DEFAULT_ACCENT_HEX, minRatio = ENHANCED_CONTRAST_MINIMUM) {
  const bg = normalizeHex(input);
  const L = relativeLuminance(hexToRgb(bg));
  const contrastWhite = contrastRatio(L, 1);
  const contrastBlack = contrastRatio(L, 0);
  if (Math.max(contrastWhite, contrastBlack) >= minRatio) {
    return { background: bg, foreground: contrastWhite >= contrastBlack ? '#ffffff' : '#000000' };
  }
  const shiftFor = (fgHex, targetHex) => {
    for (let t = 0.01; t <= 1.0001; t += 0.01) {
      const candidate = mixHexTowards(bg, targetHex, t);
      if (contrastOfPair(fgHex, candidate) >= minRatio) return { t, background: candidate };
    }
    return { t: 1, background: targetHex };
  };
  const dark = shiftFor('#ffffff', '#000000');
  const light = shiftFor('#000000', '#ffffff');
  if (dark.t < light.t) return { background: dark.background, foreground: '#ffffff' };
  if (light.t < dark.t) return { background: light.background, foreground: '#000000' };
  return contrastWhite >= contrastBlack
    ? { background: dark.background, foreground: '#ffffff' }
    : { background: light.background, foreground: '#000000' };
}

/***
 * MARK: accentTokens
 * @description Derives the CSS custom-property values for a project accent.
 * The emitted background/foreground pair always meets WCAG 1.4.6 (AAA ≥ 7:1)
 * via accentTextPair(): conformant accents (including the default emerald)
 * pass through unchanged; mid-luminance accents shift minimally in lightness
 * (hue preserved) so on-accent text stays readable at runtime.
 * @param {*} [input] - Hex colour (defaults to emerald).
 * @returns {{hex: string, triplet: string, accentOn: string, glow: string}}
 *   - hex: canonical 6-digit hex (for `--accent-hex` / SVG consumers)
 *   - triplet: `r g b` (for `--accent`)
 *   - accentOn: `r g b` of the chosen black/white text colour (for `--accent-on`)
 *   - glow: `r g b / 0.2` translucent variant (for `--accent-glow`)
 ***/
export function accentTokens(input = DEFAULT_ACCENT_HEX) {
  const { background, foreground } = accentTextPair(input);
  const { r, g, b } = hexToRgb(background);
  const on = hexToRgb(foreground);
  return {
    hex: background,
    triplet: `${r} ${g} ${b}`,
    accentOn: `${on.r} ${on.g} ${on.b}`,
    glow: `${r} ${g} ${b} / 0.2`,
  };
}
