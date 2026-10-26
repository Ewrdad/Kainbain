import { expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { BrandMark } from './BrandMark';
import '@testing-library/jest-dom';

/**
 * MARK: BrandMark tests
 * @description Verifies the orchestration-core brand mark renders as a
 *   decorative, aria-hidden SVG and applies the className, with an optional
 *   dark tile background.
 */
test('renders an aria-hidden svg with the brand viewBox', () => {
  const { container } = render(<BrandMark />);
  const svg = container.querySelector('svg');
  expect(svg).toBeInTheDocument();
  expect(svg.getAttribute('aria-hidden')).toBe('true');
  expect(svg.getAttribute('viewBox')).toBe('0 0 128 128');
});

test('renders the core hub node by default', () => {
  const { container } = render(<BrandMark />);
  expect(container.querySelector('circle[r="24"]')).toBeInTheDocument();
  // No tile background unless requested.
  expect(container.querySelector('rect')).toBeNull();
});

test('renders the dark tile background when tile is enabled', () => {
  const { container } = render(<BrandMark tile />);
  expect(container.querySelectorAll('rect').length).toBeGreaterThan(0);
});

test('applies the className to the svg', () => {
  const { container } = render(<BrandMark className="w-16 h-16" />);
  expect(container.querySelector('svg').getAttribute('class')).toContain('w-16 h-16');
});
