import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { KpiCard } from './KpiCard';

/***
 * MARK: KpiCard tests
 * @description Pins the KPI-atom contract: the label is shipped in normal
 *   case and uppercased visually (WCAG 3.1.1 — some screen readers spell
 *   all-caps source text), and the rose/indigo accents use the shades that
 *   hold 7:1 on the card gradients (WCAG 1.4.6; see
 *   `src/theme/observabilityContrast.test.js` for the measured ratios).
 ***/

describe('KpiCard', () => {
  it('renders the value, unit, sub line, and icon', () => {
    render(
      <KpiCard
        label="✓ Successes"
        value={7}
        unit="(87.5%)"
        sub="Completed tasks"
        icon="🏆"
        accent="emerald"
        testId="kpi-successes"
      />,
    );

    const card = screen.getByTestId('kpi-successes');
    expect(card).toHaveTextContent('✓ Successes');
    expect(card).toHaveTextContent('7');
    expect(card).toHaveTextContent('(87.5%)');
    expect(card).toHaveTextContent('Completed tasks');
    expect(card).toHaveTextContent('🏆');
  });

  it('uppercases the label visually while keeping normal-case source (WCAG 3.1.1)', () => {
    render(<KpiCard label="✓ Successes" value={1} testId="kpi-x" />);

    const label = screen.getByText('✓ Successes');
    expect(label.className).toContain('uppercase');
    // The DOM text is normal case; CSS does the shouting.
    expect(label.textContent).toBe('✓ Successes');
  });

  it('renders a custom body when children replace value/unit/sub', () => {
    render(
      <KpiCard label="⚙️ Active engine" accent="indigo" testId="kpi-pipeline">
        <span>Build</span>
      </KpiCard>,
    );

    const card = screen.getByTestId('kpi-pipeline');
    expect(card).toHaveTextContent('Build');
    expect(card).toHaveTextContent('⚙️ Active engine');
  });

  it.each([
    ['rose', 'text-rose-300', 'text-rose-200/80'],
    ['indigo', 'text-indigo-300', 'text-indigo-200/80'],
    ['emerald', 'text-emerald-400', 'text-emerald-300/80'],
    ['cyan', 'text-cyan-400', 'text-cyan-300/80'],
    ['amber', 'text-amber-400', 'text-amber-300/80'],
  ])('applies the 7:1-compliant %s accent classes', (accent, labelClass, unitClass) => {
    render(<KpiCard label="Metric" value={1} unit="u" accent={accent} testId="kpi-x" />);

    const card = screen.getByTestId('kpi-x');
    const label = screen.getByText('Metric');
    const unit = screen.getByText('u');
    expect(label.className).toContain(labelClass);
    expect(unit.className).toContain(unitClass);
    expect(card.className).toContain(`from-${accent}-950/40`);
  });

  it('falls back to the emerald accent for an unknown accent', () => {
    render(<KpiCard label="Metric" value={1} accent="chartreuse" testId="kpi-x" />);
    expect(screen.getByText('Metric').className).toContain('text-emerald-400');
  });

  it('renders the sub line in slate-300 (slate-400 fails mid-gradient)', () => {
    render(<KpiCard label="Metric" value={1} sub="Secondary" testId="kpi-x" />);
    const sub = screen.getByText('Secondary');
    expect(sub.className).toContain('text-slate-300');
    expect(sub.className).not.toContain('text-slate-400');
  });
});
