import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunnerBanner } from './RunnerBanner';

describe('RunnerBanner', () => {
  it('names the holding runner and stage when claimed', () => {
    render(<RunnerBanner claim={{ runnerId: 'local-pi', epoch: 3 }} stageName="Plan" />);
    const banner = screen.getByTestId('runner-banner');
    expect(banner.textContent).toMatch(/local-pi/);
    expect(banner.textContent).toMatch(/Plan/);
    // The copy states the Runner is busy with THIS task alone — it must
    // never imply the Runner is otherwise free.
    expect(banner.textContent).toMatch(/busy with this task alone/);
    expect(banner.textContent).toMatch(/one task per Runner/i);
  });

  it('renders nothing without a claim', () => {
    const { container } = render(<RunnerBanner claim={null} stageName="Plan" />);
    expect(container.querySelector('[data-testid="runner-banner"]')).toBeNull();
  });

  it('renders nothing for a malformed claim', () => {
    const { container } = render(<RunnerBanner claim={{ epoch: 1 }} stageName="Plan" />);
    expect(container.querySelector('[data-testid="runner-banner"]')).toBeNull();
  });
});
