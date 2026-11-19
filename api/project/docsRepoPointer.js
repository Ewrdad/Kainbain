// Domain: Docs-repo pointers — barrel over the one-function-per-file
// modules. Engine-global map from a project's main checkout (`cwd`) to its
// separate docs-repo checkout (`docsRepo.localPath`). A project whose
// KainBain home lives in the docs repo keeps ZERO KainBain files in the main
// repo (stealth), so the scanner cannot find a `project.json` there; this
// pointer (stored engine-globally, next to the projects registry — never
// inside the main repo) lets `_loadProjectFile` rediscover the config at
// `<docsRepo.localPath>/.kainbain/project.json`. The file is advisory:
// missing/corrupt degrades to an empty map, never a broken boot. Writes are
// atomic (temp file + rename).
// @example import { rememberDocsRepoPointer, docsRepoPointerFor } from './docsRepoPointer.js';

export { DOCS_REPO_POINTERS_FILENAME } from "./docsRepoPointersFilename.js";
export { resolveDocsRepoPointersPath } from "./resolveDocsRepoPointersPath.js";
export { normalizeDocsRepoPointers } from "./normalizeDocsRepoPointers.js";
export { readDocsRepoPointers } from "./readDocsRepoPointers.js";
export { writeDocsRepoPointers } from "./writeDocsRepoPointers.js";
export { rememberDocsRepoPointer } from "./rememberDocsRepoPointer.js";
export { removeDocsRepoPointer } from "./removeDocsRepoPointer.js";
export { docsRepoPointerFor } from "./docsRepoPointerFor.js";
