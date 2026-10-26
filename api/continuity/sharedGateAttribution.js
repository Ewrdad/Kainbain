/***
 * MARK: Shared deploy-gate attribution
 * @description Decides whether a failed deploy gate is the TASK's fault or
 *   the PROJECT's: the blocking gates (`canary-e2e`, `final-test-suite`)
 *   run on the shared default-branch workspace as the last step before a
 *   prod swap, with no per-task attribution — so one red shared suite parks
 *   EVERY task's merge-and-deploy, and every parked task re-burns minutes
 *   re-running the same red suite. When the same gate is proven to already
 *   fail on the pristine default branch (keyed by the default-branch SHA),
 *   the failure is classified `project-blocker`: the task parks with a
 *   reason that names the red branch (no task change can pass until the
 *   suite is fixed), the transient-retry budget is untouched, and only ONE
 *   project-level alert fires per gate@sha (no per-task storm).
 *
 *   Evidence comes from two sources, both keyed by gate@sha and both read
 *   through `resolveSharedGateProbe`:
 *     1. `store.sharedGateProbes` — an explicit cached probe, written by
 *        `recordSharedGateProbe` (operator/runbook flow, or a future
 *        per-mainSha health gate). This is the override seam.
 *     2. The deploy history (`store.deployManager.readHistory`) — every
 *        durable deploy record stamps the full git HEAD it ran its gates
 *        against (`headSha`). A record whose `headSha` equals a task's
 *        PRE-merge base and whose failure names the same gate proves the
 *        gate was already red on the tree that task merged onto — the
 *        exact exoneration needed, at zero extra suite cost.
 *
 *   The classifier never claims "main is red" without one of those two
 *   proofs: absent evidence it stays `task-failure` with shared-gate
 *   guidance.
 *
 * Failure contract: every export is total (never throws) on untrusted
 *   input.
 ***/

import { extractGateName } from "./deployFailureReason.js";

/***
 * MARK: SHARED_DEPLOY_GATES
 * @description Gates that run on the shared default-branch workspace (not
 *   the task branch), so their failure implicates the project, not the task.
 ***/
export const SHARED_DEPLOY_GATES = ["canary-e2e", "final-test-suite"];

/***
 * MARK: isSharedDeployGate
 * @description Whether a gate name is a shared/global gate. Total on
 *   untrusted input; matching is case-insensitive on trimmed strings.
 * @example isSharedDeployGate('canary-e2e') => true
 * @param {unknown} gate - Gate name value.
 * @returns {boolean}
 ***/
export function isSharedDeployGate(gate) {
	try {
		if (typeof gate !== "string") return false;
		const name = gate.trim().toLowerCase();
		return SHARED_DEPLOY_GATES.includes(name);
	} catch {
		return false;
	}
}

/***
 * MARK: projectBlockerKey
 * @description Dedupe key for one red shared gate on one default-branch
 *   SHA. Total: malformed input degrades to null (no dedupe).
 * @example projectBlockerKey({ gate: 'canary-e2e', mainSha: 'abc' }) => 'canary-e2e@abc'
 * @param {Object} [args]
 * @returns {string|null}
 ***/
export function projectBlockerKey(args = {}) {
	try {
		const { gate = "", mainSha = "" } = args || {};
		const name = typeof gate === "string" ? gate.trim().toLowerCase() : "";
		const sha = typeof mainSha === "string" ? mainSha.trim() : "";
		if (!name || !sha) return null;
		return `${name}@${sha}`;
	} catch {
		return null;
	}
}

/***
 * MARK: formatProjectBlockerReason
 * @description Human-readable parked reason for a project-blocked task.
 * @example formatProjectBlockerReason({ gate: 'canary-e2e', mainBranch: 'main', mainSha: 'abc123' }) => "…"
 * @param {Object} [args]
 * @returns {string}
 ***/
export function formatProjectBlockerReason(args = {}) {
	try {
		const { gate = "", mainBranch = "", mainSha = "" } = args || {};
		const name = String(gate || "unknown gate").trim() || "unknown gate";
		const branch = String(mainBranch || "the default branch").trim() || "the default branch";
		const sha = String(mainSha || "").trim();
		return (
			`Shared gate '${name}' is failing on ${branch}` +
			(sha ? ` (${sha.slice(0, 12)})` : "") +
			` — no task change will pass until the shared suite is fixed. ` +
			`See site-docs/red-shared-gate.md.`
		);
	} catch {
		return "A shared deploy gate is failing on the default branch — no task change will pass until it is fixed.";
	}
}

/***
 * MARK: attributeSharedGateFailure
 * @description Pure classification of a failed deploy gate. `task-failure`
 *   (the default, including every non-shared gate) means the task owns the
 *   failure; `project-blocker` means the same gate already failed on the
 *   pristine default branch at this mainSha, so the task parks with the
 *   project-blocker reason, its retry budget untouched, under one
 *   project-level alert per gate@sha.
 * @example attributeSharedGateFailure({ gate: 'canary-e2e', taskGateFailed: true, mainGateFailed: true, mainSha: 'abc' }) => { kind: 'project-blocker', … }
 * @param {Object} [args]
 * @param {string} [args.gate] - Failed gate name.
 * @param {boolean} [args.taskGateFailed] - Whether the gate failed for this task.
 * @param {boolean} [args.mainGateFailed] - Whether the same gate failed on pristine main at mainSha.
 * @param {string} [args.mainBranch] - Default branch name.
 * @param {string} [args.mainSha] - Default-branch SHA the probe ran against.
 * @returns {{ kind: string, shared: boolean, preserveBudget: boolean, key: string|null, reason: string|null }}
 ***/
export function attributeSharedGateFailure(args = {}) {
	try {
		const {
			gate = "",
			taskGateFailed = false,
			mainGateFailed = false,
			mainBranch = "",
			mainSha = "",
		} = args || {};
		const shared = isSharedDeployGate(gate);
		if (!shared || taskGateFailed !== true) {
			return {
				kind: "task-failure",
				shared,
				preserveBudget: false,
				key: null,
				reason: null,
			};
		}
		if (mainGateFailed === true) {
			const branch =
				typeof mainBranch === "string" && mainBranch.trim()
					? mainBranch.trim()
					: "main";
			const sha = typeof mainSha === "string" ? mainSha.trim() : "";
			return {
				kind: "project-blocker",
				shared: true,
				preserveBudget: true,
				key: projectBlockerKey({ gate, mainSha: sha }),
				reason: formatProjectBlockerReason({ gate, mainBranch: branch, mainSha: sha }),
			};
		}
		const name =
			typeof gate === "string" && gate.trim() ? gate.trim() : "unknown gate";
		return {
			kind: "task-failure",
			shared: true,
			preserveBudget: false,
			key: null,
			reason:
				`Shared gate '${name}' failed for this task (no red-main probe on record — ` +
				`treating as a task failure; if '${name}' is also red on the default branch, ` +
				`see site-docs/red-shared-gate.md).`,
		};
	} catch {
		return {
			kind: "task-failure",
			shared: false,
			preserveBudget: false,
			key: null,
			reason: null,
		};
	}
}

function probeTable(store) {
	try {
		if (!store || typeof store !== "object") return null;
		if (!store.sharedGateProbes || typeof store.sharedGateProbes !== "object") {
			return null;
		}
		return store.sharedGateProbes;
	} catch {
		return null;
	}
}

/***
 * MARK: recordSharedGateProbe
 * @description Records whether a shared gate passed on the pristine default
 *   branch at a SHA. Backed by `store.sharedGateProbes` (a plain object;
 *   tests inject it, production wires it on the store). Total: a missing
 *   store or malformed args is a no-op returning false.
 * @example recordSharedGateProbe(store, { gate: 'canary-e2e', mainSha: 'abc', passed: false }) => true
 * @param {Object} [store]
 * @param {Object} [args]
 * @returns {boolean} True when recorded.
 ***/
export function recordSharedGateProbe(store, args = {}) {
	try {
		const { gate = "", mainSha = "", passed = false } = args || {};
		const name = typeof gate === "string" ? gate.trim().toLowerCase() : "";
		const sha = typeof mainSha === "string" ? mainSha.trim() : "";
		if (!name || !sha || !isSharedDeployGate(name)) return false;
		if (!store || typeof store !== "object") return false;
		if (!store.sharedGateProbes || typeof store.sharedGateProbes !== "object") {
			store.sharedGateProbes = {};
		}
		store.sharedGateProbes[`${name}@${sha}`] = {
			gate: name,
			mainSha: sha,
			passed: passed === true,
			recordedAt: new Date().toISOString(),
		};
		return true;
	} catch {
		return false;
	}
}

/***
 * MARK: readSharedGateProbe
 * @description Reads the cached pristine-main probe for a gate@sha. Total:
 *   missing data returns null (no evidence), never throws.
 * @example readSharedGateProbe(store, { gate: 'canary-e2e', mainSha: 'abc' }) => { gate, mainSha, passed, recordedAt }
 * @param {Object} [store]
 * @param {Object} [args]
 * @returns {{ gate: string, mainSha: string, passed: boolean, recordedAt: string }|null}
 ***/
export function readSharedGateProbe(store, args = {}) {
	try {
		const { gate = "", mainSha = "" } = args || {};
		const table = probeTable(store);
		if (!table) return null;
		const name = typeof gate === "string" ? gate.trim().toLowerCase() : "";
		const sha = typeof mainSha === "string" ? mainSha.trim() : "";
		if (!name || !sha) return null;
		const probe = table[`${name}@${sha}`];
		if (!probe || typeof probe !== "object" || Array.isArray(probe)) return null;
		return {
			gate: probe.gate || name,
			mainSha: probe.mainSha || sha,
			passed: probe.passed === true,
			recordedAt: typeof probe.recordedAt === "string" ? probe.recordedAt : "",
		};
	} catch {
		return null;
	}
}

/***
 * MARK: SHARED_GATE_HISTORY_LIMIT
 * @description How many trailing deploy-history records the history-derived
 *   probe scans. Bounds the work on a long-lived deploy dir while still
 *   covering a busy afternoon of fleet deploys (the record we need is the
 *   one for the task's own pre-merge base, i.e. the immediately preceding
 *   merge's deploy).
 ***/
export const SHARED_GATE_HISTORY_LIMIT = 200;

/***
 * MARK: findSharedGateFailureInHistory
 * @description Derives a red-gate probe from the durable deploy history.
 *   Every deploy record stamps the full git HEAD it ran its gates against
 *   (`headSha`), so a record that (a) carries the SAME `headSha` as the
 *   pristine tree under test and (b) failed naming the SAME gate proves the
 *   gate was already red on that tree — no extra suite run needed. Returns
 *   `{ passed: false, source: 'history', ... }` for such a record, and null
 *   when there is no evidence (never `passed: true`: a success record does
 *   not name the gate, so its silence is not proof of green). Total: a
 *   missing manager, missing/legacy records, or malformed JSON return null.
 * @example findSharedGateFailureInHistory(store, { gate: 'canary-e2e', mainSha: 'abc' }) => { passed: false, source: 'history' }
 * @param {Object} [store]
 * @param {Object} [args]
 * @param {string} [args.gate] - Failed gate name.
 * @param {string} [args.mainSha] - Pristine default-branch SHA (a task's pre-merge base).
 * @param {number} [args.limit] - Trailing records to scan.
 * @returns {{ gate: string, mainSha: string, passed: boolean, recordedAt: string, source: string, message: string }|null}
 ***/
export function findSharedGateFailureInHistory(store, args = {}) {
	try {
		const {
			gate = "",
			mainSha = "",
			limit = SHARED_GATE_HISTORY_LIMIT,
		} = args || {};
		if (!isSharedDeployGate(gate)) return null;
		const sha = typeof mainSha === "string" ? mainSha.trim().toLowerCase() : "";
		if (!sha) return null;
		const manager = store?.deployManager;
		const history = manager?.readHistory?.();
		if (!Array.isArray(history)) return null;
		const name = gate.trim().toLowerCase();
		const max =
			Number.isInteger(limit) && limit > 0 ? limit : SHARED_GATE_HISTORY_LIMIT;
		const floor = Math.max(0, history.length - max);
		for (let i = history.length - 1; i >= floor; i -= 1) {
			/* eslint-disable-next-line security/detect-object-injection -- i is an array index bounded by history.length */
			const record = history[i];
			if (!record || typeof record !== "object" || Array.isArray(record)) continue;
			const recordSha =
				typeof record.headSha === "string" ? record.headSha.trim().toLowerCase() : "";
			if (!recordSha || recordSha !== sha) continue;
			const failedGate = extractGateName(record.message);
			if (!failedGate || failedGate.trim().toLowerCase() !== name) continue;
			const status =
				typeof record.status === "string" ? record.status.trim().toLowerCase() : "";
			if (status !== "failed") continue;
			return {
				gate: name,
				mainSha: sha,
				passed: false,
				recordedAt:
					typeof record.finishedAt === "string" ? record.finishedAt : "",
				source: "history",
				message: typeof record.message === "string" ? record.message : "",
			};
		}
		return null;
	} catch {
		return null;
	}
}

/***
 * MARK: resolveSharedGateProbe
 * @description Resolves the best available pristine-main probe for a
 *   gate@sha: an explicit cached probe (`recordSharedGateProbe`) wins,
 *   otherwise the deploy history supplies the evidence
 *   (`findSharedGateFailureInHistory`). Returns null when neither proves
 *   anything, which the classifier reads as "no evidence" — never as green.
 *   Total on untrusted input.
 * @example resolveSharedGateProbe(store, { gate: 'canary-e2e', mainSha: 'abc' }) => { passed: false, source: 'history' }
 * @param {Object} [store]
 * @param {Object} [args]
 * @returns {{ gate: string, mainSha: string, passed: boolean, recordedAt: string, source: string, message?: string }|null}
 ***/
export function resolveSharedGateProbe(store, args = {}) {
	try {
		const { gate = "", mainSha = "" } = args || {};
		const explicit = readSharedGateProbe(store, { gate, mainSha });
		if (explicit) return { ...explicit, source: "probe" };
		return findSharedGateFailureInHistory(store, { gate, mainSha });
	} catch {
		return null;
	}
}
