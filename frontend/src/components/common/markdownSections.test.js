import { describe, it, expect } from 'vitest';
import { groupBlocksIntoSections } from './markdownSections';

/***
 * MARK: markdownSections tests
 * @description Unit coverage for the docs section model: preamble handling,
 *   `h2` splitting, empty sections, span preservation, and fail-safe input.
 */
const block = (type, text, startLine) => ({ type, text, startLine, endLine: startLine });

describe('groupBlocksIntoSections', () => {
  it('returns an empty model for empty or invalid input', () => {
    expect(groupBlocksIntoSections([])).toEqual({ preamble: [], sections: [] });
    expect(groupBlocksIntoSections(null)).toEqual({ preamble: [], sections: [] });
    expect(groupBlocksIntoSections(undefined)).toEqual({ preamble: [], sections: [] });
    expect(groupBlocksIntoSections('## not blocks')).toEqual({ preamble: [], sections: [] });
  });

  it('keeps everything in the preamble when there is no h2', () => {
    const blocks = [
      block('h1', 'Title', 1),
      block('p', 'Intro', 3),
      { type: 'code', code: 'x', language: '', startLine: 5, endLine: 7 },
    ];
    const { preamble, sections } = groupBlocksIntoSections(blocks);
    expect(sections).toEqual([]);
    expect(preamble).toEqual(blocks);
  });

  it('puts the h1 title and pre-h2 content in the always-visible preamble', () => {
    const blocks = [
      block('h1', 'Title', 1),
      block('p', 'Intro', 3),
      block('h2', 'First', 5),
      block('p', 'Body', 7),
    ];
    const { preamble, sections } = groupBlocksIntoSections(blocks);
    expect(preamble).toEqual([blocks[0], blocks[1]]);
    expect(sections).toHaveLength(1);
    expect(sections[0].headingBlock).toBe(blocks[2]);
    expect(sections[0].blocks).toEqual([blocks[3]]);
  });

  it('splits one section per h2 and stops each at the next h2', () => {
    const blocks = [
      block('h2', 'One', 1),
      block('p', 'a', 3),
      block('h2', 'Two', 5),
      block('p', 'b', 7),
      block('h2', 'Three', 9),
      block('p', 'c', 11),
    ];
    const { sections } = groupBlocksIntoSections(blocks);
    expect(sections.map((s) => s.headingBlock.text)).toEqual(['One', 'Two', 'Three']);
    expect(sections[0].blocks).toEqual([blocks[1]]);
    expect(sections[1].blocks).toEqual([blocks[3]]);
    expect(sections[2].blocks).toEqual([blocks[5]]);
  });

  it('keeps consecutive h2s as safe empty sections', () => {
    const blocks = [block('h2', 'One', 1), block('h2', 'Two', 3)];
    const { sections } = groupBlocksIntoSections(blocks);
    expect(sections).toHaveLength(2);
    expect(sections[0].blocks).toEqual([]);
    expect(sections[1].blocks).toEqual([]);
  });

  it('collects every block type inside a section, including nested h3s', () => {
    const inner = [
      block('p', 'words', 3),
      { type: 'code', code: 'x', language: 'js', startLine: 5, endLine: 7 },
      { type: 'ul', items: ['a'], startLine: 9, endLine: 9, itemLines: [9] },
      { type: 'ol', items: ['b'], startLine: 11, endLine: 11, itemLines: [11] },
      {
        type: 'table',
        headers: ['h'],
        rows: [['c']],
        startLine: 13,
        endLine: 15,
        headerLine: 13,
        rowLines: [15],
      },
      block('blockquote', 'quoted', 17),
      block('hr', '', 19),
      block('h3', 'Sub title', 21),
      block('h4', 'Deep', 23),
    ];
    const blocks = [block('h2', 'Section', 1), ...inner];
    const { sections } = groupBlocksIntoSections(blocks);
    expect(sections).toHaveLength(1);
    expect(sections[0].blocks).toEqual(inner);
  });

  it('passes block objects through untouched so line spans survive', () => {
    const blocks = [
      block('h1', 'Title', 1),
      block('h2', 'Section', 3),
      { type: 'ul', items: ['a'], startLine: 5, endLine: 6, itemLines: [5, 6] },
    ];
    const { preamble, sections } = groupBlocksIntoSections(blocks);
    expect(preamble[0]).toBe(blocks[0]);
    expect(sections[0].headingBlock).toBe(blocks[1]);
    expect(sections[0].blocks[0]).toBe(blocks[2]);
    expect(sections[0].blocks[0].itemLines).toEqual([5, 6]);
  });

  it('gives each section a stable id from its heading position', () => {
    const blocks = [block('p', 'intro', 1), block('h2', 'A', 3), block('h2', 'B', 5)];
    const first = groupBlocksIntoSections(blocks);
    const second = groupBlocksIntoSections([...blocks]);
    expect(first.sections.map((s) => s.id)).toEqual(['section-1', 'section-2']);
    expect(second.sections.map((s) => s.id)).toEqual(['section-1', 'section-2']);
    expect(first.sections[0].headingIndex).toBe(1);
  });
});
