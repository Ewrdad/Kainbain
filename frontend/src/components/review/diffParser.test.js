// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff, countChanges, groupCommentsForFile } from './diffParser';

/**
 * MARK: Diff Parser Golden Tests
 * @description Verifies the pure unified-diff → structure parser against
 *   canonical git outputs: context/add/del line numbers, no-newline markers,
 *   rename headers, binary markers, and comment grouping.
 */
describe('diffParser', () => {
  const basicPatch = `diff --git a/src/app.js b/src/app.js
index 1a2b3c4..5d6e7f8 100644
--- a/src/app.js
+++ b/src/app.js
@@ -10,7 +10,9 @@ function render() {
   const a = 1;
-  const b = 2;
+  const b = 3;
+  const c = 4;
   return a;
 }
@@ -40,4 +42,5 @@ function other() {
   keep me
-  drop me
+  changed me
`;

  it('parses hunks with correct headers, starts, and line numbers', () => {
    const parsed = parseUnifiedDiff(basicPatch);
    expect(parsed.isBinary).toBe(false);
    expect(parsed.hasChanges).toBe(true);
    expect(parsed.oldPath).toBe('src/app.js');
    expect(parsed.newPath).toBe('src/app.js');
    expect(parsed.hunks).toHaveLength(2);

    const h1 = parsed.hunks[0];
    expect(h1.oldStart).toBe(10);
    expect(h1.newStart).toBe(10);
    expect(h1.section).toBe('function render() {');
    const context = h1.lines[0];
    expect(context.type).toBe('context');
    expect(context.oldLine).toBe(10);
    expect(context.newLine).toBe(10);
    const del = h1.lines[1];
    expect(del.type).toBe('del');
    expect(del.oldLine).toBe(11);
    expect(del.newLine).toBeNull();
    expect(del.text).toBe('  const b = 2;');
    const add = h1.lines[2];
    expect(add.type).toBe('add');
    expect(add.newLine).toBe(11);
    expect(add.oldLine).toBeNull();
    expect(add.text).toBe('  const b = 3;');
    const add2 = h1.lines[3];
    expect(add2.type).toBe('add');
    expect(add2.newLine).toBe(12);
    expect(add2.text).toBe('  const c = 4;');
    const after = h1.lines[4];
    expect(after.type).toBe('context');
    expect(after.oldLine).toBe(12);
    expect(after.newLine).toBe(13);
  });

  it('counts additions and deletions', () => {
    const parsed = parseUnifiedDiff(basicPatch);
    const { additions, deletions } = countChanges(parsed);
    expect(additions).toBe(3);
    expect(deletions).toBe(2);
  });

  it('handles missing count in hunk header (single line)', () => {
    const patch = `--- a/one.txt
+++ b/one.txt
@@ -1 +1 @@
-old line
+new line
`;
    const parsed = parseUnifiedDiff(patch);
    expect(parsed.hunks).toHaveLength(1);
    expect(parsed.hunks[0].oldStart).toBe(1);
    expect(parsed.hunks[0].oldLines).toBe(1);
    expect(parsed.hunks[0].newStart).toBe(1);
    expect(parsed.hunks[0].lines).toHaveLength(2);
  });

  it('marks no-newline-at-end-of-file on the hunk', () => {
    const patch = `--- a/two.txt
+++ b/two.txt
@@ -1,2 +1,2 @@
 first
-last without newline
+last without newline
\\ No newline at end of file
`;
    const parsed = parseUnifiedDiff(patch);
    expect(parsed.hunks[0].noNewlineAtEnd).toBe(true);
  });

  it('skips rename metadata but keeps paths', () => {
    const patch = `diff --git a/old-name.txt b/new-name.txt
similarity index 80%
rename from old-name.txt
rename to new-name.txt
--- a/old-name.txt
+++ b/new-name.txt
@@ -1,2 +1,2 @@
 context
-moved content
+renamed content
`;
    const parsed = parseUnifiedDiff(patch);
    expect(parsed.oldPath).toBe('old-name.txt');
    expect(parsed.newPath).toBe('new-name.txt');
    expect(parsed.hunks).toHaveLength(1);
    expect(parsed.hunks[0].lines[1].text).toBe('moved content');
  });

  it('flags binary patches', () => {
    const patch = `diff --git a/blob.bin b/blob.bin
index 1234567..89abcde 100644
Binary files a/blob.bin and b/blob.bin differ
`;
    const parsed = parseUnifiedDiff(patch);
    expect(parsed.isBinary).toBe(true);
    expect(parsed.hunks).toEqual([]);
  });

  it('returns empty structure for null/empty input', () => {
    expect(parseUnifiedDiff(null)).toEqual({
      isBinary: false,
      hasChanges: false,
      oldPath: null,
      newPath: null,
      hunks: [],
    });
    expect(parseUnifiedDiff('')).toEqual(parseUnifiedDiff(null));
  });

  it('handles added-file patches with /dev/null source', () => {
    const patch = `--- /dev/null
+++ b/brand-new.txt
@@ -0,0 +1,2 @@
+first
+second
`;
    const parsed = parseUnifiedDiff(patch);
    expect(parsed.oldPath).toBeNull();
    expect(parsed.newPath).toBe('brand-new.txt');
    expect(parsed.hunks[0].lines.every((l) => l.type === 'add')).toBe(true);
    expect(countChanges(parsed)).toEqual({ additions: 2, deletions: 0 });
  });

  it('groups comments by side:line and collects file-level ones', () => {
    const comments = [
      { id: 'c1', filePath: 'src/app.js', scope: 'line', side: 'right', line: 11 },
      { id: 'c2', filePath: 'src/app.js', scope: 'line', side: 'left', line: 11 },
      { id: 'c3', filePath: 'src/app.js', scope: 'file' },
      { id: 'c4', filePath: 'src/other.js', scope: 'line', side: 'right', line: 3 },
    ];
    const grouped = groupCommentsForFile(comments, 'src/app.js');
    expect(grouped.byLine.get('right:11').map((c) => c.id)).toEqual(['c1']);
    expect(grouped.byLine.get('left:11').map((c) => c.id)).toEqual(['c2']);
    expect(grouped.fileLevel.map((c) => c.id)).toEqual(['c3']);
    expect(grouped.byLine.has('right:3')).toBe(false);
  });
});
