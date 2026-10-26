// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Decorative icon-font gate (WCAG 1.1.1 Non-text Content, 4.1.2 Name, Role,
// Value).
//
// Material Symbols render as text ligatures (`navigate_before`, `close`, …).
// Without `aria-hidden="true"` an assistive technology walks the ligature as
// button/dialog content: inside an `aria-labelled` control the label still
// wins, but anywhere else the glyph name leaks into the accessible name (or
// is announced as gibberish), and any future refactor that drops the parent
// label silently exposes it. Every `material-symbols` span is decorative —
// its labelled parent (or adjacent visible text) carries the meaning — so
// each one must hide itself from AT.
//
// This suite scans the shipped component source (not the rendered tree) so a
// newly added icon without `aria-hidden` fails the gate even when the parent
// label happens to mask it today.
//
// Run in node (pure fs, no DOM).
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      out.push(...sourceFiles(full));
    } else if (
      /\.(jsx|js)$/.test(entry) &&
      !/\.test\.(jsx|js)$/.test(entry) &&
      !/\.stories\.(jsx|js)$/.test(entry)
    ) {
      out.push(full);
    }
  }
  return out;
}

function spansMissingAriaHidden(source) {
  const missing = [];
  for (const match of source.matchAll(/<span\b([^>]*)>/g)) {
    const attrs = match[1];
    if (!attrs.includes('material-symbols')) continue;
    if (!attrs.includes('aria-hidden')) {
      const line = source.slice(0, match.index).split('\n').length;
      missing.push(`line ${line}: <span${attrs}>`);
    }
  }
  return missing;
}

describe('decorative Material Symbols are hidden from AT (WCAG 1.1.1/4.1.2)', () => {
  it('every material-symbols span carries aria-hidden', () => {
    const offenders = [];
    for (const file of sourceFiles(SRC_ROOT)) {
      const missing = spansMissingAriaHidden(readFileSync(file, 'utf8'));
      for (const span of missing) offenders.push(`${file} ${span}`);
    }
    expect(offenders, 'decorative icon spans must set aria-hidden="true"').toEqual([]);
  });

  it('flags a ligature span without aria-hidden (negative control)', () => {
    const bad =
      '<button aria-label="Close"><span className="material-symbols-outlined">close</span></button>';
    expect(spansMissingAriaHidden(bad)).toHaveLength(1);
    const good =
      '<button aria-label="Close"><span className="material-symbols-outlined" aria-hidden="true">close</span></button>';
    expect(spansMissingAriaHidden(good)).toHaveLength(0);
  });
});
