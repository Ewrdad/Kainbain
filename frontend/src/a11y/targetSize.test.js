// @vitest-environment node
// Target-size heuristic scan (WCAG 2.5.5 Target Size Enhanced AAA,
// 2.5.8 Target Size Minimum AA).
//
// A heuristic companion to focusVisibility.test.js: that gate hard-fails on
// new `min-h-[Npx]` interactive controls below 44px. This suite widens the
// net to fixed-height Tailwind utilities (`h-6`, `h-7`, `h-8`) and
// `min-w-[Npx]` on interactive roles, emitting a grouped warning list for
// human triage rather than a hard failure. Rationale: fixed-height classes
// on interactive elements are sometimes legitimate (icon-only buttons
// inside a 44px padded parent), so the gate is advisory — it surfaces
// candidates, a human confirms or exempts.
//
// Run in node (pure fs, no DOM).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listShippedSourceFiles } from './listShippedSourceFiles.js';

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Tailwind fixed-height utilities that fall below 44px (24px = h-6, 28px = h-7, 32px = h-8).
const SMALL_HEIGHT_CLASSES = new Set(['h-6', 'h-7', 'h-8']);

const INTERACTIVE_SIGNALS = [
  /<button\b/,
  /role="button"/,
  /onClick=/,
  /cursor-pointer/,
  /<a\s/,
  /<input\b/,
  /<select\b/,
  /<textarea\b/,
];

/**
 * MARK: smallInteractiveTargets
 * @description Heuristic scan for fixed-height or min-width utility classes
 *   below 44px on lines carrying an interactive-role signal. Returns
 *   `{ file, line, className, snippet }` records grouped by file for human
 *   triage. This is a WARNING gate — it does not fail the build; it emits
 *   a list for review.
 * @param {string} source
 * @param {string} relPath
 * @returns {Array<{file:string, line:number, className:string, snippet:string}>}
 */
export function smallInteractiveTargets(source, relPath) {
  const found = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const isInteractive = INTERACTIVE_SIGNALS.some((re) => re.test(line));
    if (!isInteractive) continue;

    // Fixed height classes: h-6 (24px), h-7 (28px), h-8 (32px)
    for (const cls of SMALL_HEIGHT_CLASSES) {
      // Match the class as a whole word in className (not h-6 in h-60 etc.)
      const re = new RegExp(`\\b${cls}\\b`);
      if (re.test(line)) {
        found.push({
          file: relPath,
          line: i + 1,
          className: cls,
          snippet: line.trim().slice(0, 120),
        });
      }
    }

    // min-w-[Npx] below 44
    for (const match of line.matchAll(/min-w-\[(\d+(?:\.\d+)?)px\]/g)) {
      const px = parseFloat(match[1]);
      if (px >= 44) continue;
      found.push({
        file: relPath,
        line: i + 1,
        className: `min-w-[${match[1]}px]`,
        snippet: line.trim().slice(0, 120),
      });
    }
  }
  return found;
}

describe('target-size heuristic scan (WCAG 2.5.5 AAA / 2.5.8 AA — advisory)', () => {
  it('collects small interactive targets grouped by file for human triage', () => {
    const byFile = new Map();
    for (const file of listShippedSourceFiles({ startingFolder: SRC_ROOT })) {
      const rel = relative(SRC_ROOT, file);
      const hits = smallInteractiveTargets(readFileSync(file, 'utf8'), rel);
      if (hits.length > 0) byFile.set(rel, hits);
    }
    // Advisory gate BY DESIGN: this test never fails the build. It proves
    // the scanner ran to completion (the Map exists and every entry is an
    // array of records) and logs the candidates for human triage — confirm
    // 44px effective size (padding) or add to the exemption allowlist in
    // focusVisibility.test.js. If this gate ever needs to fail, convert a
    // triaged entry into a hard assertion in focusVisibility.test.js instead.
    expect(byFile instanceof Map).toBe(true);
    for (const hits of byFile.values()) {
      expect(Array.isArray(hits)).toBe(true);
    }
    if (byFile.size > 0) {
      const summary = Array.from(byFile.entries()).map(
        ([file, hits]) => `${file}: ${hits.length} candidate(s)`,
      );
      // eslint-disable-next-line no-console
      console.log(
        `[a11y target-size heuristic] ${byFile.size} file(s) with small interactive targets (advisory):\n` +
          summary.join('\n'),
      );
    }
  });

  it('flags a small button (negative control)', () => {
    const bad = '<button className="h-6 cursor-pointer">x</button>';
    expect(smallInteractiveTargets(bad, 'components/New.jsx')).toHaveLength(1);
  });

  it('flags a small min-w button (negative control)', () => {
    const bad = '<button className="min-w-[24px] cursor-pointer">x</button>';
    expect(smallInteractiveTargets(bad, 'components/New.jsx')).toHaveLength(1);
  });

  it('allows 44px+ and non-interactive elements (negative control)', () => {
    const good = '<button className="h-12 cursor-pointer">x</button>';
    expect(smallInteractiveTargets(good, 'components/New.jsx')).toHaveLength(0);
    const decorative = '<div className="h-6">spacer</div>';
    expect(smallInteractiveTargets(decorative, 'components/New.jsx')).toHaveLength(0);
  });
});
