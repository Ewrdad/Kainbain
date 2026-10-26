// @vitest-environment node
// Observability cockpit contrast gate (WCAG 1.4.6 Contrast Enhanced, 7:1).
//
// The observability cockpit is dark-anchored in every shipped theme
// (`ObservabilityDashboard` → `#0b0f17`, `WidgetContainer`'s card →
// `bg-[#0a0e1a]/95`), so its text pairs are not covered by the surface-theme
// gates (`containerContrast` / `lightThemeContrast`). This suite recomputes
// every pair the cockpit introduces with the same relative-luminance math the
// theme helpers use, at several points along each `KpiCard` gradient, so a
// palette or class regression fails here instead of shipping.
//
// It pins two things:
// 1. The measured pairs (>= 7:1 normal text). The 2026-09-20 register fixed
//    indigo-400 in the KPI ribbon; the ribbon→atom split reintroduced it in
//    `KpiCard`, and rose-400 was new. Both are asserted below.
// 2. The compliant class strings in `KpiCard` source, so a silent revert to
//    the failing shades fails loudly.
//
// Run in node (pure logic + fs, no DOM).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { contrastOfPair, mixHexTowards } from './accentTokens.js';

// Dashboard root → WidgetContainer card (`bg-[#0a0e1a]/95` over the root).
const DASHBOARD_BG = '#0b0f17';
const WIDGET_BODY = mixHexTowards(DASHBOARD_BG, '#0a0e1a', 0.95);

// Dark surfaces where the cockpit's `text-slate-400` muted text renders.
// `#0f172a` (the MobileMonitorView header) is handled separately below: it is
// the one cockpit surface where slate-400 measures 6.96:1, so that site must
// step up to slate-300.
const DARK_COCKPIT_SURFACES = [DASHBOARD_BG, WIDGET_BODY, '#070a12', '#090d16'];

// Tailwind `bg-gradient-to-b from-<from>/<fromAlpha> to-<to>/<toAlpha>`:
// each stop is the from/to colour composited over the element's backdrop.
// Interpolating both the colour and its alpha in sRGB mirrors what the
// browser paints closely enough for a contrast floor (we sample the whole
// range, so the exact midpoint is not load-bearing).
function gradientStop(t, fromHex, fromAlpha, toHex, toAlpha, body) {
  const channel = (hex, i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16);
  const blended =
    '#' +
    [0, 2, 4]
      .map((i) =>
        Math.round(channel(fromHex, i) + (channel(toHex, i) - channel(fromHex, i)) * t)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('');
  return mixHexTowards(body, blended, fromAlpha + (toAlpha - fromAlpha) * t);
}

const GRADIENT_SAMPLES = [0, 0.25, 0.5, 0.75, 1];

// [accent, fromColor, value/label hex, unit hex] — the KpiCard accent map.
const KPI_ACCENTS = [
  ['emerald', '#022c22', '#34d399', '#6ee7b7'],
  ['rose', '#4c0519', '#fda4af', '#fecdd3'],
  ['cyan', '#083344', '#22d3ee', '#67e8f9'],
  ['amber', '#451a03', '#fbbf24', '#fcd34d'],
  ['indigo', '#1e1b4b', '#a5b4fc', '#c7d2fe'],
];

describe('KpiCard accent text holds 7:1 on every gradient point (WCAG 1.4.6)', () => {
  it.each(KPI_ACCENTS)(
    '%s card label/value/unit/sub hold >= 7:1',
    (accent, fromHex, valueHex, unitHex) => {
      for (const t of GRADIENT_SAMPLES) {
        const bg = gradientStop(t, fromHex, 0.4, '#0f172a', 0.9, WIDGET_BODY);
        expect(
          contrastOfPair(valueHex, bg),
          `${accent} value ${valueHex} on ${bg} (t=${t})`,
        ).toBeGreaterThanOrEqual(7);
        // The unit line is painted at 80% alpha, so measure the composite.
        const unitComposite = mixHexTowards(bg, unitHex, 0.8);
        expect(
          contrastOfPair(unitComposite, bg),
          `${accent} unit ${unitHex}/80 on ${bg} (t=${t})`,
        ).toBeGreaterThanOrEqual(7);
        // The `sub` line is `text-slate-300` (#cbd5e1).
        expect(
          contrastOfPair('#cbd5e1', bg),
          `${accent} sub slate-300 on ${bg} (t=${t})`,
        ).toBeGreaterThanOrEqual(7);
      }
    },
  );

  it('rejects the shades the atom split regressed to (mutation proof)', () => {
    // rose-400 and indigo-400 are the exact values the register/ribbon fix
    // removed; on their own card gradients they measure below 7:1.
    const roseBg = gradientStop(1, '#4c0519', 0.4, '#0f172a', 0.9, WIDGET_BODY);
    expect(contrastOfPair('#fb7185', roseBg)).toBeLessThan(7);
    const indigoBg = gradientStop(0.5, '#1e1b4b', 0.4, '#0f172a', 0.9, WIDGET_BODY);
    expect(contrastOfPair('#818cf8', indigoBg)).toBeLessThan(7);
    // rose-300/80 (the old dimmed unit) also failed.
    const roseTop = gradientStop(0, '#4c0519', 0.4, '#0f172a', 0.9, WIDGET_BODY);
    expect(contrastOfPair(mixHexTowards(roseTop, '#fda4af', 0.8), roseTop)).toBeLessThan(7);
  });
});

describe('cockpit muted text holds 7:1 on every dark surface (WCAG 1.4.6)', () => {
  it.each(DARK_COCKPIT_SURFACES)('text-slate-400 holds >= 7:1 on %s', (bg) => {
    expect(contrastOfPair('#94a3b8', bg)).toBeGreaterThanOrEqual(7);
  });

  it('the retired shades fail even the AA floor (mutation proof)', () => {
    expect(contrastOfPair('#64748b', WIDGET_BODY)).toBeLessThan(4.5);
    expect(contrastOfPair('#475569', WIDGET_BODY)).toBeLessThan(4.5);
  });

  it('MobileMonitorView idle text uses slate-300 on the #0f172a header', () => {
    // #0f172a is the one cockpit surface where slate-400 measures 6.96:1.
    expect(contrastOfPair('#94a3b8', '#0f172a')).toBeLessThan(7);
    expect(contrastOfPair('#cbd5e1', '#0f172a')).toBeGreaterThanOrEqual(7);
  });
});

describe('KpiCard source keeps the compliant accent classes (revert lock)', () => {
  const source = readFileSync(
    new URL('../components/observability/widgets/atoms/KpiCard.jsx', import.meta.url),
    'utf8',
  );

  it('uses rose-300 / rose-200 and indigo-300 / indigo-200 for the failing accents', () => {
    expect(source).toContain("label: 'text-rose-300'");
    expect(source).toContain("unit: 'text-[10px] font-mono font-bold text-rose-200/80'");
    expect(source).toContain("label: 'text-indigo-300'");
    expect(source).toContain("unit: 'text-[10px] font-mono text-indigo-200/80'");
  });

  it('no longer ships the retiring rose-400 / indigo-400 shades', () => {
    expect(source).not.toContain('text-rose-400');
    expect(source).not.toContain('text-indigo-400');
  });

  it('renders the sub line in slate-300 (slate-400 fails mid-gradient)', () => {
    expect(source).toContain('text-[9px] text-slate-300 truncate');
  });
});
