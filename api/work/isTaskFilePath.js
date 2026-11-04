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
	let p = repoRelativePath.trim();
	if (!p) return false;
	// Strip leading ./ (git never emits it, but report paths may)
	while (p.startsWith("./")) p = p.slice(2);
	// Normalise prefix to without trailing slash for exact-dir match, then check
	const prefix = docsTasksPrefix.endsWith("/")
		? docsTasksPrefix
		: `${docsTasksPrefix}/`;
	if (p === prefix.slice(0, -1)) return true;
	return p.startsWith(prefix);
}
