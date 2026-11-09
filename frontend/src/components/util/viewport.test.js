// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import {
  isNarrowViewport,
  setNarrowViewportOverride,
  isGlassesViewport,
  setGlassesViewportOverride,
} from './viewport.js';
import {
  isNarrowViewport as compatIsNarrowViewport,
  setNarrowViewportOverride as compatSetOverride,
} from '../observability/monitorCompact.js';

/***
 * MARK: viewport util tests
 * @description Guards the canonical viewport helper: matchMedia detection,
 * fail-safe defaults when matchMedia is missing, the test override seam,
 * and parity with the backwards-compatible monitorCompact re-export.
 ***/
describe('viewport util', () => {
  afterEach(() => {
    setNarrowViewportOverride(null);
  });

  it('detects narrow and wide viewports via matchMedia', () => {
    const narrow = { matches: true };
    const wide = { matches: false };
    expect(isNarrowViewport({ matchMedia: () => narrow })).toBe(true);
    expect(isNarrowViewport({ matchMedia: () => wide })).toBe(false);
  });

  it('fails safe to false when matchMedia is unavailable', () => {
    expect(isNarrowViewport({})).toBe(false);
    expect(isNarrowViewport(undefined)).toBe(false);
  });

  it('test override wins over matchMedia until reset', () => {
    setNarrowViewportOverride(true);
    expect(isNarrowViewport({ matchMedia: () => ({ matches: false }) })).toBe(true);
    setNarrowViewportOverride(false);
    expect(isNarrowViewport({ matchMedia: () => ({ matches: true }) })).toBe(false);
  });

  it('narrow detection ignores the glasses override seam', () => {
    setGlassesViewportOverride(true);
    try {
      expect(isNarrowViewport({ matchMedia: () => ({ matches: false }) })).toBe(false);
    } finally {
      setGlassesViewportOverride(null);
    }
  });

  it('stays re-exported from monitorCompact for existing observability imports', () => {
    // Same live seam: an override set through either entry point is visible
    // through both, so the two import sites can never disagree.
    compatSetOverride(true);
    try {
      expect(isNarrowViewport({ matchMedia: () => ({ matches: false }) })).toBe(true);
      expect(compatIsNarrowViewport({ matchMedia: () => ({ matches: false }) })).toBe(true);
    } finally {
      compatSetOverride(null);
    }
    expect(isNarrowViewport({ matchMedia: () => ({ matches: false }) })).toBe(false);
  });
});

/***
 * MARK: glasses viewport tests
 * @description Guards the Meta Ray-Ban shape check: only a roughly square
 *   ~600x600 box qualifies, phone-narrow/tall and desktop viewports stay
 *   out, missing dimensions fail safe to false, and the override seam wins.
 ***/
describe('glasses viewport', () => {
  afterEach(() => {
    setGlassesViewportOverride(null);
  });

  it('accepts a square canvas around 600x600', () => {
    expect(isGlassesViewport({ innerWidth: 600, innerHeight: 600 })).toBe(true);
    expect(isGlassesViewport({ innerWidth: 560, innerHeight: 560 })).toBe(true);
    expect(isGlassesViewport({ innerWidth: 680, innerHeight: 680 })).toBe(true);
    expect(isGlassesViewport({ innerWidth: 620, innerHeight: 590 })).toBe(true);
  });

  it('rejects phone-narrow tall viewports even at 600px wide', () => {
    expect(isGlassesViewport({ innerWidth: 600, innerHeight: 900 })).toBe(false);
    expect(isGlassesViewport({ innerWidth: 390, innerHeight: 844 })).toBe(false);
    expect(isGlassesViewport({ innerWidth: 600, innerHeight: 700 })).toBe(false);
  });

  it('rejects desktop and tablet viewports', () => {
    expect(isGlassesViewport({ innerWidth: 1280, innerHeight: 800 })).toBe(false);
    expect(isGlassesViewport({ innerWidth: 1024, innerHeight: 768 })).toBe(false);
    expect(isGlassesViewport({ innerWidth: 500, innerHeight: 500 })).toBe(false);
    expect(isGlassesViewport({ innerWidth: 700, innerHeight: 700 })).toBe(false);
  });

  it('rejects skewed boxes inside the dimension range', () => {
    expect(isGlassesViewport({ innerWidth: 560, innerHeight: 680 })).toBe(false);
    expect(isGlassesViewport({ innerWidth: 680, innerHeight: 560 })).toBe(false);
  });

  it('fails safe to false when dimensions are unavailable', () => {
    expect(isGlassesViewport({})).toBe(false);
    expect(isGlassesViewport(undefined)).toBe(false);
    expect(isGlassesViewport({ innerWidth: 'wide', innerHeight: 600 })).toBe(false);
    expect(isGlassesViewport({ innerWidth: 0, innerHeight: 600 })).toBe(false);
  });

  it('test override wins over dimensions until reset', () => {
    setGlassesViewportOverride(true);
    expect(isGlassesViewport({ innerWidth: 1280, innerHeight: 800 })).toBe(true);
    setGlassesViewportOverride(false);
    expect(isGlassesViewport({ innerWidth: 600, innerHeight: 600 })).toBe(false);
  });

  it('glasses detection ignores the narrow override seam', () => {
    setNarrowViewportOverride(true);
    try {
      expect(isGlassesViewport({ innerWidth: 1280, innerHeight: 800 })).toBe(false);
    } finally {
      setNarrowViewportOverride(null);
    }
  });
});
