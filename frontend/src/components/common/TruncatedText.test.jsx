import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TruncatedText } from './TruncatedText';
import '@testing-library/jest-dom';

/***
 * MARK: TruncatedText tests
 * @description The helper is the single place that encodes the
 *   `min-w-0` + `truncate` + `title` overflow-safe contract used by every
 *   Settings card, so a regression there (e.g. dropping a guard class) must
 *   fail here rather than only inside a large component test.
 ***/
describe('TruncatedText', () => {
  it('renders the full text with truncation guards and a hover tooltip', () => {
    const longName = `Release Pipeline ${'launches-and-hotfixes-'.repeat(10)}final`;
    render(<TruncatedText text={longName} className="font-bold text-sm" />);

    const label = screen.getByText(longName);
    // Guard classes: shrinkable flex item + single-line ellipsis.
    expect(label).toHaveClass('min-w-0', 'truncate');
    // Caller styling merges after the guards.
    expect(label).toHaveClass('font-bold', 'text-sm');
    // Full name stays discoverable on hover.
    expect(label).toHaveAttribute('title', longName);
  });

  it('keeps spaceless strings on one clipped line', () => {
    const spaceless = `${'nospaces'.repeat(30)}-workflow`;
    render(<TruncatedText text={spaceless} />);

    const label = screen.getByText(spaceless);
    // `truncate` implies nowrap + ellipsis: no wrapping, no per-word breaks.
    expect(label).toHaveClass('truncate');
    expect(label).toHaveAttribute('title', spaceless);
  });

  it('accepts an explicit tooltip override', () => {
    render(<TruncatedText text="Alias: very-long-name" title="very-long-name" />);

    expect(screen.getByText('Alias: very-long-name')).toHaveAttribute(
      'title',
      'very-long-name',
    );
  });
});
