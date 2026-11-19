// Domain: Separate docs repo — shared constants. The per-function modules
// live in their own files (one-function-per-file); `./docsRepo.js` re-exports
// everything as the barrel.

/***
 * MARK: DOCS_REPO_URL_MAX_LENGTH
 * @description Maximum accepted length for a docs-repo remote URL.
 * @example DOCS_REPO_URL_MAX_LENGTH === 2048
 ***/
export const DOCS_REPO_URL_MAX_LENGTH = 2048;

/***
 * MARK: DOCS_REPO_PATH_MAX_LENGTH
 * @description Maximum accepted length for a docs-repo local checkout path.
 * @example DOCS_REPO_PATH_MAX_LENGTH === 4096
 ***/
export const DOCS_REPO_PATH_MAX_LENGTH = 4096;

/***
 * MARK: DOCS_REPO_BRANCH_MODE_SYNCED
 * @description The only v1 branch mode: the docs repo carries the same
 *   `kb/<taskId>` task branches as the code repo, created/checked out/pushed
 *   together so docs history tracks task history.
 * @example DOCS_REPO_BRANCH_MODE_SYNCED === "synced"
 ***/
export const DOCS_REPO_BRANCH_MODE_SYNCED = "synced";
