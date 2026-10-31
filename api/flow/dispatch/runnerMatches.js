import { RUNNER_PROTOCOL } from "../runnerRegistry.js";
import { runnerApiCompatible } from "./runnerApiCompat.js";
import { operatorConfigVerdict } from "./operatorConfigVerdict.js";

/***
 * MARK: runnerMatches
 * @description Decides whether one Runner registration can take a task with
 *   the given requirements: active status, not paused, fresh heartbeat
 *   (staleness expiry), v1 protocol, runnable flag, harness id, model
 *   offering, tier membership, and disk headroom floor. Returns
 *   `{ ok, reason }` — the
 *   reason code is loud by design (step-6 NO_CAPABLE_RUNNER diagnostics
 *   and the monitor surface distinguish "no runners" from "runners that
 *   cannot take this job"). Alias requirements always miss here; WP-3.2
 *   resolves them centrally first.
 * @example runnerMatches(record, { harness: 'pi', tier: 'T1' }) => { ok: true, reason: 'MATCH' }
 * @param {Object} record - Registry record (`status`, `facts`, `lastSeenAt`, `capabilities`, plus the operator-owned `operatorConfig` the Runners settings screen persists).
 * @param {Object} req - Task requirements from `taskRequirements`.
 * @param {Object} [opts] - `{ now, staleAfterMs, minDiskHeadroomMb, projectId }` (`projectId` is the candidate's project, needed for the operator project-scope check; a scoped Runner with no project id on the candidate misses loudly instead of guessing).
 * @returns {Object} `{ ok, reason }`.
 ***/
export function runnerMatches(record = {}, req = {}, opts = {}) {
	const now = typeof opts.now === "number" ? opts.now : Date.now();
	const staleAfterMs =
		typeof opts.staleAfterMs === "number" && opts.staleAfterMs > 0
			? opts.staleAfterMs
			: 60000;
	const minDisk =
		typeof opts.minDiskHeadroomMb === "number" && opts.minDiskHeadroomMb >= 0
			? opts.minDiskHeadroomMb
			: 100;
	if (record.status !== "active") return { ok: false, reason: "NOT_ACTIVE" };
	if (record.paused === true) return { ok: false, reason: "PAUSED" };
	const seen = Date.parse(record.lastSeenAt || "");
	if (!Number.isFinite(seen) || now - seen > staleAfterMs) {
		return { ok: false, reason: "STALE_HEARTBEAT" };
	}
	const caps = record.capabilities || {};
	if (caps.runnable === false) return { ok: false, reason: "NOT_RUNNABLE" };
	const protocol =
		caps.versions?.protocol || record.facts?.versions?.protocol;
	if (protocol !== RUNNER_PROTOCOL) {
		return { ok: false, reason: "PROTOCOL_SKEW" };
	}
	const runnerApi = caps.versions?.api || record.facts?.versions?.api;
	if (!runnerApiCompatible(runnerApi).ok) {
		return { ok: false, reason: "PROTOCOL_SKEW" };
	}
	// Only the raw string marker (taskRequirements' `{ alias: name }`) is
	// unservable here. A resolved alias object (`{ name, targetIndex }`,
	// stamped by the route after central D3 resolution) carries the
	// concrete harness/model below and matches like any direct requirement.
	if (typeof req.alias === "string" && req.alias) {
		return { ok: false, reason: "ALIAS_UNRESOLVED" };
	}
	if (req.harness) {
		const offered = Array.isArray(caps.harnesses) ? caps.harnesses : [];
		if (!offered.some((h) => h && h.id === req.harness)) {
			return { ok: false, reason: "NO_HARNESS" };
		}
	}
	if (req.model) {
		const models = Array.isArray(caps.models) ? caps.models : [];
		if (!models.includes(req.model)) return { ok: false, reason: "NO_MODEL" };
	}
	if (req.tier) {
		const tiers = Array.isArray(caps.tiers) ? caps.tiers : [];
		if (!tiers.includes(req.tier)) return { ok: false, reason: "TIER_CEILING" };
	}
	if (caps.diskHeadroomMb !== null && caps.diskHeadroomMb !== undefined) {
		if (caps.diskHeadroomMb < minDisk) return { ok: false, reason: "DISK_LOW" };
	}
	// Operator-owned configuration (System Settings › Runners) refines an
	// otherwise-capable match without touching Runner-reported facts. It
	// sits after every health/capability gate so those keep their stable
	// reasons (a stale Runner still reports STALE_HEARTBEAT, never a scope
	// miss). The verdict itself lives in `operatorConfigVerdict`, shared
	// with the direct claim and integration lease routes so no claim path
	// can bypass the operator's settings.
	const operatorVerdict = operatorConfigVerdict(record, req, opts);
	if (!operatorVerdict.ok) return operatorVerdict;
	return { ok: true, reason: "MATCH" };
}
