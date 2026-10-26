// @vitest-environment node
// Landmark structure gate (WCAG 1.3.1 Info and Relationships, 1.3.6 Identify
// Purpose; axe landmark-main-is-top-level / landmark-no-duplicate-main).
//
// The app shell (`App.jsx`) owns the single top-level `<main id="main-content">`
// landmark. Every view renders *inside* it, so a view that renders its own
// `<main>` produces two nested main landmarks — screen-reader landmark
// navigation then can't tell them apart. ProjectSettings already documents the
// rule ("A named <section> landmark (NOT another <main>)"); this gate enforces
// it repo-wide so the next view can't regress it.
//
// It also bans `role="tabpanel"` directly on a `<main>`: ARIA does not allow
// the `tabpanel` role to override `main` (axe aria-allowed-role).
//
// Run in node (pure fs, no DOM).

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The one component allowed to render the shell's main landmark.
const MAIN_LANDMARK_OWNER = 'components/App.jsx';

export function sourceFiles(dir) {
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

/**
 * MARK: nestedMainJsx
 * @description Finds `<main …>` openings in a source file, plus whether any
 *   same-tag `role="tabpanel"` misuse is present. Comments are stripped first
 *   so documentation that mentions the shell's `<main id="main-content">`
 *   (InfoTooltip, ProjectSettings) does not read as source.
 * @param {string} source
 * @returns {{line:number, tag:string}[]}
 */
export function nestedMainJsx(source) {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const found = [];
  for (const match of stripped.matchAll(/<main\b[^>]*>/g)) {
    found.push({ line: stripped.slice(0, match.index).split('\n').length, tag: match[0] });
  }
  return found;
}

describe('exactly one main landmark in shipped source (WCAG 1.3.1/1.3.6)', () => {
  it('only the app shell renders <main>', () => {
    const offenders = [];
    for (const file of sourceFiles(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file);
      for (const hit of nestedMainJsx(readFileSync(file, 'utf8'))) {
        if (rel === MAIN_LANDMARK_OWNER) continue;
        offenders.push(`${rel} line ${hit.line}: ${hit.tag}`);
      }
    }
    expect(
      offenders,
      'views must use a labelled <section>/<div>; the app shell owns the single top-level <main id="main-content">',
    ).toEqual([]);
  });

  it('never puts role="tabpanel" on a <main> (axe aria-allowed-role)', () => {
    const offenders = [];
    for (const file of sourceFiles(SRC_ROOT)) {
      for (const hit of nestedMainJsx(readFileSync(file, 'utf8'))) {
        if (/role="tabpanel"/.test(hit.tag)) {
          offenders.push(`${relative(SRC_ROOT, file)} line ${hit.line}: ${hit.tag}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('flags a nested <main> (negative control)', () => {
    expect(nestedMainJsx('<main className="x">a</main>')).toHaveLength(1);
    expect(nestedMainJsx('/* <main id="main-content"> */ <div />')).toHaveLength(0);
    expect(
      nestedMainJsx('<main role="tabpanel" aria-labelledby="t">').some((h) =>
        /role="tabpanel"/.test(h.tag),
      ),
    ).toBe(true);
  });
});
