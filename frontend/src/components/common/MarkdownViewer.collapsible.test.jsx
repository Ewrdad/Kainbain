import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { MarkdownViewer, HEADING_STYLES } from './MarkdownViewer';

/***
 * MARK: MarkdownViewer collapsible tests
 * @description Covers the opt-in collapsible `h2` sections: toggles render
 *   only when opted in, click and keyboard toggle exactly one section,
 *   `aria-expanded`/`aria-controls` stay correct, the preamble/`h1` never
 *   collapse, collapse state resets when the article changes, and the
 *   non-opt-in output stays free of toggle chrome.
 */
const ARTICLE = [
  '# Article Title',
  '',
  'Preamble paragraph before any section.',
  '',
  '## First Section',
  '',
  'First section body.',
  '',
  '- first item',
  '',
  '## Second Section',
  '',
  'Second section body.',
  '',
  '### Nested sub title',
  '',
  'Nested body stays with its parent section.',
].join('\n');

const EMPTY_SECTION_ARTICLE = ['## Lonely heading', '', '## Next heading', '', 'Body.'].join('\n');

describe('MarkdownViewer collapsible sections', () => {
  it('renders plain headings with no toggle chrome when not opted in', () => {
    const { container } = render(<MarkdownViewer content={ARTICLE} />);
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('[aria-expanded]')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Article Title' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'First Section' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Second Section' })).toBeInTheDocument();
  });

  it('renders one toggle per h2 when opted in, all expanded by default', () => {
    render(<MarkdownViewer content={ARTICLE} collapsibleSections />);
    const toggles = screen.getAllByRole('button', { expanded: true });
    expect(toggles).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'First Section' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Second Section' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('First section body.')).toBeInTheDocument();
    expect(screen.getByText('Second section body.')).toBeInTheDocument();
  });

  it('keeps real h2 heading levels around the toggles', () => {
    render(<MarkdownViewer content={ARTICLE} collapsibleSections />);
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('First Section')]),
    );
    // Each toggle lives inside its h2, so heading order never skips.
    headings.forEach((heading) => {
      expect(heading.tagName).toBe('H2');
      expect(heading.querySelector('button')).not.toBeNull();
    });
  });

  it('collapsing one section hides only its own body', () => {
    render(<MarkdownViewer content={ARTICLE} collapsibleSections />);
    fireEvent.click(screen.getByRole('button', { name: 'First Section' }));
    expect(screen.getByRole('button', { name: 'First Section' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByText('First section body.')).not.toBeInTheDocument();
    expect(screen.queryByText('first item')).not.toBeInTheDocument();
    // Sibling section untouched.
    expect(screen.getByRole('button', { name: 'Second Section' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('Second section body.')).toBeInTheDocument();
    // Preamble untouched.
    expect(screen.getByText('Preamble paragraph before any section.')).toBeInTheDocument();
    // Clicking again re-opens.
    fireEvent.click(screen.getByRole('button', { name: 'First Section' }));
    expect(screen.getByText('First section body.')).toBeInTheDocument();
  });

  it('uses native buttons so Enter and Space toggle from the keyboard', () => {
    // jsdom performs no default key activation, so this pins the guarantee at
    // its source: a focusable native <button type="button">, which browsers
    // activate with Enter/Space by default.
    render(<MarkdownViewer content={ARTICLE} collapsibleSections />);
    const toggle = screen.getByRole('button', { name: 'Second Section' });
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle).toHaveAttribute('type', 'button');
    toggle.focus();
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Second section body.')).not.toBeInTheDocument();
  });

  it('points aria-controls at the rendered body while expanded', () => {
    const { container } = render(<MarkdownViewer content={ARTICLE} collapsibleSections />);
    const toggle = screen.getByRole('button', { name: 'First Section' });
    const bodyId = toggle.getAttribute('aria-controls');
    expect(bodyId).toBeTruthy();
    expect(container.querySelector(`#${CSS.escape(bodyId)}`)).not.toBeNull();
  });

  it('never makes the h1 title or preamble collapsible', () => {
    render(<MarkdownViewer content={ARTICLE} collapsibleSections />);
    const title = screen.getByRole('heading', { level: 1, name: 'Article Title' });
    expect(title.querySelector('button')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Article Title' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'First Section' }));
    fireEvent.click(screen.getByRole('button', { name: 'Second Section' }));
    expect(screen.getByText('Preamble paragraph before any section.')).toBeInTheDocument();
  });

  it('handles empty sections without crashing', () => {
    render(<MarkdownViewer content={EMPTY_SECTION_ARTICLE} collapsibleSections />);
    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Lonely heading' }));
    expect(screen.getByRole('button', { name: 'Lonely heading' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByText('Body.')).toBeInTheDocument();
  });

  it('starts collapsed when defaultCollapsed is set', () => {
    render(<MarkdownViewer content={ARTICLE} collapsibleSections defaultCollapsed />);
    expect(screen.getByRole('button', { name: 'First Section' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByText('First section body.')).not.toBeInTheDocument();
    expect(screen.getByText('Preamble paragraph before any section.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'First Section' }));
    expect(screen.getByText('First section body.')).toBeInTheDocument();
  });

  it('applies expand-all and collapse-all signals', () => {
    const { rerender } = render(<MarkdownViewer content={ARTICLE} collapsibleSections />);
    fireEvent.click(screen.getByRole('button', { name: 'First Section' }));
    expect(screen.queryByText('First section body.')).not.toBeInTheDocument();
    rerender(
      <MarkdownViewer
        content={ARTICLE}
        collapsibleSections
        sectionVisibilitySignal={{ action: 'expand-all', nonce: 1 }}
      />,
    );
    expect(screen.getByText('First section body.')).toBeInTheDocument();
    rerender(
      <MarkdownViewer
        content={ARTICLE}
        collapsibleSections
        sectionVisibilitySignal={{ action: 'collapse-all', nonce: 2 }}
      />,
    );
    expect(screen.queryByText('First section body.')).not.toBeInTheDocument();
    expect(screen.queryByText('Second section body.')).not.toBeInTheDocument();
    expect(screen.getByText('Preamble paragraph before any section.')).toBeInTheDocument();
  });

  it('applies each signal nonce once, so re-renders never replay it', () => {
    const { rerender } = render(
      <MarkdownViewer
        content={ARTICLE}
        collapsibleSections
        sectionVisibilitySignal={{ action: 'collapse-all', nonce: 1 }}
      />,
    );
    expect(screen.queryByText('First section body.')).not.toBeInTheDocument();
    // The user re-opens one section; re-rendering with the same signal object
    // must not collapse it again.
    fireEvent.click(screen.getByRole('button', { name: 'First Section' }));
    expect(screen.getByText('First section body.')).toBeInTheDocument();
    rerender(
      <MarkdownViewer
        content={ARTICLE}
        collapsibleSections
        sectionVisibilitySignal={{ action: 'collapse-all', nonce: 1 }}
      />,
    );
    expect(screen.getByText('First section body.')).toBeInTheDocument();
  });

  it('resets collapse state when the article changes', () => {
    const other = ['# Other', '', '## Other section', '', 'Other body.'].join('\n');
    const { rerender } = render(<MarkdownViewer content={ARTICLE} collapsibleSections />);
    fireEvent.click(screen.getByRole('button', { name: 'First Section' }));
    expect(screen.queryByText('First section body.')).not.toBeInTheDocument();
    // Positional ids from the old article must not leak into the new one.
    rerender(<MarkdownViewer content={other} collapsibleSections />);
    expect(screen.getByText('Other body.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Other section' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('ignores unknown signal actions', () => {
    render(
      <MarkdownViewer
        content={ARTICLE}
        collapsibleSections
        sectionVisibilitySignal={{ action: 'mystery', nonce: 1 }}
      />,
    );
    expect(screen.getByText('First section body.')).toBeInTheDocument();
    expect(screen.getByText('Second section body.')).toBeInTheDocument();
  });

  it('marks the chevron decorative, animated, and reduced-motion safe', () => {
    const { container } = render(<MarkdownViewer content={ARTICLE} collapsibleSections />);
    const chevrons = container.querySelectorAll('h2 button > span[aria-hidden="true"]');
    expect(chevrons).toHaveLength(2);
    chevrons.forEach((chevron) => {
      expect(chevron.className).toContain('transition-transform');
      expect(chevron.className).toContain('motion-reduce:transition-none');
    });
    const toggle = screen.getByRole('button', { name: 'First Section' });
    expect(toggle.className).toContain('focus-visible:ring-2');
    // Collapsing rotates the chevron from down to right.
    expect(chevrons[0].className).not.toContain('-rotate-90');
    fireEvent.click(toggle);
    expect(
      container.querySelectorAll('h2 button > span[aria-hidden="true"]')[0].className,
    ).toContain('-rotate-90');
  });

  it('keeps the review wrapper seam working with original block indices', () => {
    const seen = [];
    render(
      <MarkdownViewer
        content={ARTICLE}
        collapsibleSections
        renderBlockWrapper={(block, rendered, index) => {
          seen.push([block.type, index, block.startLine]);
          return rendered;
        }}
      />,
    );
    const h2s = seen.filter(([type]) => type === 'h2');
    expect(h2s).toHaveLength(2);
    // Indices still walk the original block list in order with spans intact.
    const indices = seen.map(([, index]) => index);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    expect(new Set(indices).size).toBe(indices.length);
    seen.forEach(([, , startLine]) => expect(startLine).toBeGreaterThan(0));
  });

  it('renders h2 headers more prominent than body text', () => {
    expect(HEADING_STYLES.h2).toContain('text-lg');
    expect(HEADING_STYLES.h2).toContain('font-extrabold');
    render(<MarkdownViewer content={ARTICLE} />);
    const heading = screen.getByRole('heading', { level: 2, name: 'First Section' });
    expect(heading.className).toContain('text-lg');
    expect(heading.className).toContain('font-extrabold');
    expect(heading.className).toContain('mt-4');
  });
});
