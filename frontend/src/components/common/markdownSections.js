/***
 * MARK: groupBlocksIntoSections
 * @description Groups parsed markdown blocks into a preamble plus one section
 *   per `h2` heading. Everything before the first `h2` (including the `h1`
 *   title) stays in the always-visible preamble; each section owns its `h2`
 *   heading block plus every following block until the next `h2`. Block
 *   objects pass through untouched (same references, so `startLine`/`endLine`
 *   spans survive for review UIs). Section ids derive from the heading's index
 *   in the block list, so they stay stable while the content is unchanged.
 * @param {Array<Object>} blocks - Blocks from `parseMarkdownBlocks`.
 * @returns {{ preamble: Array<Object>, sections: Array<{ id: string, headingBlock: Object, headingIndex: number, blocks: Array<Object> }> }} The preamble and the `h2` sections.
 * @example groupBlocksIntoSections([{ type: 'h2', text: 'Setup', startLine: 1, endLine: 1 }]).sections[0].id => 'section-0'
 * @example groupBlocksIntoSections([]) => { preamble: [], sections: [] }
 ***/
export const groupBlocksIntoSections = (blocks) => {
  if (!Array.isArray(blocks)) return { preamble: [], sections: [] };
  const preamble = [];
  const sections = [];
  let current = null;
  blocks.forEach((block, blockIndex) => {
    if (block?.type === 'h2') {
      current = {
        id: `section-${blockIndex}`,
        headingBlock: block,
        headingIndex: blockIndex,
        blocks: [],
      };
      sections.push(current);
    } else if (current) {
      current.blocks.push(block);
    } else {
      preamble.push(block);
    }
  });
  return { preamble, sections };
};
