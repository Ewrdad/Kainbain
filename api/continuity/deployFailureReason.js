/***
 * MARK: Deploy failure reason
 * @description Pure resolver that turns a failed deploy-like stage into an
 *   actionable reason. The transient unit's stdio goes to the journal by
 *   design, so the engine-visible stdout of a failed `./deploy.sh --prod`
 *   is only heartbeat lines plus `exit code 1` — while the real cause
 *   (the failing gate, its command, its log tail) sits in the durable
 *   `last-result.json` / per-attempt checkpoint the deploy script always
 *   writes. This module reads those durable records (never the journal)
 *   and returns a bounded, engine-renderable reason. Total: never throws
 *   on untrusted input — missing stores, missing files, and malformed
 *   JSON all degrade to a generic reason instead of failing the failure
 *   path. Non-deploy stages return null (nothing to resolve).
 *
 * Failure contract: every export is total (never throws) on untrusted
 *   input.
 ***/

import {
	isDeployCommand,
	isDeployStageLike,
	readDeployAttemptCheckpoint,
} from "./deployMarkers.js";

/***
 * MARK: DEPLOY_FAILURE_TAIL_LINES
 * @description How many trailing detail lines a resolved reason carries.
 *   Bounded so a verbose gate log can never flood the task history or the
 *   parked alert.
 ***/
export const DEPLOY_FAILURE_TAIL_LINES = 20;

/***
 * MARK: extractGateName
 * @description Extracts the gate name from a deploy result message of the
 *   form `Gate '<name>' failed (exit N)`. Returns null when the message
 *   carries no gate attribution.
 * @example extractGateName("Gate 'canary-e2e' failed (exit 1)") => 'canary-e2e'
 * @param {unknown} message - Result message value.
 * @returns {string|null} Gate name, or null when unattributed.
 ***/
export function extractGateName(message) {
	try {
		if (typeof message !== "string" || !message) return null;
		const match = message.match(/Gate '([^']+)' failed/i);
		return match ? match[1] : null;
	} catch {
		return null;
	}
}

/***
 * MARK: tailLines
 * @description Returns at most the last `maxLines` lines of a log blob.
 *   Total on untrusted input.
 * @example tailLines('a\nb\nc', 2) => 'b\nc'
 * @param {unknown} text - Log text value.
 * @param {number} [maxLines] - Maximum lines to keep.
 * @returns {string} Bounded tail (possibly empty).
 ***/
export function tailLines(text, maxLines = DEPLOY_FAILURE_TAIL_LINES) {
	try {
		if (typeof text !== "string" || !text) return "";
		const limit =
			Number.isInteger(maxLines) && maxLines > 0
				? maxLines
				: DEPLOY_FAILURE_TAIL_LINES;
		const lines = text.split("\n");
		return lines.slice(-limit).join("\n");
	} catch {
		return "";
	}
}

/***
 * MARK: resolveStageCommandText
 * @description The command a stage actually ran: the caller-supplied value
 *   when it is a non-empty string, else the stage's `command`, else its
 *   `script`, else `""`. Total on untrusted input.
 * @example resolveStageCommandText('', { command: './deploy.sh --prod' }) => './deploy.sh --prod'
 * @param {unknown} command - Caller-supplied command (may be empty).
 * @param {unknown} stage - Stage record.
 * @returns {string}
 ***/
export function resolveStageCommandText(command, stage) {
	try {
		if (typeof command === "string" && command) return command;
		if (typeof stage?.command === "string" && stage.command) {
			return stage.command;
		}
		if (typeof stage?.script === "string" && stage.script) return stage.script;
		return "";
	} catch {
		return "";
	}
}

/***
 * MARK: usableLastResultFailure
 * @description Whether a host-wide `last-result.json` may be used as the
 *   cause of THIS failed deploy attempt. It may only when it describes a
 *   FAILED (or rolled-back) deploy, and — when both the task and the record
 *   carry an attempt id — when those ids MATCH. A success from another
 *   task, a pre-restart `deploying` marker, or a lock-contention waiter
 *   record therefore never impersonates this failure's cause. Total.
 * @example usableLastResultFailure({ status: 'failed', deployAttemptId: 'a' }, 'a') => { status: 'failed', … }
 * @param {unknown} lastResult - Parsed `last-result.json` value.
 * @param {string} [taskAttemptId] - The task's `deployAttemptId` (may be empty).
 * @returns {Object|null} The record when usable, else null.
 ***/
export function usableLastResultFailure(lastResult, taskAttemptId = "") {
	try {
		if (!lastResult || typeof lastResult !== "object" || Array.isArray(lastResult)) {
			return null;
		}
		const status =
			typeof lastResult.status === "string"
				? lastResult.status.trim().toLowerCase()
				: "";
		if (status !== "failed" && status !== "rolled-back" && status !== "rolled_back") {
			return null;
		}
		const wanted =
			typeof taskAttemptId === "string" ? taskAttemptId.trim() : "";
		const recordAttempt =
			typeof lastResult.deployAttemptId === "string"
				? lastResult.deployAttemptId.trim()
				: "";
		if (wanted && recordAttempt && recordAttempt !== wanted) return null;
		return lastResult;
	} catch {
		return null;
	}
}

/***
 * MARK: resolveDeployStageFailure
 * @description Resolves an actionable failure reason for a failed
 *   deploy-like stage from the durable deploy records. Reads
 *   `last-result.json` via `store.deployManager.readJson` and prefers the
 *   per-attempt checkpoint (via `readDeployAttemptCheckpoint`) when the
 *   task carries a `deployAttemptId` whose checkpoint is terminal — the
 *   checkpoint is the most precise record for THIS attempt. Returns null
 *   for non-deploy stages (nothing to resolve) and a generic reason when
 *   no durable record exists.
 * @example resolveDeployStageFailure(store, { task, stage, exitCode: 1, command: './deploy.sh --prod' }) => { attemptId, gate, failedCommand, reason }
 * @param {Object} [store] - Task store carrying `deployManager.readJson`.
 * @param {Object} [args]
 * @param {Object} [args.task] - Task entity (for `deployAttemptId`).
 * @param {Object} [args.stage] - Stage record (deploy-likeness check).
 * @param {number} [args.exitCode] - Process exit code.
 * @param {string} [args.command] - Command that failed.
 * @returns {{ attemptId: string|null, gate: string|null, failedCommand: string|null, logPath: string|null, tail: string, reason: string }|null}
 ***/
export function resolveDeployStageFailure(store, args = {}) {
	try {
		const { task = null, stage = null, exitCode = 1, command = "" } = args || {};
		const commandText = resolveStageCommandText(command, stage);
		const deployLike =
			isDeployStageLike(stage) || isDeployCommand(commandText);
		if (!deployLike) return null;

		const code = Number.isFinite(Number(exitCode)) ? Number(exitCode) : 1;
		const safeCommand = commandText || "unknown command";

		let lastResult = null;
		try {
			const raw = store?.deployManager?.readJson?.("last-result.json");
			if (raw && typeof raw === "object" && !Array.isArray(raw)) {
				lastResult = raw;
			}
		} catch {
			lastResult = null;
		}

		// Prefer the per-attempt checkpoint when it is terminal: it is the
		// most precise record for THIS attempt (a stale last-result.json
		// from another task's deploy must never impersonate this failure).
		let attemptRecord = null;
		const taskAttemptId =
			typeof task?.deployAttemptId === "string"
				? task.deployAttemptId.trim()
				: "";
		try {
			if (taskAttemptId) {
				const checkpoint = readDeployAttemptCheckpoint(store, taskAttemptId);
				if (
					checkpoint &&
					typeof checkpoint === "object" &&
					/^(failed|rolled-back|rolled_back)$/i.test(
						String(checkpoint.status || ""),
					)
				) {
					attemptRecord = checkpoint;
				}
			}
		} catch {
			attemptRecord = null;
		}

		// `last-result.json` is host-wide, so it is only usable evidence when
		// it describes a FAILED deploy of THIS attempt: a success from
		// another task (or a lock-contention waiter record) must never
		// impersonate the cause of this failure.
		const record =
			attemptRecord || usableLastResultFailure(lastResult, taskAttemptId);
		const attemptId =
			taskAttemptId ||
			(typeof record?.deployAttemptId === "string" &&
				record.deployAttemptId.trim()) ||
			null;
		const message =
			(typeof record?.message === "string" && record.message.trim()) || "";
		const gate = extractGateName(message) || null;
		const failedCommand =
			(typeof record?.failedCommand === "string" &&
				record.failedCommand.trim() &&
				record.failedCommand.trim()) ||
			null;
		const details =
			(typeof record?.details === "string" && record.details) || "";
		const tail = tailLines(details);
		const logPath = gate
			? `~/.kainbain/deploy/gate-${String(gate).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-*.log`
			: null;

		const reasonParts = [
			`Deploy command \`${safeCommand}\` failed (exit ${code})`,
		];
		if (gate) reasonParts.push(`at gate '${gate}'`);
		if (message) reasonParts.push(`— ${message}`);
		if (failedCommand && failedCommand !== safeCommand) {
			reasonParts.push(`(failed command: \`${failedCommand}\`)`);
		}
		if (tail) reasonParts.push(`\nGate output tail:\n${tail}`);
		reasonParts.push(
			`\nFull evidence: ~/.kainbain/deploy/last-result.json${logPath ? `, ${logPath}` : " (+ gate-*.log)"}`,
		);

		return {
			attemptId,
			gate,
			failedCommand,
			logPath,
			tail,
			reason: reasonParts.join(" "),
		};
	} catch {
		return {
			attemptId: null,
			gate: null,
			failedCommand: null,
			logPath: null,
			tail: "",
			reason: "Deploy command failed (the durable deploy record was unreadable — see ~/.kainbain/deploy/last-result.json)",
		};
	}
}
