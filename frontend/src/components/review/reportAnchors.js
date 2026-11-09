/***
 * MARK: reportAnchors
 * @description Pure helpers that map the existing integer-line review
 *   threads onto rendered markdown blocks (which carry 1-based
 *   `startLine`/`endLine` spans from `parseMarkdownBlocks`). A block
 *   comment reuses the established payload contract (`scope: 'line'`,
 *   integer `line`, `side: 'right'`, `lineText`) with `line` set to the
 *   block's first source line, so no API, sidecar-store, or `useReview`
 *   change is needed and every pre-existing thread keeps working.
 * @example blockForLine([{ startLine: 3, endLine: 4 }], 4) => { startLine: 3, endLine: 4 }
 ***/

/***
 * MARK: blockForLine
 * @description Returns the block whose [startLine, endLine] span contains
 *   the 1-based source line, or null when it falls on a gap (blank line)
 *   or outside every block.
 * @param {Array<Object>} blocks - Parsed blocks with `startLine`/`endLine`.
 * @param {number} line - 1-based source line number.
 * @returns {Object|null} The containing block or null.
 * @example blockForLine([{ startLine: 1, endLine: 1 }], 2) => null
 ***/
export const blockForLine = (blocks, line) => {
  if (!Array.isArray(blocks) || !Number.isInteger(line)) return null;
  for (const block of blocks) {
    if (!block || !Number.isInteger(block.startLine) || !Number.isInteger(block.endLine)) continue;
    if (line >= block.startLine && line <= block.endLine) return block;
  }
  return null;
};

/***
 * MARK: threadsForBlock
 * @description Collects the line-scoped threads whose integer line falls
 *   inside the block's source span, in ascending line order. Accepts the
 *   `byLine` grouping as a Map (as built by `ReportReviewView`) or a
 *   plain object.
 * @param {Object} block - Parsed block with `startLine`/`endLine`.
 * @param {Map|Object} threadsByLine - Line number → comment array.
 * @returns {Array<Object>} Threads anchored inside the block (possibly empty).
 * @example threadsForBlock({ startLine: 3, endLine: 4 }, new Map([[4, [c]]])) => [c]
 ***/
export const threadsForBlock = (block, threadsByLine) => {
  if (!block || !Number.isInteger(block.startLine) || !Number.isInteger(block.endLine)) return [];
  const out = [];
  const visit = (line, comments) => {
    if (!Number.isInteger(line)) return;
    if (line < block.startLine || line > block.endLine) return;
    if (Array.isArray(comments)) out.push({ line, comments });
  };
  if (threadsByLine instanceof Map) {
    for (const [line, comments] of threadsByLine) visit(line, comments);
  } else if (threadsByLine && typeof threadsByLine === 'object') {
    for (const [key, comments] of Object.entries(threadsByLine)) visit(Number(key), comments);
  }
  out.sort((a, b) => a.line - b.line);
  return out.flatMap((entry) => entry.comments);
};

/***
 * MARK: groupThreadsByBlock
 * @description Assigns every line-scoped thread to exactly one rendered
 *   block: the containing block when the line sits inside a span, else the
 *   nearest following block (so threads on blank separator lines surface
 *   under the next visible block), else the last block. Threads with no
 *   block at all (empty report) land in `unplaced`.
 * @param {Array<Object>} blocks - Parsed blocks with `startLine`/`endLine`.
 * @param {Map|Object} threadsByLine - Line number → comment array.
 * @returns {{ byIndex: Map<number, Array<Object>>, unplaced: Array<Object> }} Grouped threads.
 * @example groupThreadsByBlock([], new Map([[2, [c]]])).unplaced => [c]
 ***/
export const groupThreadsByBlock = (blocks, threadsByLine) => {
  const byIndex = new Map();
  const unplaced = [];
  const entries = [];
  const collect = (line, comments) => {
    if (!Number.isInteger(line) || !Array.isArray(comments) || comments.length === 0) return;
    entries.push({ line, comments });
  };
  if (threadsByLine instanceof Map) {
    for (const [line, comments] of threadsByLine) collect(line, comments);
  } else if (threadsByLine && typeof threadsByLine === 'object') {
    for (const [key, comments] of Object.entries(threadsByLine)) collect(Number(key), comments);
  }
  entries.sort((a, b) => a.line - b.line);

  const list = Array.isArray(blocks) ? blocks : [];
  for (const { line, comments } of entries) {
    let target = -1;
    for (let idx = 0; idx < list.length; idx += 1) {
      const block = list[idx];
      if (!block || !Number.isInteger(block.startLine) || !Number.isInteger(block.endLine)) continue;
      if (line >= block.startLine && line <= block.endLine) {
        target = idx;
        break;
      }
    }
    if (target === -1) {
      for (let idx = 0; idx < list.length; idx += 1) {
        const block = list[idx];
        if (!block || !Number.isInteger(block.startLine)) continue;
        if (block.startLine > line) {
          target = idx;
          break;
        }
      }
    }
    if (target === -1 && list.length > 0) target = list.length - 1;
    if (target === -1) {
      unplaced.push(...comments);
    } else {
      if (!byIndex.has(target)) byIndex.set(target, []);
      byIndex.get(target).push(...comments);
    }
  }
  return { byIndex, unplaced };
};

/***
 * MARK: blockIndexForLine
 * @description Index of the block a single source line belongs to under the
 *   same rule as `groupThreadsByBlock`: containing span first, else the
 *   nearest following block, else the last block, else -1 when empty.
 *   Used to dock the open composer under its block in the reading view.
 * @param {Array<Object>} blocks - Parsed blocks with `startLine`/`endLine`.
 * @param {number} line - 1-based source line number.
 * @returns {number} Block index or -1.
 * @example blockIndexForLine([{ startLine: 3, endLine: 4 }], 2) => 0
 ***/
export const blockIndexForLine = (blocks, line) => {
  const list = Array.isArray(blocks) ? blocks : [];
  if (!Number.isInteger(line) || list.length === 0) return -1;
  for (let idx = 0; idx < list.length; idx += 1) {
    const block = list[idx];
    if (!block || !Number.isInteger(block.startLine) || !Number.isInteger(block.endLine)) continue;
    if (line >= block.startLine && line <= block.endLine) return idx;
  }
  for (let idx = 0; idx < list.length; idx += 1) {
    const block = list[idx];
    if (!block || !Number.isInteger(block.startLine)) continue;
    if (block.startLine > line) return idx;
  }
  return list.length - 1;
};

/***
 * MARK: describeBlockKind
 * @description Short human label for a parsed block type, used in
 *   comment-button `aria-label`s (e.g. "code block", "ordered list").
 * @param {Object} block - Parsed block with a `type`.
 * @returns {string} Human label (never empty).
 * @example describeBlockKind({ type: 'h2' }) => 'heading'
 ***/
export const describeBlockKind = (block) => {
  const type = block?.type;
  if (typeof type === 'string' && /^h[1-6]$/.test(type)) return 'heading';
  switch (type) {
    case 'p':
      return 'paragraph';
    case 'code':
      return 'code block';
    case 'ul':
      return 'list';
    case 'ol':
      return 'ordered list';
    case 'blockquote':
      return 'quote';
    case 'table':
      return 'table';
    case 'hr':
      return 'section divider';
    default:
      return 'section';
  }
};

/***
 * MARK: blockLineLabel
 * @description Compact source-line chip text for a block: `L12` for a
 *   single line, `L12–14` for a span. Keeps traceability without
 *   per-line gutters in the reading view.
 * @param {Object} block - Parsed block with `startLine`/`endLine`.
 * @returns {string} Chip text (empty when the block has no span).
 * @example blockLineLabel({ startLine: 12, endLine: 14 }) => 'L12–14'
 ***/
export const blockLineLabel = (block) => {
  if (!block || !Number.isInteger(block.startLine) || !Number.isInteger(block.endLine)) return '';
  if (block.startLine === block.endLine) return `L${block.startLine}`;
  return `L${block.startLine}–${block.endLine}`;
};
