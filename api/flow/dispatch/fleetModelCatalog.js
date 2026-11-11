import { claimEligibleRunner, effectiveRunnerModels } from "./runnerMatches.js";
import { parseModelKey } from "../../../shared/modelKeys.js";

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
 *
 *   Every advertised id is validated against the shared key grammar at
 *   ingestion: malformed ids (empty segment, 5+ segments) land in
 *   `quarantined` with a reason and are NEVER served — a garbage id must not
 *   reach a picker where dispatch would match it verbatim.
 * @example buildFleetModelCatalog([{ status: 'active', runnerId: 'r1', capabilities: { harnesses: [{ id: 'muse' }], models: ['m1'], tiers: ['T0'] } }])
 *   => { models: [{ id: 'm1', harnesses: ['muse'], tiers: ['T0'], runnerCount: 1, runnerIds: ['r1'] }], quarantined: [] }
 * @param {Array<Object>} [runners=[]] - Registry records (`runners.list()`).
 * @returns {{models: Array<Object>, quarantined: Array<{id: string, reason: string, runnerIds: string[]}>}} The catalogue (possibly empty, never null).
 ***/
export function buildFleetModelCatalog(runners = []) {
	const byId = new Map(); // id -> { harnesses:Set, tiers:Set, runnerIds:Set }
	const quarantinedById = new Map(); // id -> { id, reason, runnerIds:Set }
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
			// Ingestion gate: validate against the shared grammar. Malformed
			// ids are quarantined (visible with a reason), never served.
			if (!parseModelKey(id)) {
				let q = quarantinedById.get(id);
				if (!q) {
					q = {
						id,
						reason: "malformed model key (empty segment or 5+ '::' segments)",
						runnerIds: new Set(),
					};
					quarantinedById.set(id, q);
				}
				q.runnerIds.add(runnerId);
				continue;
			}
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
	const quarantined = [...quarantinedById.values()]
		.map((q) => ({ id: q.id, reason: q.reason, runnerIds: [...q.runnerIds].sort() }))
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	return { models, quarantined };
}
