/***
 * MARK: Deploy stage failure context
 * @description One place that turns a failed deploy-like stage into (a) the
 *   engine-renderable cause and (b) the shared-gate verdict, so the two paths
 *   that can park a deploy failure agree on the reason, the structured alert
 *   fields, and the project-blocker dedupe key:
 *     1. The live stage run (`commandStages.runCommandStage`).
 *     2. Post-restart reconciliation (`taskScheduler.reconcileInterruptedDeploys`)
 *        — a prod deploy restarts the API, so a failure that settles around a
 *        restart must report exactly like a live one instead of a bare
 *        "exit 1" (continuation of operations).
 *
 *   `resolveDeployFailureContext` composes the pure resolvers:
 *   `resolveDeployStageFailure` (durable deploy records → cause) and
 *   `resolveSharedGateProbe` + `attributeSharedGateFailure` (pristine-main
 *   evidence → project-blocker). It reads the PRE-merge base SHA
 *   (`task.preMergeMainSha`) for the attribution because the current
 *   default-branch HEAD already contains this task's merge and could never
 *   exonerate it. Every step is best-effort: a git failure or malformed store
 *   degrades to a plain task failure, never to a thrown error on the failure
 *   path.
 *
 * Failure contract: `resolveDeployFailureContext` never throws; it returns
 *   null for non-deploy stages or unreadable input.
 ***/

import { defaultBranch } from "../git.js";
import { resolveSha } from "../reviewDiff.js";
import { resolveDeployBaseSha } from "./deployMarkers.js";
import { resolveDeployStageFailure } from "./deployFailureReason.js";
import {
	attributeSharedGateFailure,
	isSharedDeployGate,
	resolveSharedGateProbe,
} from "./sharedGateAttribution.js";

/***
 * MARK: resolveDeployFailureContext
 * @description Resolves the full failure context for a failed deploy-like
 *   stage: the durable cause (`failure`) plus the shared-gate verdict
 *   (`projectBlocker` for a proven red shared gate, else
 *   `sharedGateGuidance`). Returns null for non-deploy stages so callers can
 *   call it unconditionally. Total: never throws.
 * @example resolveDeployFailureContext(store, { task, stage, exitCode: 1, command: './deploy.sh --prod', cwd }) => { failure, projectBlocker, sharedGateGuidance }
 * @param {Object} [store] - Task store (`deployManager` seam).
 * @param {Object} [args]
 * @param {Object} [args.task] - Task entity.
 * @param {Object} [args.stage] - Stage record.
 * @param {number} [args.exitCode] - Process exit code.
 * @param {string} [args.command] - Command that failed.
 * @param {string} [args.cwd] - Project working directory (for the SHA fallback).
 * @returns {{ failure: Object, projectBlocker: Object|null, sharedGateGuidance: string }|null}
 ***/
export async function resolveDeployFailureContext(store, args = {}) {
	try {
		const {
			task = null,
			stage = null,
			exitCode = 1,
			command = "",
			cwd = "",
		} = args || {};
		const failure = resolveDeployStageFailure(store, {
			task,
			stage,
			exitCode,
			command,
		});
		if (!failure) return null;

		let projectBlocker = null;
		let sharedGateGuidance = "";
		try {
			if (failure.gate && isSharedDeployGate(failure.gate)) {
				const branchName =
					(cwd ? await defaultBranch(cwd).catch(() => "") : "") || "main";
				// `resolveDeployBaseSha` reads the live pre-merge marker OR the
				// frozen review baseline's `mainSha`: after the merge/deploy split
				// a standalone deploy stage runs once the merge has consumed
				// `preMergeMainSha`, and the baseline carries the exact same SHA.
				// Without the fallback the probe would read the post-merge HEAD
				// (which already contains this task's merge) as "pristine main".
				const preMergeSha = resolveDeployBaseSha(task) || "";
				const sha =
					preMergeSha ||
					(cwd
						? (await resolveSha(cwd, branchName).catch(() => null)) || ""
						: "");
				const probe = sha
					? resolveSharedGateProbe(store, { gate: failure.gate, mainSha: sha })
					: null;
				const verdict = attributeSharedGateFailure({
					gate: failure.gate,
					taskGateFailed: true,
					mainGateFailed: probe ? probe.passed === false : false,
					mainBranch: branchName,
					mainSha: sha,
				});
				if (verdict.kind === "project-blocker") {
					projectBlocker = {
						gate: String(failure.gate),
						mainBranch: branchName,
						mainSha: String(sha || ""),
						key: String(verdict.key || ""),
						reason: String(verdict.reason || ""),
					};
				} else if (verdict.reason) {
					sharedGateGuidance = verdict.reason;
				}
			}
		} catch {
			projectBlocker = null;
			sharedGateGuidance = "";
		}

		return { failure, projectBlocker, sharedGateGuidance };
	} catch {
		return null;
	}
}

/***
 * MARK: deployFailureReasonText
 * @description Renders the context into one bounded, operator-readable block:
 *   the durable cause, the project-blocker reason, then any shared-gate
 *   guidance. Empty string when there is nothing to add (so callers can omit
 *   the section entirely). Total.
 * @example deployFailureReasonText(context) => "Deploy command `./deploy.sh --prod` failed (exit 1) at gate 'canary-e2e' …"
 * @param {Object|null} [context] - `resolveDeployFailureContext` result.
 * @returns {string}
 ***/
export function deployFailureReasonText(context) {
	try {
		if (!context || typeof context !== "object") return "";
		return [
			context.failure?.reason || "",
			context.projectBlocker?.reason || "",
			context.sharedGateGuidance || "",
		]
			.filter(Boolean)
			.join("\n\n");
	} catch {
		return "";
	}
}

/***
 * MARK: attachDeployFailureFields
 * @description Attaches the structured deploy-cause and project-blocker
 *   fields the parked alert reads (`parkedAlertStructuredFields`) onto an
 *   error. Returns the same error for chaining; a malformed error/context
 *   costs the fields, never the failure path. Total.
 * @example attachDeployFailureFields(new Error('x'), context) => error with deployGate/deployAttemptId/projectBlocker
 * @param {Error|Object} error - Target error.
 * @param {Object|null} [context] - `resolveDeployFailureContext` result.
 * @returns {Error|Object} The same error.
 ***/
export function attachDeployFailureFields(error, context) {
	try {
		if (!error || typeof error !== "object" || !context) return error;
		if (context.projectBlocker) error.projectBlocker = context.projectBlocker;
		if (context.failure?.gate) error.deployGate = context.failure.gate;
		if (context.failure?.failedCommand) {
			error.deployFailedCommand = context.failure.failedCommand;
		}
		if (context.failure?.attemptId) {
			error.deployAttemptId = context.failure.attemptId;
		}
	} catch {
		// Never break the failure path over attribution bookkeeping.
	}
	return error;
}
