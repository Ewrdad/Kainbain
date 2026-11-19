// Domain: Separate docs repo — barrel over the one-function-per-file modules.
// A project may keep ALL KainBain-specific information (task docs, plans,
// reports, and the `.kainbain/` state folder incl. `project.json`) in a
// separate, private git repo ("docs repo") instead of inside the main project
// repo. The main repo then stays free of KainBain traces (stealth use on
// shared/public repos). The single seam is `resolveKainbainHome`: docs/state
// resolvers map (cwd, project) onto the docs-repo checkout when
// `project.docsRepo` is set, and onto `cwd` otherwise (legacy projects behave
// byte-identically).
// @example import { resolveKainbainHome, hasDocsRepo } from './docsRepo.js';

export {
	DOCS_REPO_URL_MAX_LENGTH,
	DOCS_REPO_PATH_MAX_LENGTH,
	DOCS_REPO_BRANCH_MODE_SYNCED,
} from "./docsRepoConstants.js";
export { isValidDocsRepoUrl } from "./isValidDocsRepoUrl.js";
export { isValidDocsRepoLocalPath } from "./isValidDocsRepoLocalPath.js";
export { hasDocsRepo } from "./hasDocsRepo.js";
export { resolveDocsRepoLocalPath } from "./resolveDocsRepoLocalPath.js";
export { docsRepoUrlFor } from "./docsRepoUrlFor.js";
export { resolveKainbainHome } from "./resolveKainbainHome.js";
export { normalizeDocsRepoSettings } from "./normalizeDocsRepoSettings.js";
export { assertValidDocsRepoForWrite } from "./assertValidDocsRepoForWrite.js";
export { assertDocsRepoSeparateFromMain } from "./assertDocsRepoSeparateFromMain.js";
