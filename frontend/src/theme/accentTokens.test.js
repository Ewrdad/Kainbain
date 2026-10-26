// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  accentTokens,
  accentTextPair,
  mixHexTowards,
  contrastOfPair,
  normalizeHex,
  hexToRgb,
  relativeLuminance,
  contrastRatio,
  ENHANCED_CONTRAST_MINIMUM,
  DEFAULT_ACCENT_HEX,
} from './accentTokens';

describe('normalizeHex', () => {
  it('passes through a canonical 6-digit hex', () => {
    expect(normalizeHex('#7bdb85')).toBe('#7bdb85');
  });

  it('expands 3-digit hex by doubling each nibble', () => {
    expect(normalizeHex('#fff')).toBe('#ffffff');
    expect(normalizeHex('#38b')).toBe('#3388bb');
  });

  it('accepts hex without a leading hash', () => {
    expect(normalizeHex('7bdb85')).toBe('#7bdb85');
  });

  it('lowercases uppercase hex', () => {
    expect(normalizeHex('#7BDB85')).toBe('#7bdb85');
  });

  it('falls back to the default on invalid input', () => {
    expect(normalizeHex('not-a-color')).toBe(DEFAULT_ACCENT_HEX);
    expect(normalizeHex('#12345')).toBe(DEFAULT_ACCENT_HEX);
    expect(normalizeHex(null)).toBe(DEFAULT_ACCENT_HEX);
    expect(normalizeHex(undefined)).toBe(DEFAULT_ACCENT_HEX);
    expect(normalizeHex(123)).toBe(DEFAULT_ACCENT_HEX);
  });
});

describe('hexToRgb', () => {
  it('parses channels', () => {
    expect(hexToRgb('#7bdb85')).toEqual({ r: 123, g: 219, b: 133 });
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
  });
});

describe('relativeLuminance & contrastRatio', () => {
  it('computes known WCAG values', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBe(1);
    // Black vs white = 21:1
    expect(contrastRatio(1, 0)).toBeCloseTo(21, 5);
    // White vs white = 1:1
    expect(contrastRatio(1, 1)).toBeCloseTo(1, 5);
  });
});

describe('accentTokens', () => {
  it('returns the canonical hex, triplet, accentOn and glow', () => {
    const t = accentTokens('#7bdb85');
    expect(t.hex).toBe('#7bdb85');
    expect(t.triplet).toBe('123 219 133');
    expect(t.glow).toBe('123 219 133 / 0.2');
    expect(t.accentOn).toMatch(/^\d+ \d+ \d+$/);
  });

  it('picks black text-on for a light accent (emerald)', () => {
    const t = accentTokens('#7bdb85');
    expect(t.accentOn).toBe('0 0 0');
  });

  it('picks white text-on for a dark accent', () => {
    const t = accentTokens('#003911');
    expect(t.accentOn).toBe('255 255 255');
  });

  it('picks black text-on for white', () => {
    expect(accentTokens('#ffffff').accentOn).toBe('0 0 0');
  });

  it('picks white text-on for black', () => {
    expect(accentTokens('#000000').accentOn).toBe('255 255 255');
  });

  it('defaults to emerald when input is invalid', () => {
    const t = accentTokens('garbage');
    expect(t.hex).toBe(DEFAULT_ACCENT_HEX);
    expect(t.triplet).toBe('123 219 133');
  });

  it('expands 3-digit input', () => {
    const t = accentTokens('#38b');
    // #3388bb only reaches 5.4:1 with any foreground, so the AAA contract
    // lightens it (hue preserved) to the nearest conformant tone.
    expect(t.hex).toBe('#589dc7');
    expect(t.triplet).toBe('88 157 199');
  });

  it('passes conformant accents through byte-identical', () => {
    // Default emerald already holds 12.3:1 with black text.
    const t = accentTokens('#7bdb85');
    expect(t.hex).toBe('#7bdb85');
    expect(t.accentOn).toBe('0 0 0');
    // Bright sky blue already holds 9.8:1 with black text.
    expect(accentTokens('#38bdf8').hex).toBe('#38bdf8');
  });
});

describe('accentTextPair (WCAG 1.4.6 AAA contrast contract)', () => {
  // Light, dark, mid-luminance, product palette, and pure-channel accents:
  // if any of these regress below 7:1, every text-on-accent surface breaks.
  const SWEEP = [
    '#ffffff',
    '#000000',
    '#7bdb85',
    '#38bdf8',
    '#003911',
    '#3388bb',
    '#808080',
    '#808000',
    '#008080',
    '#800080',
    '#ffd54f',
    '#ff8383',
    '#9acbff',
    '#ffb77f',
    '#ffb4ab',
    '#ff0000',
    '#00ff00',
    '#0000ff',
    '#ffff00',
    '#ff00ff',
    '#00ffff',
    '#c0c0c0',
    '#123456',
    '#abcdef',
    '#777777',
    '#999999',
  ];

  it.each(SWEEP)('holds >= 7:1 for accent %s', (accent) => {
    const pair = accentTextPair(accent);
    expect(contrastOfPair(pair.foreground, pair.background)).toBeGreaterThanOrEqual(
      ENHANCED_CONTRAST_MINIMUM,
    );
  });

  it('uses only black or white text (no tinted foregrounds)', () => {
    for (const accent of SWEEP) {
      expect(['#000000', '#ffffff']).toContain(accentTextPair(accent).foreground);
    }
  });

  it('is a fixed point: the emitted background needs no further shift', () => {
    for (const accent of SWEEP) {
      const once = accentTextPair(accent);
      expect(accentTextPair(once.background)).toEqual(once);
    }
  });

  it('leaves the default emerald accent untouched', () => {
    expect(accentTextPair('#7bdb85')).toEqual({
      background: '#7bdb85',
      foreground: '#000000',
    });
  });

  it('falls back to the default on invalid input', () => {
    expect(accentTextPair('garbage')).toEqual(accentTextPair(DEFAULT_ACCENT_HEX));
  });

  it('mixHexTowards interpolates endpoints exactly', () => {
    expect(mixHexTowards('#3388bb', '#ffffff', 0)).toBe('#3388bb');
    expect(mixHexTowards('#3388bb', '#ffffff', 1)).toBe('#ffffff');
    expect(mixHexTowards('#3388bb', '#000000', 1)).toBe('#000000');
  });
});
