/***
 * MARK: diffParser
 * @description Pure unified-diff text → structured hunks/lines for the MR-style
 *   review renderer. No dependencies. Handles `\ No newline at end of file`,
 *   rename headers, binary markers, and hunk section headings.
 * @example parseUnifiedDiff(patchText) => { isBinary, hasChanges, hunks: [...] }
 ***/

/**
 * Parses one unified diff patch into renderable structure.
 *
 * @param {string|null} patch - Unified diff text for one file (from
 *   `git diff <base>...<head> -- <path>`), or null/empty for nothing to render.
 * @returns {{ isBinary: boolean, hasChanges: boolean, hunks: Array<{
 *   header: string, oldStart: number, oldLines: number, newStart: number,
 *   newLines: number, section: string,
 *   lines: Array<{ type: 'context'|'add'|'del', oldLine: number|null,
 *                  newLine: number|null, text: string }>
 * }>, oldPath: string|null, newPath: string|null }}
 ***/
export function parseUnifiedDiff(patch) {
  const empty = {
    isBinary: false,
    hasChanges: false,
    oldPath: null,
    newPath: null,
    hunks: [],
  };
  if (!patch || typeof patch !== 'string') return empty;

  // Binary markers (git renders "Binary files a/x and b/x differ" or
  // "Binary file ... differs" for --no-color output).
  if (/^Binary (files|file)/m.test(patch)) {
    return { ...empty, isBinary: true };
  }

  const hunks = [];
  let oldPath = null;
  let newPath = null;

  let current = null;
  let oldLine = 0;
  let newLine = 0;

  const bodyLines = patch.split('\n');
  for (const [i, raw] of bodyLines.entries()) {
    if (raw.startsWith('@@')) {
      // Format: @@ -<oldStart>[,<oldLines>] +<newStart>[,<newLines>] @@ [section]
      // Parsed manually (no regex) to keep the security linter happy.
      const body = raw.slice(2).trim();
      const endMarker = body.indexOf('@@');
      if (endMarker === -1) continue;
      const ranges = body.slice(0, endMarker).trim().split(/\s+/);
      const section = body.slice(endMarker + 2).trim();
      const parseRange = (value, expectOld) => {
        if (!value) return null;
        const sign = value[0];
        if (expectOld === true && sign !== '-') return null;
        if (expectOld === false && sign !== '+') return null;
        const digits = sign === '-' || sign === '+' ? value.slice(1) : value;
        const comma = digits.indexOf(',');
        const start = parseInt(comma === -1 ? digits : digits.slice(0, comma), 10);
        if (Number.isNaN(start)) return null;
        const count = comma === -1 ? 1 : parseInt(digits.slice(comma + 1), 10);
        if (Number.isNaN(count)) return null;
        return { start, count };
      };
      const oldRange = parseRange(ranges[0], true);
      const newRange = parseRange(ranges[1], false);
      if (!oldRange || !newRange) continue;
      const hunk = {
        header: raw,
        oldStart: oldRange.start,
        oldLines: oldRange.count,
        newStart: newRange.start,
        newLines: newRange.count,
        section,
        lines: [],
      };
      hunks.push(hunk);
      current = hunk;
      oldLine = hunk.oldStart;
      newLine = hunk.newStart;
      continue;
    }

    if (raw.startsWith('--- ')) {
      oldPath = extractPath(raw.slice(4));
      continue;
    }
    if (raw.startsWith('+++ ')) {
      newPath = extractPath(raw.slice(4));
      continue;
    }
    // Rename metadata lines are metadata-only for the renderer.
    if (
      raw.startsWith('diff --git ') ||
      raw.startsWith('index ') ||
      raw.startsWith('new file mode') ||
      raw.startsWith('deleted file mode') ||
      raw.startsWith('old mode') ||
      raw.startsWith('new mode') ||
      raw.startsWith('similarity index') ||
      raw.startsWith('dissimilarity index') ||
      raw.startsWith('rename from') ||
      raw.startsWith('rename to') ||
      raw.startsWith('copy from') ||
      raw.startsWith('copy to')
    ) {
      continue;
    }

    if (!current) {
      // Body text outside any hunk (e.g. truncated or binary leftovers).
      continue;
    }

    if (raw === '\\ No newline at end of file') {
      current.noNewlineAtEnd = true;
      continue;
    }
    if (raw.startsWith('+')) {
      current.lines.push({
        type: 'add',
        oldLine: null,
        newLine: newLine,
        text: raw.slice(1),
      });
      newLine += 1;
    } else if (raw.startsWith('-')) {
      current.lines.push({
        type: 'del',
        oldLine,
        newLine: null,
        text: raw.slice(1),
      });
      oldLine += 1;
    } else if (raw.startsWith(' ')) {
      current.lines.push({
        type: 'context',
        oldLine,
        newLine,
        text: raw.slice(1),
      });
      oldLine += 1;
      newLine += 1;
    } else if (raw === '') {
      // A blank body line inside a hunk is a context line with empty text —
      // but the final segment of split('\n') is just the trailing-newline
      // artifact, not a real line.
      if (i === bodyLines.length - 1) continue;
      current.lines.push({ type: 'context', oldLine, newLine, text: '' });
      oldLine += 1;
      newLine += 1;
    }
  }

  const hasChanges = hunks.some((h) => h.lines.length > 0);
  return { isBinary: false, hasChanges, oldPath, newPath, hunks };
}

/**
 * Extracts a repo-relative path from a git header operand ("a/..." or "b/...").
 * Tolerates quoted operands and timestamp suffixes ("path\t2024-...").
 */
function extractPath(operand) {
  let value = operand.trim();
  // strip possible timestamps after a tab
  const tabIdx = value.indexOf('\t');
  if (tabIdx >= 0) value = value.slice(0, tabIdx);
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      value = JSON.parse(value);
    } catch {
      value = value.slice(1, -1);
    }
  }
  if (value === '/dev/null') return null;
  if (value.startsWith('a/') || value.startsWith('b/')) value = value.slice(2);
  return value || null;
}

/**
 * Builds the per-file +/- line counts from parsed hunks (fast path for the
 * sidebar when the raw patch is already loaded).
 */
export function countChanges(parsed) {
  let additions = 0;
  let deletions = 0;
  for (const hunk of parsed.hunks || []) {
    for (const line of hunk.lines) {
      if (line.type === 'add') additions += 1;
      else if (line.type === 'del') deletions += 1;
    }
  }
  return { additions, deletions };
}

/**
 * Builds a lookup from "filePath|side|line" → comments for the renderer.
 * @param {Array} comments
 * @param {string} filePath
 * @returns {Object} { line: { [lineNumber]: [comment] }, file: [comment] }
 */
export function groupCommentsForFile(comments, filePath) {
  const byLine = new Map();
  const fileLevel = [];
  for (const c of comments || []) {
    if (c.filePath !== filePath) continue;
    if (c.scope === 'file' || c.line === null || c.line === undefined) {
      fileLevel.push(c);
    } else {
      const key = `${c.side || 'right'}:${c.line}`;
      if (!byLine.has(key)) byLine.set(key, []);
      byLine.get(key).push(c);
    }
  }
  return { byLine, fileLevel };
}
