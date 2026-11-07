import { describe, it, expect } from 'vitest';
import { parseMarkdownBlocks } from '../common/MarkdownViewer';
import {
  blockForLine,
  threadsForBlock,
  groupThreadsByBlock,
  blockIndexForLine,
  describeBlockKind,
  blockLineLabel,
} from './reportAnchors';
import { REPORT_FIXTURE_MD } from './__fixtures__/reportFixture';

/***
 * MARK: reportAnchors tests
 * @description Pins the integer-line → rendered-block mapping that keeps
 *   every pre-existing comment anchored after the reading-view redesign:
 *   strict containment, blank-line fallback to the next block, multi-line
 *   block spans (fences, paragraphs), thread grouping, and chip labels.
 ***/

const commentOn = (line, id = `c-${line}`) => ({
  id,
  scope: 'line',
  line,
  side: 'right',
  body: `note on ${line}`,
});

const fixtureBlocks = () => parseMarkdownBlocks(REPORT_FIXTURE_MD);

describe('blockForLine', () => {
  it('returns the block strictly containing the line', () => {
    const blocks = fixtureBlocks();
    expect(blockForLine(blocks, 1)).toMatchObject({ type: 'h1' });
    expect(blockForLine(blocks, 4)).toMatchObject({ type: 'p', startLine: 3 });
    expect(blockForLine(blocks, 7)).toMatchObject({ type: 'ul' });
    expect(blockForLine(blocks, 19)).toMatchObject({ type: 'code' });
    expect(blockForLine(blocks, 24)).toMatchObject({ type: 'table' });
  });

  it('returns null for blank separator lines and out-of-range lines', () => {
    const blocks = fixtureBlocks();
    expect(blockForLine(blocks, 2)).toBeNull();
    expect(blockForLine(blocks, 5)).toBeNull();
    expect(blockForLine(blocks, 9)).toBeNull();
    expect(blockForLine(blocks, 999)).toBeNull();
    expect(blockForLine(blocks, 0)).toBeNull();
  });

  it('fails safe on malformed input', () => {
    expect(blockForLine(null, 1)).toBeNull();
    expect(blockForLine([], 1)).toBeNull();
    expect(blockForLine([{ type: 'p' }], 1)).toBeNull();
    expect(blockForLine(fixtureBlocks(), '3')).toBeNull();
  });
});

describe('threadsForBlock', () => {
  it('collects threads inside a multi-line span in line order', () => {
    const threads = new Map([
      [4, [commentOn(4)]],
      [3, [commentOn(3)]],
      [7, [commentOn(7)]],
    ]);
    const block = { type: 'p', startLine: 3, endLine: 4 };
    const found = threadsForBlock(block, threads);
    expect(found.map((c) => c.line)).toEqual([3, 4]);
  });

  it('collects nothing outside the span and accepts plain objects', () => {
    const block = { type: 'ul', startLine: 6, endLine: 8 };
    expect(threadsForBlock(block, new Map([[9, [commentOn(9)]]]))).toEqual([]);
    expect(threadsForBlock(block, { 6: [commentOn(6)], 10: [commentOn(10)] })).toHaveLength(1);
  });

  it('returns empty for blocks without spans', () => {
    expect(threadsForBlock({ type: 'p' }, new Map([[1, [commentOn(1)]]]))).toEqual([]);
    expect(threadsForBlock(null, new Map())).toEqual([]);
  });
});

describe('groupThreadsByBlock', () => {
  it('places every fixture thread under exactly one block', () => {
    const blocks = fixtureBlocks();
    const threads = new Map([
      [1, [commentOn(1)]],
      [4, [commentOn(4)]],
      [18, [commentOn(18)]],
      [24, [commentOn(24)]],
      [35, [commentOn(35)]],
    ]);
    const { byIndex, unplaced } = groupThreadsByBlock(blocks, threads);
    expect(unplaced).toEqual([]);
    const placed = [...byIndex.values()].flat();
    expect(placed).toHaveLength(5);
    // Heading thread sits under the h1 block, code thread under the fence.
    expect(byIndex.get(0).map((c) => c.line)).toEqual([1]);
    expect(byIndex.get(5).map((c) => c.line)).toEqual([18]);
  });

  it('falls back blank-line threads to the next visible block', () => {
    const blocks = fixtureBlocks();
    const { byIndex, unplaced } = groupThreadsByBlock(blocks, new Map([[5, [commentOn(5)]]]));
    expect(unplaced).toEqual([]);
    // Blank line 5 sits between the intro paragraph (index 1) and the list (index 2).
    expect(byIndex.get(2).map((c) => c.line)).toEqual([5]);
  });

  it('pins trailing threads past the last line to the final block', () => {
    const blocks = fixtureBlocks();
    const { byIndex, unplaced } = groupThreadsByBlock(blocks, new Map([[99, [commentOn(99)]]]));
    expect(unplaced).toEqual([]);
    expect(byIndex.get(blocks.length - 1).map((c) => c.line)).toEqual([99]);
  });

  it('leaves threads unplaced only when the report has no blocks', () => {
    const { byIndex, unplaced } = groupThreadsByBlock([], new Map([[2, [commentOn(2)]]]));
    expect(byIndex.size).toBe(0);
    expect(unplaced.map((c) => c.line)).toEqual([2]);
  });
});

describe('blockIndexForLine', () => {
  it('docks composer lines to containing, next, or last block', () => {
    const blocks = fixtureBlocks();
    expect(blockIndexForLine(blocks, 19)).toBe(5);
    // Blank line 5 docks to the following list block (index 2).
    expect(blockIndexForLine(blocks, 5)).toBe(2);
    // Past-the-end lines dock to the final block.
    expect(blockIndexForLine(blocks, 99)).toBe(blocks.length - 1);
    expect(blockIndexForLine([], 3)).toBe(-1);
    expect(blockIndexForLine(blocks, 'x')).toBe(-1);
  });
});

describe('block labels', () => {
  it('names every block kind for aria labels', () => {
    expect(describeBlockKind({ type: 'h2' })).toBe('heading');
    expect(describeBlockKind({ type: 'p' })).toBe('paragraph');
    expect(describeBlockKind({ type: 'code' })).toBe('code block');
    expect(describeBlockKind({ type: 'ul' })).toBe('list');
    expect(describeBlockKind({ type: 'ol' })).toBe('ordered list');
    expect(describeBlockKind({ type: 'blockquote' })).toBe('quote');
    expect(describeBlockKind({ type: 'table' })).toBe('table');
    expect(describeBlockKind({ type: 'hr' })).toBe('section divider');
    expect(describeBlockKind({})).toBe('section');
  });

  it('formats single lines and spans for the hover chip', () => {
    expect(blockLineLabel({ startLine: 12, endLine: 12 })).toBe('L12');
    expect(blockLineLabel({ startLine: 12, endLine: 14 })).toBe('L12–14');
    expect(blockLineLabel({})).toBe('');
  });
});
