// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownViewer, parseMarkdownBlocks } from './MarkdownViewer';

/***
 * MARK: MarkdownViewer wrapper-seam tests
 * @description Pins the `renderBlockWrapper` extension seam: default output
 *   carries no block-identity attributes (byte-identical for existing
 *   callers), while a wrapper receives every parsed block with its
 *   source span and can emit stable `data-*` anchors for review UIs.
 ***/

describe('MarkdownViewer renderBlockWrapper seam', () => {
  it('emits no block-identity attributes by default', () => {
    const { container } = render(<MarkdownViewer content={'# Title\n\nBody text'} />);
    expect(container.querySelector('[data-start-line]')).toBeNull();
    expect(container.querySelector('[data-block-id]')).toBeNull();
  });

  it('passes every block with its span to the wrapper in order', () => {
    const seen = [];
    const { container } = render(
      <MarkdownViewer
        content={'# Title\n\nBody text'}
        renderBlockWrapper={(block, rendered, index) => {
          seen.push({ type: block.type, start: block.startLine, end: block.endLine, index });
          return (
            <div
              key={index}
              data-block-id={`block-${index}`}
              data-start-line={block.startLine}
              data-end-line={block.endLine}
            >
              {rendered}
            </div>
          );
        }}
      />,
    );
    expect(seen).toEqual([
      { type: 'h1', start: 1, end: 1, index: 0 },
      { type: 'p', start: 3, end: 3, index: 1 },
    ]);
    const wrappers = container.querySelectorAll('[data-block-id]');
    expect(wrappers).toHaveLength(2);
    expect(wrappers[0].getAttribute('data-start-line')).toBe('1');
    expect(wrappers[1].getAttribute('data-end-line')).toBe('3');
    // Wrapped content still renders.
    expect(container.querySelector('h1')).not.toBeNull();
  });

  it('renders identical text with and without a pass-through wrapper', () => {
    const md = '# Title\n\nBody with **bold**.\n\n- one\n- two';
    const plain = render(<MarkdownViewer content={md} />).container.textContent;
    const wrapped = render(
      <MarkdownViewer
        content={md}
        renderBlockWrapper={(block, rendered, index) => <div key={index}>{rendered}</div>}
      />,
    ).container.textContent;
    expect(wrapped).toBe(plain);
    expect(parseMarkdownBlocks(md)).toHaveLength(3);
  });
});
