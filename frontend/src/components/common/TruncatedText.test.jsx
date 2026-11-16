import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TruncatedText } from './TruncatedText';
import '@testing-library/jest-dom';

/***
 * MARK: TruncatedText tests
 * @description The helper is the single place that encodes the overflow-safe
 *   contract used by every Settings card, so a regression there (e.g.
 *   dropping a guard class) must fail here rather than only inside a large
 *   component test. Also pins the fail-safe contract: missing input never
 *   crashes and never renders the words "undefined"/"null".
 ***/
describe('TruncatedText', () => {
  it('renders the full text with truncation guards and a hover tooltip', () => {
    const longName = `Release Pipeline ${'launches-and-hotfixes-'.repeat(10)}final`;
    render(<TruncatedText text={longName} className="font-bold text-sm" />);

    const label = screen.getByText(longName);
    // Guard classes: shrinkable flex item + capped width + single-line ellipsis.
    expect(label).toHaveClass('min-w-0', 'max-w-full', 'truncate', 'inline-block');
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

  it('passes an id through for aria-labelledby targets', () => {
    render(<TruncatedText id="alias-header-0" text="Alias: very-long-name" />);

    const label = screen.getByText('Alias: very-long-name');
    expect(label).toHaveAttribute('id', 'alias-header-0');
    expect(document.getElementById('alias-header-0')).toBe(label);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
  ])('renders an empty label with no tooltip for %s text', (_label, text) => {
    const { container } = render(<TruncatedText text={text} />);

    const label = container.firstChild;
    expect(label.textContent).toBe('');
    expect(label).not.toHaveAttribute('title');
    // Guards stay on so a late-arriving name still clips.
    expect(label).toHaveClass('min-w-0', 'truncate');
  });

  it('shows a non-string value as-is with its string form as the tooltip', () => {
    render(<TruncatedText text={8472} />);

    const label = screen.getByText('8472');
    expect(label).toHaveAttribute('title', '8472');
  });

  it('ignores a non-string className instead of rendering a "null" class', () => {
    render(<TruncatedText text="some name" className={null} />);

    const label = screen.getByText('some name');
    expect(label).toHaveClass('min-w-0', 'truncate');
    expect(label.className).not.toContain('null');
  });
});
