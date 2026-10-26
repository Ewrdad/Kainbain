import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResponsiveLabel } from './ResponsiveLabel';
import '@testing-library/jest-dom';

/***
 * MARK: ResponsiveLabel tests
 * @description The helper is the single place that encodes the
 *   `hidden sm:inline` / `sm:hidden` compact-label contract used by the file
 *   viewer toolbar, so a regression there (e.g. dropping a visibility class)
 *   must fail here rather than only inside a large component test.
 ***/
describe('ResponsiveLabel', () => {
  it('renders both variants with viewport-gated visibility classes', () => {
    render(<ResponsiveLabel full="Copy Content" compact="Content" />);

    const full = screen.getByText('Copy Content', { exact: true });
    const compact = screen.getByText('Content', { exact: true });

    // Full wording is hidden below sm and shown from sm up.
    expect(full).toHaveClass('hidden', 'sm:inline');
    // Compact wording is shown only below sm.
    expect(compact).toHaveClass('sm:hidden');
  });

  it('accepts non-string nodes for either variant', () => {
    render(
      <ResponsiveLabel full={<strong data-testid="full-node">Full</strong>} compact="Short" />,
    );

    expect(screen.getByTestId('full-node')).toBeInTheDocument();
    expect(screen.getByText('Short', { exact: true })).toBeInTheDocument();
  });

  it('renders the compact variant as a sibling, not a replacement (fails safe without CSS)', () => {
    render(<ResponsiveLabel full="Open in SilverBullet" compact="SilverBullet" />);

    // Both strings exist in the DOM: if Tailwind is unavailable the control
    // stays labelled rather than rendering an empty button.
    expect(screen.getByText('Open in SilverBullet', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('SilverBullet', { exact: true })).toBeInTheDocument();
  });

  it('falls back to the full label when compact is omitted or null', () => {
    const { unmount } = render(<ResponsiveLabel full="Copy Content" />);
    expect(screen.getAllByText('Copy Content', { exact: true })).toHaveLength(2);
    unmount();

    render(<ResponsiveLabel full="Copy Content" compact={null} />);
    expect(screen.getAllByText('Copy Content', { exact: true })).toHaveLength(2);
  });
});
