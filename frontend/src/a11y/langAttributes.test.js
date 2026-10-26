// @vitest-environment node
// Language attribute gate (WCAG 3.1.1 Language of Page, 3.1.2 Language of
// Parts).
//
// The app shell sets `<html lang="en">` in `frontend/index.html`, which
// covers the default language of every page. This gate verifies that:
// 1. The shell declaration exists (so screen readers pick the correct
//    speech synthesizer voice).
// 2. No view overrides `lang` on a wrapper element without a rationale
//    comment — a view that renders content in a different language must
//    declare it (3.1.2), but an accidental `lang` override on a wrapper
//    (e.g. copied from a template) silently switches the SR voice for that
//    subtree.
//
// Run in node (pure fs, no DOM).

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listShippedSourceFiles } from './listShippedSourceFiles.js';

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND_ROOT = dirname(SRC_ROOT);
const INDEX_HTML = join(FRONTEND_ROOT, 'index.html');

/**
 * MARK: langOverrides
 * @description Finds `lang=` attribute usages in JSX source that are NOT
 *   accompanied by a rationale comment on the same line or the line above.
 *   A rationale comment is any line or block comment mentioning `lang`,
 *   `WCAG`, `3.1.2`, `language`, or `i18n`.
 * @param {string} source
 * @returns {string[]}
 */
export function langOverrides(source) {
  const found = [];
  const lines = source.split('\n');
  const rationaleRe = /\/\/.*\b(lang|WCAG|3\.1\.2|language|i18n|locale)\b/i;
  const blockRationaleRe = /\/\*[^]*?\b(lang|WCAG|3\.1\.2|language|i18n|locale)\b[^]*?\*\//i;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // Match lang="..." or lang={'...'} in JSX, plus dynamic lang={identifier}
    // (an unquoted binding still switches the screen-reader voice and needs
    // the same rationale).
    for (const match of line.matchAll(/\blang=(?:\{?["'`][^"'`}]+|\{[A-Za-z_$][\w$]*\})/g)) {
      // Check for a rationale comment on this line or the previous line
      const prevLine = i > 0 ? lines[i - 1] : '';
      const hasRationale =
        rationaleRe.test(line) ||
        rationaleRe.test(prevLine) ||
        blockRationaleRe.test(line) ||
        blockRationaleRe.test(prevLine);
      if (!hasRationale) {
        found.push(`line ${i + 1}: ${match[0]}`);
      }
    }
  }
  return found;
}

describe('language attribute (WCAG 3.1.1 / 3.1.2)', () => {
  it('the app shell declares lang on <html>', () => {
    expect(existsSync(INDEX_HTML), 'frontend/index.html must exist').toBe(true);
    const html = readFileSync(INDEX_HTML, 'utf8');
    expect(
      /<html[^>]*\blang="[a-zA-Z-]+"/.test(html),
      'frontend/index.html must declare <html lang="..."> so screen readers pick the correct voice (WCAG 3.1.1)',
    ).toBe(true);
  });

  it('no view overrides lang without a rationale comment (WCAG 3.1.2)', () => {
    const offenders = [];
    for (const file of listShippedSourceFiles({ startingFolder: SRC_ROOT })) {
      const rel = relative(SRC_ROOT, file);
      for (const hit of langOverrides(readFileSync(file, 'utf8'))) {
        offenders.push(`${rel} ${hit}`);
      }
    }
    expect(
      offenders,
      'a lang= override on a view wrapper switches the screen-reader voice for that subtree. ' +
        'If the content is genuinely in another language, declare it with a rationale comment (WCAG 3.1.2); ' +
        'otherwise remove the override and let the shell lang="en" apply.',
    ).toEqual([]);
  });

  it('flags a lang override without a rationale (negative control)', () => {
    const bad = '<div lang="fr">Bonjour</div>';
    expect(langOverrides(bad)).toHaveLength(1);
  });

  it('allows a lang override with a rationale comment (negative control)', () => {
    const good = '// WCAG 3.1.2: quoted French source block\n<div lang="fr">Bonjour</div>';
    expect(langOverrides(good)).toHaveLength(0);
  });

  it('flags a dynamic lang={identifier} binding without a rationale (negative control)', () => {
    const bad = '<div lang={userLocale}>Bonjour</div>';
    expect(langOverrides(bad)).toHaveLength(1);
  });
});
