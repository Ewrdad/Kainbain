import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/***
 * MARK: listShippedSourceFiles
 * @description Lists every shipped component file under a starting folder:
 *   `.js`/`.jsx` files, excluding test files (`.test.`), story files
 *   (`.stories.`), and dependency/build output (`node_modules`, `dist`).
 *   Shared by the source-scan gates in this folder (focusVisibility,
 *   targetSize, langAttributes) so the "what counts as shipped source" rule
 *   lives in exactly one place — previously each gate carried its own copy
 *   and a rule change had to land three times. Test-only code is allowed to
 *   live here because the gates are the only callers (same precedent as
 *   a11yTestHelpers.js).
 * @example listShippedSourceFiles({ startingFolder: 'frontend/src/a11y' }) => ['.../Announce.jsx', ...]
 * @param {Object} labelledInput - Labelled input (one object, named fields).
 * @param {string} labelledInput.startingFolder - Absolute folder path to walk.
 * @returns {string[]} Absolute paths of shipped source files.
 ***/
export function listShippedSourceFiles({ startingFolder }) {
  const foundFilePaths = [];
  const foldersStillToVisit = [startingFolder];
  while (foldersStillToVisit.length > 0) {
    const currentFolder = foldersStillToVisit.pop();
    for (const entry of readdirSync(currentFolder)) {
      const fullPath = join(currentFolder, entry);
      if (statSync(fullPath).isDirectory()) {
        // Dependency and build output are never shipped source.
        if (entry === 'node_modules' || entry === 'dist') continue;
        foldersStillToVisit.push(fullPath);
      } else if (
        /\.(jsx|js)$/.test(entry) &&
        !/\.test\.(jsx|js)$/.test(entry) &&
        !/\.stories\.(jsx|js)$/.test(entry)
      ) {
        foundFilePaths.push(fullPath);
      }
    }
  }
  return foundFilePaths;
}
