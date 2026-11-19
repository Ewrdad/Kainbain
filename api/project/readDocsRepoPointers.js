// Domain: Docs-repo pointers — tolerant pointer-map read (one function per
// file; see `./docsRepoPointer.js` for the barrel).
import fs from "node:fs";
import { normalizeDocsRepoPointers } from "./normalizeDocsRepoPointers.js";
import { resolveDocsRepoPointersPath } from "./resolveDocsRepoPointersPath.js";

/***
 * MARK: readDocsRepoPointers
 * @description Reads the pointer map. A missing or corrupt file reads as {}
 *   (the scanner then simply finds no docs-repo projects there). Never throws.
 * @example readDocsRepoPointers({ registryFile: '/tmp/none.json' }) => {}
 * @param {Object} [overrides]
 * @param {string} [overrides.registryFile] - Explicit registry path (tests inject).
 * @returns {Object<string, string>}
 ***/
export function readDocsRepoPointers(overrides = {}) {
	const file = resolveDocsRepoPointersPath(overrides);
	try {
		/* eslint-disable security/detect-non-literal-fs-filename */
		if (!fs.existsSync(file)) return {};
		return normalizeDocsRepoPointers(JSON.parse(fs.readFileSync(file, "utf8")));
		/* eslint-enable security/detect-non-literal-fs-filename */
	} catch {
		return {};
	}
}
