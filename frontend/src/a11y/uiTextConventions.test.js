// @vitest-environment node
// Source-level UI-text conventions (WCAG 3.1.1 / 4.1.2, and WCAG 1.4.6 shade
// discipline). Two classes of shipped-code regression that unit rendering
// cannot catch on their own are banned here, at the source:
//
// 1. Literal all-caps UI strings. Some screen readers spell all-caps words
//    letter-by-letter (VoiceOver's "spell out capital words" behaviour), so
//    `DASHBOARD CUSTOMIZATION MODE ACTIVE` becomes an alphabet recital.
//    Shipped copy must be written in normal case and uppercased visually with
//    the `uppercase` CSS utility — pixel-identical, announcement-correct.
//    The 2026-09-20 register (S1) claimed this sweep; several sites had
//    regressed or were never converted, so the rule now has a machine gate.
// 2. Low-contrast muted shades on the observability dark surfaces. The
//    observability cockpit is dark-anchored in every theme (`#0b0f17` /
//    `#0a0e1a` / `#0f172a` …), where `text-slate-500` (3.75-4.23:1) and
//    `text-slate-600` (2.36-2.66:1) fail WCAG 1.4.6 AAA (7:1) — and slate-600
//    fails even the AA 4.5:1 floor. `text-slate-400` holds >= 7:1 on every one
//    of those surfaces, so the ban is precise.
//
// Both checks scan the shipped component source, not the rendered tree, so a
// new string/site fails the gate even when no test happens to render it. Each
// check carries a negative control proving the matcher is live.
//
// Run in node (pure fs, no DOM).

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Bracketed console/log level tags (`[AGENT]`, `[CI/CMD]`, …) are a fixed
// vocabulary that reads correctly when spelled; the brand is a proper noun.
const ALL_CAPS_ALLOWLIST = new Set(['KAINBAIN']);

/** @returns {string[]} Shipped .jsx/.js component files (no tests/stories). */
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
 * MARK: isAllCapsUiString
 * @description Whether a UI string is literal all-caps per the WCAG 3.1.1
 *   announcement rule: a single uppercase word of 4+ letters, or two or more
 *   uppercase words. Short acronyms (LLM, RAM, ID, API — <= 3 letters) are
 *   read as letters by screen readers and are not violations. Bracketed log
 *   tags and the brand wordmark are allowlisted.
 * @example isAllCapsUiString('DASHBOARD CUSTOMIZATION MODE ACTIVE') => true
 * @example isAllCapsUiString('FAILED') => true
 * @example isAllCapsUiString('LLM') => false
 * @example isAllCapsUiString('[AGENT]') => false
 * @param {string} value
 * @returns {boolean}
 */
export function isAllCapsUiString(value) {
  const text = String(value ?? '').trim();
  if (!text || ALL_CAPS_ALLOWLIST.has(text)) return false;
  if (/^\[[A-Z0-9/]+\]$/.test(text)) return false;
  const words = text.match(/[A-Za-z][A-Za-z'-]*/g) || [];
  if (words.length === 0) return false;
  if (!words.every((word) => word === word.toUpperCase())) return false;
  if (words.length >= 2) return true;
  return words.some((word) => word.length >= 4);
}

/**
 * MARK: allCapsUiStrings
 * @description Finds literal all-caps UI strings in a source file: JSX text
 *   nodes and the user-visible string attributes `label`, `title`, and
 *   `placeholder` (the KPI labels are passed as props, not text nodes).
 * @param {string} source
 * @returns {string[]} `line:kind:value` descriptors.
 */
export function allCapsUiStrings(source) {
  const found = [];
  const lineOf = (index) => source.slice(0, index).split('\n').length;
  for (const match of source.matchAll(/>([^<>{}]+)</g)) {
    const value = match[1].trim();
    if (isAllCapsUiString(value)) found.push(`line ${lineOf(match.index)}: text ${value}`);
  }
  for (const match of source.matchAll(/\b(label|title|placeholder)="([^"]*)"/g)) {
    const value = match[2].trim();
    if (isAllCapsUiString(value)) {
      found.push(`line ${lineOf(match.index)}: ${match[1]}=${value}`);
    }
  }
  return found;
}

// Dark observability surfaces the cockpit renders on (see
// ObservabilityDashboard/WidgetContainer/observability widgets).
const DARK_OBSERVABILITY_SURFACES = ['#0b0f17', '#0a0e1a', '#0f172a', '#070a12', '#090d16'];

/** MARK: bannedLowContrastShades — WCAG 1.4.6 failures on the dark cockpit. */
export function bannedLowContrastShades(source) {
  const found = [];
  for (const match of source.matchAll(/text-slate-(500|600)\b/g)) {
    const line = source.slice(0, match.index).split('\n').length;
    found.push(`line ${line}: ${match[0]}`);
  }
  return found;
}

describe('no literal all-caps UI strings (WCAG 3.1.1 / 4.1.2)', () => {
  it('every shipped component writes copy in normal case (CSS uppercases it)', () => {
    const offenders = [];
    for (const file of sourceFiles(SRC_ROOT)) {
      for (const hit of allCapsUiStrings(readFileSync(file, 'utf8'))) {
        offenders.push(`${relative(SRC_ROOT, file)} ${hit}`);
      }
    }
    expect(
      offenders,
      'write UI copy in normal case and add the `uppercase` class — literal all-caps is spelled out by some screen readers',
    ).toEqual([]);
  });

  it('accepts normal case, short acronyms, and bracketed log tags (negative control)', () => {
    expect(isAllCapsUiString('Dashboard customization mode active')).toBe(false);
    expect(isAllCapsUiString('LLM')).toBe(false);
    expect(isAllCapsUiString('[AGENT]')).toBe(false);
    expect(isAllCapsUiString('KAINBAIN')).toBe(false);
    expect(isAllCapsUiString('DASHBOARD CUSTOMIZATION MODE ACTIVE')).toBe(true);
    expect(isAllCapsUiString('FAILED')).toBe(true);
    expect(isAllCapsUiString('STREAMING LIVE')).toBe(true);
    // The matcher is live end-to-end on the two shapes it scans.
    expect(allCapsUiStrings('<span>PIPELINE DISTRIBUTION</span>')).toHaveLength(1);
    expect(allCapsUiStrings('<KpiCard label="✓ SUCCESSES" />')).toHaveLength(1);
    expect(allCapsUiStrings('<KpiCard label="✓ Successes" />')).toHaveLength(0);
  });
});

describe('observability muted text holds 7:1 on the dark cockpit (WCAG 1.4.6)', () => {
  it('never uses text-slate-500/600 under src/components/observability', () => {
    const root = join(SRC_ROOT, 'components', 'observability');
    const offenders = [];
    for (const file of sourceFiles(root)) {
      for (const hit of bannedLowContrastShades(readFileSync(file, 'utf8'))) {
        offenders.push(`${relative(SRC_ROOT, file)} ${hit}`);
      }
    }
    expect(
      offenders,
      `text-slate-500 (3.75-4.23:1) and text-slate-600 (2.36-2.66:1) fail 7:1 on ${DARK_OBSERVABILITY_SURFACES.join(', ')} — use text-slate-400 (>= 7.0:1) or lighter`,
    ).toEqual([]);
  });

  it('flags both banned shades (negative control)', () => {
    expect(bannedLowContrastShades('<p className="text-slate-500">x</p>')).toHaveLength(1);
    expect(bannedLowContrastShades('<p className="text-slate-600">x</p>')).toHaveLength(1);
    expect(bannedLowContrastShades('<p className="text-slate-400">x</p>')).toHaveLength(0);
  });
});
