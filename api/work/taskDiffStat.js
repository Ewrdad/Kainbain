// Domain: The Work — lines-changed snapshot for task history badges.
import { diffRangeNumstat, git, defaultBranch } from "../git.js";
import { diffFiles } from "../reviewDiff.js";
import { resolveTaskBranch } from "./taskBranches.js";

/***
 * MARK: summarizeDiffStat
 * @description Adds up per-file addition/deletion counts (as returned by
 *   diffFiles) into the two totals shown on a history badge. Binary rows
 *   carry no countable lines, so they contribute 0. Returns null when there
 *   is nothing countable (empty diff, or binary-only), meaning "no badge".
 * @example summarizeDiffStat([{ additions: 5, deletions: 2 }, { additions: 0, deletions: 0, binary: true }]) => { additions: 5, deletions: 2 }
 * @example summarizeDiffStat([]) => null
 * @param {Array<Object>} [files] - Per-file diff rows.
 * @returns {{ additions: number, deletions: number }|null} Totals, or null when uncountable.
 ***/
export function summarizeDiffStat(files) {
	if (!Array.isArray(files) || files.length === 0) return null;
	let countable = 0;
	let additions = 0;
	let deletions = 0;
	for (const file of files) {
		if (!file || typeof file !== "object") continue;
		if (file.binary) continue;
		countable += 1;
		if (Number.isInteger(file.additions) && file.additions > 0) {
			additions += file.additions;
		}
		if (Number.isInteger(file.deletions) && file.deletions > 0) {
			deletions += file.deletions;
		}
	}
	if (countable === 0) return null;
	return { additions, deletions };
}

/***
 * MARK: parseNumstatStdout
 * @description Parses `git diff --numstat` output into diffFiles-shaped rows
 *   (no base/head refs involved). Binary files show `-` instead of counts
 *   and become `{ binary: true }` rows.
 * @example parseNumstatStdout("10\t2\tsrc/a.js\n-\t-\timg.png\n") => [{ path: 'src/a.js', additions: 10, deletions: 2, binary: false }, ...]
 * @param {string} [stdout] - Raw numstat output.
 * @returns {Array<Object>} Parsed rows.
 ***/
export function parseNumstatStdout(stdout) {
	const rows = [];
	for (const line of String(stdout || "").split("\n")) {
		if (!line.trim()) continue;
		const parts = line.split("\t");
		if (parts.length < 3) continue;
		const binary = parts[0] === "-" || parts[1] === "-";
		const parsedAdditions = Number.parseInt(parts[0], 10);
		const parsedDeletions = Number.parseInt(parts[1], 10);
		let filePath = parts.slice(2).join("\t");
		let oldPath = null;
		if (filePath.includes(" => ")) {
			const arrow = filePath.lastIndexOf(" => ");
			oldPath = filePath.slice(0, arrow);
			filePath = filePath.slice(arrow + 4);
		}
		rows.push({
			path: filePath,
			oldPath,
			status: "modified",
			additions:
				binary || !Number.isInteger(parsedAdditions) ? 0 : parsedAdditions,
			deletions:
				binary || !Number.isInteger(parsedDeletions) ? 0 : parsedDeletions,
			binary,
		});
	}
	return rows;
}

/***
 * MARK: defaultWorkingTreeDiff
 * @description Measures uncommitted plus staged working-tree changes against
 *   HEAD (`git diff --numstat HEAD`). The non-branch-mode fallback for tasks
 *   that work directly on a single branch, where no task branch exists to
 *   diff against.
 * @example await defaultWorkingTreeDiff('/repo') => [{ path: 'src/a.js', additions: 10, deletions: 2, ... }]
 * @param {string} cwd - Project working directory.
 * @returns {Promise<Array<Object>>} Per-file rows (may be empty).
 ***/
export async function defaultWorkingTreeDiff(cwd) {
	const { stdout } = await git(
		cwd,
		["diff", "--numstat", "--no-color", "HEAD"],
		{ timeout: 15000 },
	);
	return parseNumstatStdout(stdout);
}

/***
 * MARK: computeStageDelta
 * @description Derives the lines changed during one stage from two cumulative
 *   snapshots: the total observed when the stage was entered (baseline) and
 *   the total observed when it closed. Each field subtracts independently and
 *   clamps at 0, so rewritten history (rebase/amend dropping the cumulative
 *   total below the baseline) renders as `+0 -0` instead of a negative badge.
 *   Either side null/uncountable means "unknown", resolving to null so the
 *   row renders no badge — distinguishable from a genuine `+0 -0` no-op stage.
 * @example computeStageDelta({ additions: 1000, deletions: 5 }, { additions: 1000, deletions: 5 }) => { additions: 0, deletions: 0 }
 * @example computeStageDelta({ additions: 3, deletions: 1 }, null) => null
 * @param {{ additions: number, deletions: number }|null} [current] - Cumulative total now.
 * @param {{ additions: number, deletions: number }|null} [baseline] - Cumulative total at stage entry.
 * @returns {{ additions: number, deletions: number }|null} Per-stage delta, or null when unknown.
 ***/
export function computeStageDelta(current, baseline) {
	if (!current || !baseline) return null;
	const { additions: currentAdditions, deletions: currentDeletions } = current;
	const { additions: baselineAdditions, deletions: baselineDeletions } = baseline;
	for (const value of [
		currentAdditions,
		currentDeletions,
		baselineAdditions,
		baselineDeletions,
	]) {
		if (!Number.isInteger(value) || value < 0) return null;
	}
	return {
		additions: Math.max(0, currentAdditions - baselineAdditions),
		deletions: Math.max(0, currentDeletions - baselineDeletions),
	};
}

/***
 * MARK: getTaskDiffStat
 * @description Best-effort cumulative diff size for a task at this moment, for
 *   the `+N -M` history badge. In branch mode it totals the three-dot branch
 *   diff (the same base the review view uses, so badges agree with it);
 *   otherwise it totals the working tree against HEAD. Never throws: any git
 *   failure, unknown ref, or uncountable diff resolves to null ("no badge").
 *   Callers turn this cumulative snapshot into a per-stage badge via
 *   computeStageDelta against the stage-entry baseline.
 * @example await getTaskDiffStat('/repo', task, { useBranches: true }) => { additions: 12, deletions: 3 }
 * @param {string} cwd - Project working directory.
 * @param {Object} task - The task entity (branch resolved from it).
 * @param {Object} [opts]
 * @param {boolean} [opts.useBranches=false] - Whether the project uses per-task branches.
 * @param {Function} [opts.diffFilesFn] - Injectable branch-diff reader (tests).
 * @param {Function} [opts.defaultBranchFn] - Injectable default-branch resolver (tests).
 * @param {Function} [opts.workingTreeDiffFn] - Injectable worktree reader (tests).
 * @returns {Promise<{ additions: number, deletions: number }|null>} Totals, or null when unknown.
 ***/
export async function getTaskDiffStat(
	cwd,
	task,
	{
		useBranches = false,
		diffFilesFn = diffFiles,
		defaultBranchFn = defaultBranch,
		workingTreeDiffFn = defaultWorkingTreeDiff,
	} = {},
) {
	try {
		if (!cwd || !task) return null;
		let files;
		if (useBranches) {
			const base = await defaultBranchFn(cwd);
			const head = resolveTaskBranch(task);
			if (!base || !head) return null;
			files = await diffFilesFn(cwd, base, head);
		} else {
			files = await workingTreeDiffFn(cwd);
		}
		return summarizeDiffStat(files);
	} catch {
		return null;
	}
}

/***
 * MARK: filesToRangeStat
 * @description Totals per-file rows for one measured commit range. An empty
 *   row list is a measured no-op (`+0 -0`); rows with no countable lines
 *   (binary-only) resolve to null ("no badge"), matching summarizeDiffStat.
 * @example filesToRangeStat([]) => { additions: 0, deletions: 0 }
 * @param {Array<Object>} [files] - Per-file diff rows.
 * @returns {{ additions: number, deletions: number }|null} Totals, or null when uncountable.
 ***/
export function filesToRangeStat(files) {
	if (!Array.isArray(files)) return null;
	if (files.length === 0) return { additions: 0, deletions: 0 };
	return summarizeDiffStat(files);
}

/***
 * MARK: getCommitRangeDiffStat
 * @description Measures the lines changed inside an explicit commit range
 *   `baseSha..headSha` (two-dot: commits reachable from headSha but not
 *   baseSha), so each stage owns exactly its own commit range independent of
 *   cumulative branch totals or queue timing. Returns { additions, deletions }
 *   for a measured range (including an honest +0 -0 for an empty range), or
 *   null for an unknown/invalid diff. Never throws: any git failure resolves
 *   to null ("no badge"), never a misleading zero.
 * @example await getCommitRangeDiffStat('/repo', sha1, sha2) => { additions: 12, deletions: 3 }
 * @param {string} cwd - Project working directory.
 * @param {string} baseSha - Range start SHA (exclusive).
 * @param {string} headSha - Range end SHA (inclusive).
 * @param {Object} [opts]
 * @param {Function} [opts.rangeFilesFn] - Injectable per-file reader
 *   `(cwd, baseSha, headSha) => files[]` for tests. Accepts the same row
 *   shape as `diffFiles`.
 * @param {Function} [opts.gitFn] - Injectable
 *   `(cwd, fromSha, toSha, opts) => { stdout }` range runner for tests.
 *   Defaults to the shared `diffRangeNumstat` helper.
 * @param {number} [opts.timeout] - Git timeout in ms.
 * @returns {Promise<{ additions: number, deletions: number }|null>} Totals, or null when unknown.
 ***/
export async function getCommitRangeDiffStat(cwd, baseSha, headSha, opts = {}) {
	if (
		typeof cwd !== "string" ||
		!cwd.trim() ||
		typeof baseSha !== "string" ||
		!baseSha.trim() ||
		typeof headSha !== "string" ||
		!headSha.trim()
	) {
		return null;
	}
	try {
		if (typeof opts.rangeFilesFn === "function") {
			return filesToRangeStat(
				await opts.rangeFilesFn(cwd, baseSha.trim(), headSha.trim()),
			);
		}
		const runRangeDiff =
			typeof opts.gitFn === "function" ? opts.gitFn : diffRangeNumstat;
		const { stdout } = await runRangeDiff(
			cwd,
			baseSha.trim(),
			headSha.trim(),
			{ timeout: opts.timeout || 15000 },
		);
		// Empty stdout means a measured empty range (unchanged), distinct
		// from a git failure which throws above.
		if (!String(stdout || "").trim()) {
			return { additions: 0, deletions: 0 };
		}
		return summarizeDiffStat(parseNumstatStdout(stdout));
	} catch {
		return null;
	}
}
