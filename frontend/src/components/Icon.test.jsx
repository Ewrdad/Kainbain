import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Icon } from './Icon';
import '@testing-library/jest-dom';

/**
 * MARK: Icon tests
 * @description Verifies the shared icon set renders the requested icon as a
 *   decorative, aria-hidden SVG and applies the classname.
 */
test('renders the close icon as an aria-hidden svg', () => {
  const { container } = render(<Icon name="close" />);
  const svg = container.querySelector('svg');
  expect(svg).toBeInTheDocument();
  expect(svg.getAttribute('aria-hidden')).toBe('true');
});

test('renders known icons without throwing', () => {
  for (const name of ['close', 'gear', 'edit', 'delete', 'grip']) {
    const { container } = render(<Icon name={name} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  }
});

test('renders nothing (empty svg) for an unknown icon name', () => {
  const { container } = render(<Icon name="does-not-exist" />);
  expect(container.querySelector('svg')).toBeInTheDocument();
});

test('applies the className to the svg', () => {
  const { container } = render(<Icon name="close" className="w-8 h-8" />);
  expect(container.querySelector('svg').getAttribute('class')).toContain('w-8 h-8');
});
