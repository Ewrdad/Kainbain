// @vitest-environment node
// Focus visibility / target-size floor gate (WCAG 2.5.5 Target Size Enhanced
// AAA, 2.5.8 Target Size Minimum AA; 2.4.7 Focus Visible).
//
// The contributor checklist already requires 44×44 CSS px on every interactive
// control (2.5.5 AAA). New `min-h-[32|36|40]px` utility classes on shipped
// source are the leading regression vector: a developer adding a dense chip
// or filter pill copies the pattern and silently drops below the AAA floor.
// This gate elevates the checklist item to a machine gate so a new
// sub-44px interactive control fails review before merge. Sites below 24px
// (failing even the AA 2.5.8 floor) are caught by targetSize.test.js and
// triaged as findings.
//
// Pre-existing dense controls (LogViewer severity chips, ActivityConsole
// filter chips, StageTagEditor tag chips) are covered by exemption #1 in
// `docs/accessibility/STATEMENT.md` (2.5.5: dense data controls hold the
// AA 24px minimum per 2.5.8, not 44px, to preserve information density).
// They are allowlisted below; any NEW site not on the list fails.
//
// Run in node (pure fs, no DOM).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listShippedSourceFiles } from './listShippedSourceFiles.js';

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Pre-existing sub-44px interactive controls covered by exemption #1
// (2.5.5 target size, dense data controls). Each entry is
// `relative/path.jsx:line-fragment` — the line fragment is a stable
// substring that identifies the specific site; if the site is refactored
// away the allowlist entry must be removed (the gate will tell you).
const TARGET_SIZE_EXEMPT_SITES = [
  'components/logs/LogViewer.jsx:min-h-[32px]',
  'components/workflow/ActivityConsole.jsx:min-h-[32px]',
  'components/workflow/StageTagEditor.jsx:min-h-[32px]',
];

// The three sizes the contributor checklist explicitly bans on interactive
// controls (see frontend/src/a11y/README.md §4). These are the regression
// vector: a developer copies `min-h-[32px]` from a dense chip and silently
// drops a primary control below the AAA 44px floor.
const BANNED_HEIGHT_CLASSES = ['min-h-[32px]', 'min-h-[36px]', 'min-h-[40px]'];

/**
 * MARK: sub44InteractiveHeights
 * @description Finds the checklist-banned `min-h-[32|36|40]px` utility classes
 *   on lines that also carry an interactive-role signal (button, role="button",
 *   onClick, cursor-pointer, <a, <input, <select, <textarea). Returns
 *   `line:className` descriptors for sites NOT on the exemption allowlist.
 *   Sites below 24px (failing even the AA 2.5.8 floor) are out of scope here
 *   — they are caught by targetSize.test.js and triaged as findings.
 * @param {string} source
 * @param {string} relPath - Relative path for allowlist matching.
 * @returns {string[]}
 *
 * Known limit (fail-open, documented): the check is line-based, so a banned
 * class with its interactive signal on a DIFFERENT line (multiline JSX
 * props) is missed. The canary axe + keyboard lanes are the backstop for
 * those sites — this gate catches the common single-line copy-paste case.
 */
export function sub44InteractiveHeights(source, relPath) {
  const found = [];
  const lines = source.split('\n');
  const interactiveSignals = [
    /<button\b/,
    /role="button"/,
    /onClick=/,
    /cursor-pointer/,
    /<a\s/,
    /<input\b/,
    /<select\b/,
    /<textarea\b/,
  ];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const banned of BANNED_HEIGHT_CLASSES) {
      if (!line.includes(banned)) continue;
      const isInteractive = interactiveSignals.some((re) => re.test(line));
      if (!isInteractive) continue;
      const descriptor = `line ${i + 1}: ${banned}`;
      const allowlisted = TARGET_SIZE_EXEMPT_SITES.some(
        (site) => site.startsWith(`${relPath}:`) && line.includes(site.split(':')[1]),
      );
      if (!allowlisted) {
        found.push(descriptor);
      }
    }
  }
  return found;
}

describe('no new sub-44px interactive controls (WCAG 2.5.5 AAA / 2.5.8 AA)', () => {
  it('every interactive min-h-[Npx] below 44px is on the exemption allowlist', () => {
    const offenders = [];
    for (const file of listShippedSourceFiles({ startingFolder: SRC_ROOT })) {
      const rel = relative(SRC_ROOT, file);
      for (const hit of sub44InteractiveHeights(readFileSync(file, 'utf8'), rel)) {
        offenders.push(`${rel} ${hit}`);
      }
    }
    expect(
      offenders,
      'interactive controls must be >= 44px tall (WCAG 2.5.5 AAA). ' +
        'Dense data controls may hold the 24px AA minimum (2.5.8) under exemption #1 — ' +
        'add the site to TARGET_SIZE_EXEMPT_SITES in focusVisibility.test.js with a rationale, ' +
        'or raise the height to 44px.',
    ).toEqual([]);
  });

  it('flags a new sub-44px button (negative control)', () => {
    const bad = '<button className="min-h-[32px] cursor-pointer">x</button>';
    expect(sub44InteractiveHeights(bad, 'components/New.jsx')).toHaveLength(1);
  });

  it('flags all three banned sizes (negative control)', () => {
    expect(sub44InteractiveHeights('<button className="min-h-[32px] cursor-pointer">x</button>', 'c/N.jsx')).toHaveLength(1);
    expect(sub44InteractiveHeights('<button className="min-h-[36px] cursor-pointer">x</button>', 'c/N.jsx')).toHaveLength(1);
    expect(sub44InteractiveHeights('<button className="min-h-[40px] cursor-pointer">x</button>', 'c/N.jsx')).toHaveLength(1);
  });

  it('allows 44px and above (negative control)', () => {
    const good = '<button className="min-h-[44px] cursor-pointer">x</button>';
    expect(sub44InteractiveHeights(good, 'components/New.jsx')).toHaveLength(0);
  });

  it('allows non-interactive sub-44px elements (negative control)', () => {
    const decorative = '<div className="min-h-[32px]">spacer</div>';
    expect(sub44InteractiveHeights(decorative, 'components/New.jsx')).toHaveLength(0);
  });

  it('allows allowlisted exemption sites (negative control)', () => {
    const exempt =
      '<button className="min-h-[32px] cursor-pointer">chip</button>';
    expect(
      sub44InteractiveHeights(exempt, 'components/logs/LogViewer.jsx'),
    ).toHaveLength(0);
  });
});
