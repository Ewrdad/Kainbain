import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunnerBanner } from './RunnerBanner';

describe('RunnerBanner', () => {
  it('names the holding runner and stage when claimed', () => {
    render(<RunnerBanner claim={{ runnerId: 'local-pi', epoch: 3 }} stageName="Plan" />);
    const banner = screen.getByTestId('runner-banner');
    expect(banner.textContent).toMatch(/local-pi/);
    expect(banner.textContent).toMatch(/Plan/);
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
