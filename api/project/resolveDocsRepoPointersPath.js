// Domain: Docs-repo pointers — pointer-file path resolver (one function per
// file; see `./docsRepoPointer.js` for the barrel).
import path from "node:path";
import { resolveRegistryPath } from "../projectRegistry.js";
import { DOCS_REPO_POINTERS_FILENAME } from "./docsRepoPointersFilename.js";

/***
 * MARK: resolveDocsRepoPointersPath
 * @description The active pointer-file path: the directory of the resolved
 *   registry file (explicit override wins, else `KAINBAIN_PROJECTS_REGISTRY_FILE`,
 *   else `~/.kainbain/`) plus `docs-repo-pointers.json`.
 * @example resolveDocsRepoPointersPath({ registryFile: '/tmp/r.json' }) => '/tmp/docs-repo-pointers.json'
 * @param {Object} [overrides]
 * @param {string} [overrides.registryFile] - Explicit registry path (tests inject).
 * @returns {string}
 ***/
export function resolveDocsRepoPointersPath(overrides = {}) {
	return path.join(path.dirname(resolveRegistryPath(overrides)), DOCS_REPO_POINTERS_FILENAME);
}
