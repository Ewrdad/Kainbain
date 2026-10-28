// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { isNarrowViewport, setNarrowViewportOverride } from './viewport.js';
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
