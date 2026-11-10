import { describe, it, expect } from 'vitest';
import { parseMarkdownBlocks } from './MarkdownViewer';
import {
  REPORT_FIXTURE_MD,
  REPORT_FIXTURE_CRLF,
  FIXTURE_LINES,
} from '../review/__fixtures__/reportFixture';

/***
 * MARK: MarkdownViewer span tests
 * @description Pins the 1-based `startLine`/`endLine` source spans every
 *   parsed block carries (plus per-item `itemLines` and table `rowLines`),
 *   including CRLF input, trailing newlines, and the unclosed-fence edge.
 *   The shared report fixture keeps parser, anchor, and view tests on the
 *   same line numbers.
 */

describe('parseMarkdownBlocks source spans', () => {
  it('spans headings and single-line blocks exactly', () => {
    const blocks = parseMarkdownBlocks('# Title\n\nSome text');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: 'h1', startLine: 1, endLine: 1 });
    expect(blocks[1]).toMatchObject({ type: 'p', startLine: 3, endLine: 3 });
  });

  it('spans multi-line paragraphs across their source lines', () => {
    const blocks = parseMarkdownBlocks('first line\nsecond line\n\nnext');
    expect(blocks[0]).toMatchObject({ type: 'p', startLine: 1, endLine: 2 });
    expect(blocks[1]).toMatchObject({ type: 'p', startLine: 4, endLine: 4 });
  });

  it('spans code fences including both fences, with per-block lines', () => {
    const blocks = parseMarkdownBlocks('```js\nconst a = 1;\nconst b = 2;\n```\n\nafter');
    expect(blocks[0]).toMatchObject({ type: 'code', startLine: 1, endLine: 4 });
    expect(blocks[1]).toMatchObject({ type: 'p', startLine: 6, endLine: 6 });
  });

  it('clamps an unclosed fence to the last content line', () => {
    const blocks = parseMarkdownBlocks('```js\nconst a = 1;\nconst b = 2;');
    expect(blocks[0]).toMatchObject({ type: 'code', startLine: 1, endLine: 3 });
  });

  it('spans lists per block and per item', () => {
    const blocks = parseMarkdownBlocks('- a\n- b\n- c');
    expect(blocks[0]).toMatchObject({
      type: 'ul',
      startLine: 1,
      endLine: 3,
      itemLines: [1, 2, 3],
    });
    const ordered = parseMarkdownBlocks('1. one\n2. two');
    expect(ordered[0]).toMatchObject({
      type: 'ol',
      startLine: 1,
      endLine: 2,
      itemLines: [1, 2],
    });
  });

  it('spans tables with header and data-row line numbers', () => {
    const md = '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |';
    const blocks = parseMarkdownBlocks(md);
    expect(blocks[0]).toMatchObject({
      type: 'table',
      startLine: 1,
      endLine: 4,
      headerLine: 1,
      rowLines: [3, 4],
    });
    expect(blocks[0].rows).toHaveLength(2);
  });

  it('spans blockquotes and rules', () => {
    const blocks = parseMarkdownBlocks('> one\n> two\n\n---\n\ndone');
    expect(blocks[0]).toMatchObject({ type: 'blockquote', startLine: 1, endLine: 2 });
    expect(blocks[1]).toMatchObject({ type: 'hr', startLine: 4, endLine: 4 });
    expect(blocks[2]).toMatchObject({ type: 'p', startLine: 6, endLine: 6 });
  });

  it('normalizes CRLF so spans match LF line numbers and leak no carriage returns', () => {
    const lf = parseMarkdownBlocks('# Plan\nAdd retries\n\nShip it');
    const crlf = parseMarkdownBlocks('# Plan\r\nAdd retries\r\n\r\nShip it');
    expect(crlf).toEqual(lf);
    expect(crlf[1]).toMatchObject({ type: 'p', startLine: 2, endLine: 2 });
    for (const block of crlf) {
      for (const value of Object.values(block)) {
        if (typeof value === 'string') expect(value).not.toContain('\r');
      }
    }
  });

  it('ignores a trailing newline instead of emitting an empty block', () => {
    const blocks = parseMarkdownBlocks('hello\n');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: 'p', startLine: 1, endLine: 1 });
  });

  it('maps the shared fixture to its documented line numbers', () => {
    const blocks = parseMarkdownBlocks(REPORT_FIXTURE_MD);
    expect(blocks).toHaveLength(12);
    expect(blocks[0]).toMatchObject({ type: 'h1', startLine: 1, endLine: 1 });
    expect(blocks[1]).toMatchObject({ type: 'p', startLine: 3, endLine: 4 });
    expect(blocks[2]).toMatchObject({ type: 'ul', startLine: 6, endLine: 8, itemLines: [6, 7, 8] });
    expect(blocks[3]).toMatchObject({ type: 'ol', startLine: 11, endLine: 12, itemLines: [11, 12] });
    expect(blocks[4]).toMatchObject({ type: 'blockquote', startLine: 14, endLine: 15 });
    expect(blocks[5]).toMatchObject({ type: 'code', startLine: 17, endLine: 20 });
    expect(blocks[6]).toMatchObject({
      type: 'table',
      startLine: 22,
      endLine: 25,
      headerLine: 22,
      rowLines: [24, 25],
    });
    expect(blocks[7]).toMatchObject({ type: 'hr', startLine: 27, endLine: 27 });
    expect(blocks[8]).toMatchObject({ type: 'p', startLine: 29, endLine: 29 });
    expect(blocks[9]).toMatchObject({ type: 'p', startLine: 31, endLine: 31 });
    expect(blocks[10]).toMatchObject({ type: 'h2', startLine: 33, endLine: 33 });
    expect(blocks[11]).toMatchObject({ type: 'p', startLine: 35, endLine: 35 });
    // Long single line stays one block; blank runs collapse (no empty blocks).
    expect(FIXTURE_LINES[30]).toContain('deliberately long');
    expect(blocks[9].startLine).toBe(31);
  });

  it('keeps the CRLF fixture aligned with the LF split', () => {
    const blocks = parseMarkdownBlocks(REPORT_FIXTURE_CRLF);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({ type: 'h1', startLine: 1, endLine: 1 });
    expect(blocks[1]).toMatchObject({ type: 'p', startLine: 2, endLine: 2 });
    expect(blocks[2]).toMatchObject({ type: 'p', startLine: 4, endLine: 4 });
  });
});
