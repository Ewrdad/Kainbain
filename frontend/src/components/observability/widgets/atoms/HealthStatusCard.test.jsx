import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import { HealthStatusCard } from './HealthStatusCard';
import { healthStatusLabel } from '../healthStatus';

/***
 * MARK: HealthStatusCard tests
 * @description Pins the health-card atom's colour-independence contract. The
 *   status dot is a colour-only signal (WCAG 1.4.1 Use of Colour), so every
 *   card must also state the status in text — visually hidden, so the card's
 *   design is unchanged — and must keep the dot itself out of the accessible
 *   name (WCAG 1.1.1 / 4.1.2). Also locks the muted message line onto the
 *   7:1 shade (WCAG 1.4.6).
 ***/

describe('HealthStatusCard', () => {
  it('renders the title, headline, note, and message', () => {
    render(
      <HealthStatusCard
        title="LiteLLM Proxy"
        status="ok"
        headline="35 ms"
        headlineNote="Response Latency"
        message="LiteLLM reachable"
        testId="health-litellm"
      />,
    );

    const card = screen.getByTestId('health-litellm');
    expect(card).toHaveTextContent('LiteLLM Proxy');
    expect(card).toHaveTextContent('35 ms');
    expect(card).toHaveTextContent('Response Latency');
    expect(card).toHaveTextContent('LiteLLM reachable');
  });

  it.each([
    ['ok', 'OK'],
    ['warn', 'Warning'],
    ['warning', 'Warning'],
    ['error', 'Error'],
    ['disabled', 'Disabled'],
    ['unconfigured', 'Not configured'],
    [undefined, 'Unknown'],
  ])('states the status in text for %s (WCAG 1.4.1)', (status, label) => {
    render(<HealthStatusCard title="Subsystem" status={status} testId="health-x" />);

    expect(healthStatusLabel(status)).toBe(label);
    const card = screen.getByTestId('health-x');
    expect(card).toHaveTextContent(`Status: ${label}`);
    // The status word is visually hidden: no new visual affordance.
    const hidden = within(card)
      .getAllByText(`Status: ${label}`)
      .find((node) => node.className.includes('sr-only'));
    expect(hidden).toBeTruthy();
  });

  it('keeps the decorative dot out of the accessible name', () => {
    render(<HealthStatusCard title="Subsystem" status="ok" testId="health-x" />);

    const card = screen.getByTestId('health-x');
    const dots = Array.from(card.querySelectorAll('span')).filter((span) =>
      span.className.includes('rounded-full'),
    );
    expect(dots).toHaveLength(1);
    expect(dots[0]).toHaveAttribute('aria-hidden', 'true');
  });

  it('paints the truncating message line in the 7:1 muted shade', () => {
    render(<HealthStatusCard title="Subsystem" status="ok" message="ok" testId="health-x" />);

    const message = screen.getByText('ok');
    expect(message.className).toContain('text-slate-400');
    expect(message.className).not.toContain('text-slate-500');
  });
});
