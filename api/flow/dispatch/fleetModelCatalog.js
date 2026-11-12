import { claimEligibleRunner, effectiveRunnerModels } from "./runnerMatches.js";
import { confirmRunnerModel } from "./runnerModelConfirmation.js";

/***
 * MARK: fleetModelCatalog
 * @description The fleet's dynamic model catalogue, derived live from Runner
 *   registrations — never cached, so joins, leaves, heartbeat updates, and
 *   operator allowlist edits reflect on the next read (graceful by
 *   construction: there is no stale snapshot to invalidate).
 *
 *   One entry per distinct model id served by at least one claim-eligible
 *   Runner (active status, not paused — the same gates dispatch applies
 *   before per-task requirements). Deduped by exact id string: the same id
 *   on two machines (e.g. muse spark through muse on both boxes) appears
 *   once with `runnerCount: 2`.
 *
 *   - `harnesses`: union of the serving Runners' harness ids (any of them
 *     can serve the id — dispatch gates harness and model independently).
 *   - `tiers`: union of the serving Runners' tiers (effort levels).
 *   - `runnerCount` / `runnerIds`: how many (and which) Runners serve it —
 *     the availability signal pickers show instead of credential health.
 *     A stale claim (the claimant's own successful scan contradicts the
 *     pin — see `runnerModelConfirmation`) is not servable and counts
 *     toward nothing here; the persisted snapshot still marks such ids
 *     unavailable for the UI, while this live derivation only names
 *     what can run. Fail-open: inconclusive signals and
 *     operator-asserted ids count exactly as before.
 * @example buildFleetModelCatalog([{ status: 'active', runnerId: 'r1', capabilities: { harnesses: [{ id: 'muse' }], models: ['m1'], tiers: ['T0'] } }])
 *   => { models: [{ id: 'm1', harnesses: ['muse'], tiers: ['T0'], runnerCount: 1, runnerIds: ['r1'] }] }
 * @param {Array<Object>} [runners=[]] - Registry records (`runners.list()`).
 * @returns {{models: Array<Object>}} The catalogue (possibly empty, never null).
 ***/
export function buildFleetModelCatalog(runners = []) {
	const byId = new Map(); // id -> { harnesses:Set, tiers:Set, runnerIds:Set }
	for (const record of Array.isArray(runners) ? runners : []) {
		if (!claimEligibleRunner(record)) continue;
		const runnerId = String(record?.runnerId ?? "").trim();
		if (!runnerId) continue;
		const caps =
			record?.capabilities && typeof record.capabilities === "object"
				? record.capabilities
				: {};
		const harnessIds = Array.isArray(caps.harnesses)
			? caps.harnesses
					.map((h) => (typeof h === "string" ? h.trim() : String(h?.id ?? "").trim()))
					.filter(Boolean)
			: [];
		const tiers = Array.isArray(caps.tiers)
			? caps.tiers.map((t) => String(t ?? "").trim()).filter(Boolean)
			: [];
		for (const raw of effectiveRunnerModels(record)) {
			const id = String(raw ?? "").trim();
			if (!id) continue;
			// Stale claims are not servable (same rule dispatch applies):
			// skip the claimant, so counts name only runners that could
			// actually run the id. Ids no serving runner claims vanish
			// from this live view (the snapshot marks them instead).
			if (confirmRunnerModel(record, id).status === "stale") continue;
			let entry = byId.get(id);
			if (!entry) {
				entry = { harnesses: new Set(), tiers: new Set(), runnerIds: new Set() };
				byId.set(id, entry);
			}
			for (const h of harnessIds) entry.harnesses.add(h);
			for (const t of tiers) entry.tiers.add(t);
			entry.runnerIds.add(runnerId);
		}
	}
	const models = [...byId.entries()].map(([id, entry]) => ({
		id,
		harnesses: [...entry.harnesses].sort(),
		tiers: [...entry.tiers].sort(),
		runnerCount: entry.runnerIds.size,
		runnerIds: [...entry.runnerIds].sort(),
	}));
	models.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	return { models };
}
