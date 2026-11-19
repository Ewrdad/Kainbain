// Domain: The Work — per-pipeline base branch resolution.
import {
	branchExists,
	createBranch,
	defaultBranch,
	git,
	hasCommits,
	hasRemote,
	isGitRepository,
	isValidBranchName,
	pushBranchIfRemote,
} from "../git.js";

/***
 * MARK: normalizeBaseBranchName
 * @description Trims a configured base-branch name; blank and non-string
 *   values normalize to null (meaning "no override — use the repo default").
 * @example normalizeBaseBranchName('  feature/x  ') => 'feature/x'
 * @example normalizeBaseBranchName('   ') => null
 * @param {*} value - Raw configured value.
 * @returns {string|null} Trimmed name, or null when empty.
 ***/
export const normalizeBaseBranchName = (value) => {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
};

/***
 * MARK: resolveTaskBaseBranch
 * @description Resolves the branch a task's pipeline treats as its main
 *   branch: the task's pinned snapshot first, then the pipeline's live
 *   setting, then the repository default. Invalid names fall through to
 *   the next level (write paths validate loudly; reads stay tolerant).
 * @example await resolveTaskBaseBranch({ task: { baseBranch: 'feature/x' }, repoDefault: 'main' }) => { branch: 'feature/x', source: 'task' }
 * @param {Object} [opts]
 * @param {Object} [opts.task] - Task entity (pinned `baseBranch`, `workflowId`).
 * @param {Object} [opts.workflow] - Pipeline record (live `baseBranch`); looked up from the store when omitted.
 * @param {Object} [opts.projectStore] - Project store for the workflow lookup.
 * @param {string} [opts.projectId] - Project id for the pipeline lookup.
 * @param {string} [opts.cwd] - Project checkout for the repo-default fallback.
 * @param {string} [opts.repoDefault] - Injected repo default (tests, callers that already resolved it).
 * @returns {Promise<{branch: string|null, source: 'task'|'workflow'|'repo'}>} Null branch when nothing resolves (fail-loud callers own the error).
 ***/
export const resolveTaskBaseBranch = async ({
	task = null,
	workflow = null,
	projectStore = null,
	projectId = null,
	cwd = null,
	repoDefault = null,
} = {}) => {
	const pinned = normalizeBaseBranchName(task?.baseBranch);
	if (pinned && isValidBranchName(pinned)) {
		return { branch: pinned, source: "task" };
	}
	let liveWorkflow = workflow;
	if (!liveWorkflow && projectStore && typeof projectStore.getWorkflow === "function") {
		try {
			liveWorkflow = projectStore.getWorkflow(projectId, task?.workflowId) || null;
		} catch {
			liveWorkflow = null;
		}
	}
	const live = normalizeBaseBranchName(liveWorkflow?.baseBranch);
	if (live && isValidBranchName(live)) {
		return { branch: live, source: "workflow" };
	}
	const injected = normalizeBaseBranchName(repoDefault);
	if (injected && isValidBranchName(injected)) {
		return { branch: injected, source: "repo" };
	}
	if (typeof cwd === "string" && cwd) {
		try {
			const resolved = await defaultBranch(cwd);
			if (resolved && isValidBranchName(resolved)) {
				return { branch: resolved, source: "repo" };
			}
		} catch {
			// Fall through to the null below — inventing 'main' here would
			// silently run callers on the wrong branch (fail-loud rule).
		}
	}
	return { branch: null, source: "repo" };
};

/***
 * MARK: ensureBaseBranchExists
 * @description Auto-creates a missing pipeline base branch (the q3 survey
 *   decision): adopts `origin/<base>` when the remote already has it (a
 *   teammate's pushed feature branch), otherwise forks it from the repo
 *   default tip and pushes best-effort so remote runners see
 *   `origin/<base>`. Never throws for git states: every failure resolves
 *   to a skipped result and the caller proceeds with the base name
 *   (missing refs then fail loudly on their own path).
 * @example await ensureBaseBranchExists('/repo', 'feature/x') => { branch: 'feature/x', created: true, pushed: false }
 * @param {string} cwd - Project checkout.
 * @param {string} baseBranch - Base branch name to ensure.
 * @returns {Promise<{branch: string, created: boolean, existed: boolean, pushed: boolean, from: string|null, skipped: string|null, detail: string|null}>}
 ***/
export const ensureBaseBranchExists = async (cwd, baseBranch) => {
	const done = (partial) => ({
		branch: typeof baseBranch === "string" ? baseBranch : null,
		created: false,
		existed: false,
		pushed: false,
		from: null,
		skipped: null,
		detail: null,
		...partial,
	});
	const base = normalizeBaseBranchName(baseBranch);
	if (!base || !isValidBranchName(base)) {
		return done({ skipped: "invalid-name" });
	}
	let repo = false;
	try {
		repo = await isGitRepository(cwd);
	} catch {
		repo = false;
	}
	if (!repo) return done({ branch: base, skipped: "no-git" });
	try {
		if (await branchExists(cwd, base)) {
			return done({ branch: base, existed: true });
		}
	} catch {
		return done({ branch: base, skipped: "ref-read-failed" });
	}
	let repoDefault = null;
	try {
		repoDefault = await defaultBranch(cwd);
	} catch {
		repoDefault = null;
	}
	if (base === repoDefault) {
		return done({ branch: base, skipped: "is-repo-default" });
	}
	let startPoint = null;
	try {
		// Adopt before forking: a teammate may have pushed the feature
		// branch already, in which case the local base must start from
		// the remote tip — forking from the repo default instead would
		// strand the remote-only commits off the base.
		if (await hasRemote(cwd, "origin").catch(() => false)) {
			try {
				await git(cwd, ["fetch", "origin"]);
			} catch {
				// A failed fetch only means adoption is unavailable; the
				// fork below still runs.
			}
			try {
				const { stdout } = await git(cwd, ["rev-parse", "--verify", `origin/${base}`]);
				if (stdout.trim()) startPoint = `origin/${base}`;
			} catch {
				// No remote base — fall through to the fork below.
			}
		}
		if (!startPoint && repoDefault) {
			if (await branchExists(cwd, repoDefault).catch(() => false)) {
				startPoint = repoDefault;
			} else {
				// A checkout with no local default yet (fresh clone) can
				// still fork from the remote default fetched above.
				try {
					const { stdout } = await git(cwd, ["rev-parse", "--verify", `origin/${repoDefault}`]);
					if (stdout.trim()) startPoint = `origin/${repoDefault}`;
				} catch {
					// No remote default either — HEAD fallback below.
				}
			}
		}
		if (!startPoint && (await hasCommits(cwd).catch(() => false))) {
			startPoint = "HEAD";
		}
	} catch {
		startPoint = null;
	}
	if (!startPoint) {
		return done({ branch: base, skipped: "no-commits" });
	}
	try {
		const res = await createBranch(cwd, base, { startPoint });
		if (res?.created !== true) {
			return done({ branch: base, existed: true });
		}
	} catch (e) {
		// Tolerate the create race (a sibling created it first).
		try {
			if (await branchExists(cwd, base)) {
				return done({ branch: base, existed: true });
			}
		} catch {
			// Fall through to the failure result below.
		}
		return done({ branch: base, skipped: "create-failed", detail: e?.message || String(e) });
	}
	// An adopted base already matches the remote tip — nothing to push.
	const adopted = startPoint === `origin/${base}`;
	let pushed = false;
	let pushDetail = null;
	if (!adopted) {
		try {
			const pushRes = await pushBranchIfRemote(cwd, base);
			pushed = pushRes?.pushed === true;
			if (!pushed && pushRes?.skipped && pushRes.skipped !== "no-remote") {
				pushDetail = pushRes.skipped;
			}
		} catch (e) {
			pushDetail = e?.message || String(e);
		}
	}
	return done({ branch: base, created: true, pushed, from: startPoint, detail: pushDetail });
};

/***
 * MARK: ensureTaskBaseBranch
 * @description Resolves a task's pipeline base branch and auto-creates it
 *   when a pipeline base is configured but missing (the q3 survey
 *   decision). Tasks on the repo default skip the ensure entirely, so
 *   unconfigured pipelines behave and cost exactly as before. Reports a
 *   creation through `onCreated` so the caller can audit it in its own
 *   words; never throws for git states.
 * @example await ensureTaskBaseBranch(store, task, '/repo') => { branch: 'main', source: 'repo', created: false }
 * @param {Object} taskStore - TaskStore instance (carries the projectStore for the live lookup).
 * @param {Object} task - The task entity (pinned `baseBranch`, `workflowId`).
 * @param {string} cwd - Project checkout.
 * @param {Object} [opts]
 * @param {Function} [opts.onCreated] - Called with the creation detail string when the base is auto-created.
 * @returns {Promise<{branch: string|null, source: 'task'|'workflow'|'repo', created: boolean, from: string|null}>}
 ***/
export const ensureTaskBaseBranch = async (taskStore, task, cwd, opts = {}) => {
	const { branch, source } = await resolveTaskBaseBranch({
		task,
		projectStore: taskStore?.projectStore,
		projectId: task?.projectId,
		cwd,
	});
	if (source === "repo") {
		return { branch, source, created: false, from: null };
	}
	let ensured = null;
	try {
		ensured = await ensureBaseBranchExists(cwd, branch);
	} catch {
		ensured = null;
	}
	if (ensured?.created === true && typeof opts.onCreated === "function") {
		try {
			opts.onCreated(
				`Created base branch '${branch}' from '${ensured.from || "the repo default"}' for this pipeline${ensured.pushed ? " and pushed it to the remote" : ""}`,
			);
		} catch {
			// Audit is best-effort; the branch work above already succeeded.
		}
	}
	return {
		branch,
		source,
		created: ensured?.created === true,
		from: ensured?.from || null,
	};
};
