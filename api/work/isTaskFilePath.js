/***
 * MARK: isTaskFilePath
 * @description Returns true when repoRelativePath is inside <docsDirName>/tasks/
 *   (e.g. docs/tasks/<id>/task.md). Handles leading ./, posix normalisation,
 *   and the exact dir without trailing slash. Prefix must include trailing slash
 *   like docsTasksIgnorePath() returns. Pure, no I/O.
 * @example isTaskFilePath('docs/tasks/t1/task.md', 'docs/tasks/') => true
 * @example isTaskFilePath('docs/other.md', 'docs/tasks/') => false
 * @example isTaskFilePath('./docs/tasks/t1/report.md', 'docs/tasks/') => true
 * @example isTaskFilePath('k-docs/tasks/t1/plan.md', 'k-docs/tasks/') => true
 * @param {string} repoRelativePath
 * @param {string} docsTasksPrefix - e.g. 'docs/tasks/' or 'k-docs/tasks/'
 * @returns {boolean}
 ***/
export function isTaskFilePath(repoRelativePath, docsTasksPrefix) {
	if (typeof repoRelativePath !== "string" || !repoRelativePath) return false;
	if (typeof docsTasksPrefix !== "string" || !docsTasksPrefix) return false;
	// Normalise report-style paths (`./`, backslashes on Windows) to the
	// same repo-relative posix form git emits before comparing. Keeping this
	// tolerant costs nothing and guards against a future path-style change.
	let p = String(repoRelativePath).trim().replace(/\\/g, "/");
	if (!p) return false;
	while (p.startsWith("./")) p = p.slice(2);
	// Accept the prefix with or without its trailing slash so callers can
	// pass either `docsTasksIgnorePath()` output or a bare dir name.
	const prefix = docsTasksPrefix.endsWith("/")
		? docsTasksPrefix
		: `${docsTasksPrefix}/`;
	const normalizedPrefix = prefix.replace(/\\/g, "/");
	const parent = normalizedPrefix.slice(0, -1);
	if (p === parent) return true;
	return p.startsWith(normalizedPrefix);
}
