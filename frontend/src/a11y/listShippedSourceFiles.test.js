// @vitest-environment node
// Covers listShippedSourceFiles: the "what counts as shipped source" rule
// shared by the focusVisibility / targetSize / langAttributes gates.
// Uses a real temp folder (not the repo tree) so the tests stay hermetic.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { listShippedSourceFiles } from './listShippedSourceFiles.js';

let scratchFolder;

beforeEach(() => {
  scratchFolder = mkdtempSync(join(tmpdir(), 'shipped-source-'));
});

afterEach(() => {
  rmSync(scratchFolder, { recursive: true, force: true });
});

describe('listShippedSourceFiles', () => {
  it('lists shipped .js/.jsx files (negative control: known set)', () => {
    writeFileSync(join(scratchFolder, 'Button.jsx'), 'x');
    writeFileSync(join(scratchFolder, 'colours.js'), 'x');
    const found = listShippedSourceFiles({ startingFolder: scratchFolder });
    expect(found.map((file) => basename(file)).sort()).toEqual(['Button.jsx', 'colours.js']);
  });

  it('excludes test and story files (negative control)', () => {
    writeFileSync(join(scratchFolder, 'Button.jsx'), 'x');
    writeFileSync(join(scratchFolder, 'Button.test.jsx'), 'x');
    writeFileSync(join(scratchFolder, 'Button.stories.js'), 'x');
    writeFileSync(join(scratchFolder, 'helpers.test.js'), 'x');
    const found = listShippedSourceFiles({ startingFolder: scratchFolder });
    expect(found.map((file) => basename(file))).toEqual(['Button.jsx']);
  });

  it('descends into subfolders but skips node_modules and dist', () => {
    mkdirSync(join(scratchFolder, 'nested'));
    writeFileSync(join(scratchFolder, 'nested', 'Deep.jsx'), 'x');
    mkdirSync(join(scratchFolder, 'node_modules'));
    writeFileSync(join(scratchFolder, 'node_modules', 'Vendor.js'), 'x');
    mkdirSync(join(scratchFolder, 'dist'));
    writeFileSync(join(scratchFolder, 'dist', 'Bundle.js'), 'x');
    const found = listShippedSourceFiles({ startingFolder: scratchFolder });
    expect(found.map((file) => basename(file))).toEqual(['Deep.jsx']);
  });

  it('returns an empty list for an empty folder (fail-safe: no crash)', () => {
    expect(listShippedSourceFiles({ startingFolder: scratchFolder })).toEqual([]);
  });
});
