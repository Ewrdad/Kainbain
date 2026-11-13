import { parseModelKey } from "../../../shared/modelKeys.js";
import { config } from "../../config.js";
import { loadStateFile } from "../loadStateFile.js";
import { resolveStatePath } from "../resolveStatePath.js";
import { saveStateFile } from "../saveStateFile.js";
import { ingestAdvertisedIds } from "./catalogIngest.js";
import { confirmRunnerModel } from "./runnerModelConfirmation.js";
import { staleAdvertReason } from "./staleAdvertReason.js";
import { claimEligibleRunner } from "./runnerMatches/claimEligibleRunner.js";
import { effectiveRunnerModels } from "./runnerMatches/effectiveRunnerModels.js";

/***
 * MARK: fleetModelSnapshot
 * @description The persisted fleet model snapshot behind the central model
 *   catalogue (ADR 0016): every catalogue read re-derives the live entries
 *   from the current Runner registrations (same eligibility + effective-
 *   models rules as `buildFleetModelCatalog`, which stays the dispatch
 *   source of truth) and merges them into this snapshot, so the UI never
 *   depends on a transient read. Only canonical harness-scoped ids
 *   (`harness::provider::model[::effort]`) enter `models` — bare and
 *   `provider::id` forms are quarantined with a not-harness-qualified
 *   reason, and ids naming a harness the runner does not serve are
 *   quarantined with a not-served reason. Entries carry their normalized
 *   attributes, effort `tiers`, per-entry attribution
 *   (`harnesses: [parsed.harness]` — the harness named by the id, never
 *   the runner's whole harness list), verified counts (`runnerIds` /
 *   `runnerCount` name only claim-eligible runners whose own discovery
 *   CONFIRMED the id), `declaredBy` (claimants whose advertisement no
 *   scan confirmed — pins, allowlist entries, no-signal runners),
 *   `claimedBy` (claimants contradicted by their own successful scan),
 *   first/last-seen plus last-served timestamps, and per-runner
 *   provenance. An entry no live runner advertises is kept indefinitely
 *   with empty claimant lists instead of deleted; `available`,
 *   `verified`, and `unavailableReason` are DERIVED on read
 *   (`runnerCount > 0`), never persisted. `remove(id)` /
 *   `removeQuarantined(id)` permanently delete one record (admin DELETE
 *   routes); a re-advertised id reappears on the next update.
 *   Persisted atomically to `KAINBAIN_FLEET_CATALOG_FILE` (empty
 *   disables). Never a dispatch input — dispatch keeps reading the live
 *   derivation, so only claim-eligible runners decide what can run.
 * @example const store = createFleetModelSnapshotStore({ filePath: null });
 * @example store.update([{ status: 'active', runnerId: 'r1', capabilities: { harnesses: [{ id: 'muse' }], models: ['muse::meta::m'], tiers: ['T0'], modelProvenance: { 'muse::meta::m': {} }, discoveryStatus: { muse: { ok: true, atMs: Date.now() } } } }])
 ***/

/***
 * MARK: FLEET_SNAPSHOT_MAX_QUARANTINED
 * @description Quarantine cap for non-canonical/malformed advertised ids:
 *   when exceeded, the oldest last-seen quarantine records are dropped
 *   first. There is deliberately NO cap on `models` (survey q1/q6):
 *   0-runner entries are kept indefinitely and only an explicit admin
 *   DELETE removes one.
 * @example FLEET_SNAPSHOT_MAX_QUARANTINED => 1000
 ***/
export const FLEET_SNAPSHOT_MAX_QUARANTINED = 1000;

/***
 * MARK: formatAge
 * @description Formats a millisecond age for derived unavailable reasons:
 *   seconds under a minute, minutes under an hour, hours under a day,
 *   whole days beyond that (`3d`). Non-finite or negative input reads
 *   as `0s` — a reason string must never carry `NaN` or a negative age.
 * @example formatAge(3000) => '3s'
 * @example formatAge(5 * 60 * 1000) => '5m'
 * @example formatAge(3 * 60 * 60 * 1000) => '3h'
 * @example formatAge(3 * 24 * 60 * 60 * 1000) => '3d'
 * @param {unknown} ageMs - Age in milliseconds.
 * @returns {string} Compact age (`Ns`/`Nm`/`Nh`/`Nd`).
 ***/
export const formatAge = (ageMs) => {
	const age = typeof ageMs === "number" && Number.isFinite(ageMs) ? Math.max(0, ageMs) : 0;
	const seconds = Math.floor(age / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.floor(hours / 24)}d`;
};

/***
 * MARK: deriveUnavailableReason
 * @description Derives one entry's `unavailableReason` on read (never
 *   persisted): `null` while any discovery-confirmed runner serves the id
 *   (`runnerIds` non-empty). Otherwise, in priority order: unconfirmed
 *   declarants first (`declared by N runner(s), not verified by
 *   discovery`), then stale-claim contradictions (the existing
 *   `staleAdvertReason` wording), then the last-served memory (`0
 *   runners -- last served 3d ago by box-a`), and finally `never served
 *   by any runner` when nobody ever served it.
 * @example deriveUnavailableReason({ runnerIds: ['r1'], declaredBy: [], claimedBy: [] }, Date.now()) => null
 * @example deriveUnavailableReason({ runnerIds: [], declaredBy: ['r1', 'r2'], claimedBy: [], harness: 'muse' }, Date.now()) => 'declared by 2 runners, not verified by discovery'
 * @param {Object} entry - Stored catalogue entry (claimant lists + timestamps).
 * @param {number} [nowMs] - Clock seam (ms epoch; defaults to `Date.now()`).
 * @returns {string|null} Derived reason, or null when served.
 ***/
export const deriveUnavailableReason = (entry, nowMs = Date.now()) => {
	const runnerIds = Array.isArray(entry?.runnerIds) ? entry.runnerIds : [];
	if (runnerIds.length > 0) return null;
	const declaredBy = Array.isArray(entry?.declaredBy) ? entry.declaredBy : [];
	if (declaredBy.length > 0) {
		return `declared by ${declaredBy.length} runner${declaredBy.length === 1 ? "" : "s"}, not verified by discovery`;
	}
	const claimedBy = Array.isArray(entry?.claimedBy) ? entry.claimedBy : [];
	if (claimedBy.length > 0) return staleAdvertReason(entry?.harness, claimedBy.length);
	const lastServedAtMs =
		typeof entry?.lastServedAtMs === "number" && Number.isFinite(entry.lastServedAtMs)
			? entry.lastServedAtMs
			: null;
	if (lastServedAtMs !== null) {
		const now =
			typeof nowMs === "number" && Number.isFinite(nowMs) && nowMs >= 0 ? nowMs : Date.now();
		const servers = (Array.isArray(entry?.lastServedRunnerIds) ? entry.lastServedRunnerIds : []).filter(
			(s) => typeof s === "string" && s.trim(),
		);
		const by = servers.length > 0 ? ` by ${servers.join(", ")}` : "";
		return `0 runners -- last served ${formatAge(now - lastServedAtMs)} ago${by}`;
	}
	return "never served by any runner";
};

/***
 * MARK: resolveFleetSnapshotPath
 * @description Resolves the snapshot file path: an explicit string wins
 *   (tests), `null` or an empty string disables persistence (memory-only),
 *   else the configured `KAINBAIN_FLEET_CATALOG_FILE` (empty disables too),
 *   else `~/.kainbain/engine/fleet-catalog.json`.
 * @example resolveFleetSnapshotPath(null) => null
 * @example resolveFleetSnapshotPath(undefined) => '/home/u/.kainbain/engine/fleet-catalog.json'
 * @param {string|null|undefined} explicit - Explicit path override; null disables, undefined falls through to the configured default.
 * @returns {string|null} Resolved path, or null when disabled.
 ***/
export const resolveFleetSnapshotPath = (explicit) => {
	if (explicit === null) return null;
	if (typeof explicit === "string") return explicit.trim() ? explicit : null;
	const configured = config?.fleetCatalogFile;
	if (typeof configured === "string" && !configured.trim()) return null;
	return resolveStatePath(null, configured, "fleet-catalog.json");
};

/***
 * MARK: normalizeSnapshotState
 * @description Validates persisted snapshot state back into shape, migrating
 *   pre-canonical files forward (idempotent): entries whose id is not a
 *   canonical harness-scoped id (bare, `provider::id`, or unparseable)
 *   move to `quarantined` with the same reason a fresh advertisement
 *   would carry; harness-scoped entries are kept with their attribution
 *   rewritten to `[parsed.harness]`, `declaredBy` defaulted, last-served
 *   timestamps defaulted, and any stored
 *   `available`/`unavailableReason`/`verified` dropped (derived on read).
 *   Anything else degrades to empty — a rotted file can never break
 *   catalogue reads.
 * @example normalizeSnapshotState(null) => { models: [], quarantined: [], updatedAtMs: null }
 * @example normalizeSnapshotState({ models: [{ id: 'prov::m1' }] }).quarantined => [{ id: 'prov::m1', … }]
 * @param {unknown} raw - Parsed file content.
 * @returns {{models: Array, quarantined: Array, updatedAtMs: number|null}} Clean state.
 ***/
export const normalizeSnapshotState = (raw) => {
	const strings = (list) =>
		(Array.isArray(list) ? list : []).filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim());
	const cleanProvenance = (value) => {
		const provenance = {};
		const rawProv = value && typeof value === "object" && value.provenance && typeof value.provenance === "object" ? value.provenance : {};
		for (const [runnerId, slot] of Object.entries(rawProv)) {
			if (typeof runnerId !== "string" || !runnerId.trim() || !slot || typeof slot !== "object") continue;
			provenance[runnerId] = {
				harnesses: strings(slot.harnesses),
				atMs: typeof slot.atMs === "number" && Number.isFinite(slot.atMs) && slot.atMs >= 0 ? slot.atMs : null,
				source: typeof slot.source === "string" && slot.source.trim() ? slot.source.trim().slice(0, 32) : "unknown",
			};
		}
		return provenance;
	};
	const finiteOrNull = (value) =>
		typeof value === "number" && Number.isFinite(value) ? value : null;
	const migrated = [];
	const cleanQuarantine = (value) => {
		if (!value || typeof value !== "object" || Array.isArray(value)) return null;
		if (typeof value.id !== "string" || !value.id.trim()) return null;
		return {
			id: value.id.trim(),
			reason: typeof value.reason === "string" ? value.reason.slice(0, 500) : "Malformed model id.",
			runnerIds: strings(value.runnerIds),
			firstSeenAtMs: finiteOrNull(value.firstSeenAtMs),
			lastSeenAtMs: finiteOrNull(value.lastSeenAtMs),
		};
	};
	const cleanEntry = (value) => {
		if (!value || typeof value !== "object" || Array.isArray(value)) return null;
		if (typeof value.id !== "string" || !value.id.trim()) return null;
		const id = value.id.trim();
		let parsed = null;
		try {
			parsed = parseModelKey(id);
		} catch {
			parsed = null;
		}
		if (!parsed || (parsed.form !== "harness" && parsed.form !== "harnessReasoning")) {
			// Pre-canonical persisted entry: quarantine with the audit
			// trail a fresh advertisement would carry. Claimant memory is
			// the union of the stored serving + stale-claim lists;
			// timestamps are the entry's own, so the record keeps its age.
			const segments = id.split("::").length;
			migrated.push({
				id,
				reason: parsed
					? `Model id "${id}" is not harness-qualified (want harness::provider::model[::effort]).`
					: segments >= 5
						? `Model id "${id}" has ${segments} segments (want at most 4: harness::provider::id::reasoning).`
						: `Model id "${id}" has an empty segment (every part between :: must be non-empty).`,
				runnerIds: [...new Set([...strings(value.runnerIds), ...strings(value.claimedBy)])].sort(),
				firstSeenAtMs: finiteOrNull(value.firstSeenAtMs),
				lastSeenAtMs: finiteOrNull(value.lastSeenAtMs),
			});
			return null;
		}
		const storedRunnerIds = strings(value.runnerIds);
		const storedServed = storedRunnerIds.length > 0;
		return {
			id,
			form: parsed.form,
			harness: parsed.harness ?? null,
			provider: parsed.provider ?? null,
			model: parsed.id ?? id,
			reasoning: parsed.reasoning ?? null,
			harnesses: [parsed.harness],
			tiers: strings(value.tiers),
			runnerIds: storedRunnerIds,
			runnerCount: Number.isInteger(value.runnerCount) && value.runnerCount >= 0 ? value.runnerCount : storedRunnerIds.length,
			claimedBy: strings(value.claimedBy),
			declaredBy: strings(value.declaredBy),
			firstSeenAtMs: finiteOrNull(value.firstSeenAtMs),
			lastSeenAtMs: finiteOrNull(value.lastSeenAtMs),
			// Last-served memory the old shape never stored: carry it
			// forward when present, else seed it from a stored served
			// entry (its last-seen IS its last-served), else empty.
			// Stored `available`/`unavailableReason`/`verified` are
			// dropped here — derived on read from now on.
			lastServedAtMs: finiteOrNull(value.lastServedAtMs) ?? (storedServed ? finiteOrNull(value.lastSeenAtMs) : null),
			lastServedRunnerIds: strings(value.lastServedRunnerIds).length > 0
				? strings(value.lastServedRunnerIds).sort()
				: storedServed
					? [...storedRunnerIds].sort()
					: [],
			provenance: cleanProvenance(value),
		};
	};
	const quarantineSeed = (Array.isArray(raw?.quarantined) ? raw.quarantined : []).map(cleanQuarantine).filter(Boolean);
	return {
		models: (Array.isArray(raw?.models) ? raw.models : []).map(cleanEntry).filter(Boolean),
		quarantined: [...quarantineSeed, ...migrated.map(cleanQuarantine).filter(Boolean)],
		updatedAtMs: finiteOrNull(raw?.updatedAtMs),
	};
};

/***
 * MARK: summarizeFleetHarnesses
 * @description Summarizes the fleet's harness footprint from live Runner
 *   registrations: one `{ id, runnerCount, runnerIds }` per harness id
 *   named in a claim-eligible runner's `capabilities.harnesses`
 *   (string or `{ id }` shapes), id-sorted. Powers the catalogue
 *   response's `harnesses[]` so pickers can render per-harness sections
 *   without re-deriving eligibility. Pure, no I/O.
 * @example summarizeFleetHarnesses([{ status: 'active', runnerId: 'r1', capabilities: { harnesses: [{ id: 'muse' }] } }]) => [{ id: 'muse', runnerCount: 1, runnerIds: ['r1'] }]
 * @example summarizeFleetHarnesses([]) => []
 * @param {Array<Object>} [runners] - Registry records (`runners.list()`).
 * @returns {Array<Object>} Harness summary (possibly empty, never null).
 ***/
export const summarizeFleetHarnesses = (runners = []) => {
	const byId = new Map();
	for (const record of Array.isArray(runners) ? runners : []) {
		if (!claimEligibleRunner(record)) continue;
		const runnerId = String(record?.runnerId ?? "").trim();
		if (!runnerId) continue;
		const caps = record?.capabilities && typeof record.capabilities === "object" ? record.capabilities : {};
		const ids = new Set(
			(Array.isArray(caps.harnesses) ? caps.harnesses : [])
				.map((h) => (typeof h === "string" ? h.trim() : String(h?.id ?? "").trim()))
				.filter(Boolean),
		);
		for (const id of ids) {
			let slot = byId.get(id);
			if (!slot) {
				slot = new Set();
				byId.set(id, slot);
			}
			slot.add(runnerId);
		}
	}
	return [...byId.entries()]
		.map(([id, runnerIds]) => ({ id, runnerCount: runnerIds.size, runnerIds: [...runnerIds].sort() }))
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
};

/***
 * MARK: createFleetModelSnapshotStore
 * @description Creates one fleet snapshot store: `update(runners)` merges
 *   the live derivation into the snapshot (verified unions refreshed,
 *   unconfirmed claimants listed as declared, contradicted pins claimed,
 *   missing entries kept with empty claimant lists, non-canonical ids
 *   quarantined, quarantine cap enforced) and persists; `read()` serves
 *   `{ models, quarantined, updatedAtMs }` (id-sorted, cloned) with
 *   `verified`/`available`/`unavailableReason` derived per entry;
 *   `remove(id)` / `removeQuarantined(id)` permanently delete one record
 *   (true when one existed); `clear()` empties the store (tests).
 *   `filePath: null` or `''` disables persistence (pure memory).
 * @example const store = createFleetModelSnapshotStore({ filePath: '' }); store.update([]).models => []
 * @param {Object} [opts]
 * @param {string|null} [opts.filePath] - Explicit state path (undefined = configured default, null/'' = memory-only).
 * @param {Function} [opts.now] - Clock seam (ms epoch).
 * @returns {{update: Function, read: Function, clear: Function, remove: Function, removeQuarantined: Function}} The store.
 ***/
export const createFleetModelSnapshotStore = ({ filePath, now = () => Date.now() } = {}) => {
	const stateFile = resolveFleetSnapshotPath(filePath);
	const models = new Map();
	const quarantined = new Map();
	let updatedAtMs = null;

	const loaded = normalizeSnapshotState(stateFile ? loadStateFile(stateFile, (raw) => raw) : null);
	for (const entry of loaded.models) models.set(entry.id, entry);
	for (const record of loaded.quarantined) quarantined.set(record.id, record);
	updatedAtMs = loaded.updatedAtMs;

	const persist = () => {
		if (!stateFile) return;
		saveStateFile(stateFile, {
			models: [...models.values()],
			quarantined: [...quarantined.values()],
			updatedAtMs,
		});
	};

	const evictOverflow = () => {
		// No cap on `models`: 0-runner entries are kept indefinitely and
		// only an explicit admin DELETE removes one. The quarantine cap
		// stays (oldest last-seen records drop first).
		if (quarantined.size > FLEET_SNAPSHOT_MAX_QUARANTINED) {
			const entries = [...quarantined.values()].sort((a, b) => (a.lastSeenAtMs ?? 0) - (b.lastSeenAtMs ?? 0));
			for (const record of entries) {
				if (quarantined.size <= FLEET_SNAPSHOT_MAX_QUARANTINED) break;
				quarantined.delete(record.id);
			}
		}
	};

	const withDerived = (entry, nowMs) => ({
		...entry,
		verified: (entry.runnerIds?.length ?? 0) > 0,
		available: (entry.runnerIds?.length ?? 0) > 0,
		unavailableReason: deriveUnavailableReason(entry, nowMs),
	});

	const read = () => {
		const at = now();
		const sorted = [...models.values()]
			.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
			.map((entry) => withDerived(entry, at));
		const sortedQuarantine = [...quarantined.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
		return structuredClone({ models: sorted, quarantined: sortedQuarantine, updatedAtMs });
	};

	const update = (runners, { atMs = now() } = {}) => {
		const seenAt = typeof atMs === "number" && Number.isFinite(atMs) ? atMs : now();
		const live = new Map();
		const batchQuarantine = new Map();
		for (const record of Array.isArray(runners) ? runners : []) {
			if (!claimEligibleRunner(record)) continue;
			const runnerId = String(record?.runnerId ?? "").trim();
			if (!runnerId) continue;
			const caps = record?.capabilities && typeof record.capabilities === "object" ? record.capabilities : {};
			const harnessIds = Array.isArray(caps.harnesses)
				? caps.harnesses.map((h) => (typeof h === "string" ? h.trim() : String(h?.id ?? "").trim())).filter(Boolean)
				: [];
			const tiers = Array.isArray(caps.tiers) ? caps.tiers.map((t) => String(t ?? "").trim()).filter(Boolean) : [];
			const source = typeof caps.modelSource === "string" && caps.modelSource.trim() ? caps.modelSource.trim() : "unknown";
			const provenance = caps.modelProvenance && typeof caps.modelProvenance === "object" ? caps.modelProvenance : {};
			const { entries, quarantined: bad } = ingestAdvertisedIds(effectiveRunnerModels(record), {
				runnerId,
				harnesses: harnessIds,
				tiers,
				source,
			});
			for (const entry of entries) {
				const detectedAt = provenance[entry.id]?.atMs ?? null;
				let slot = live.get(entry.id);
				if (!slot) {
					slot = {
						id: entry.id,
						form: entry.form,
						harness: entry.harness,
						provider: entry.provider,
						model: entry.model,
						reasoning: entry.reasoning,
						tiers: new Set(),
						runnerIds: new Set(),
						declaredBy: new Set(),
						claimedBy: new Set(),
						provenance: {},
					};
					live.set(entry.id, slot);
				}
				// Only canonical harness-scoped ids reach here, and every
				// one names its own harness: attribution is exactly
				// `[parsed.harness]`, never the runner's whole harness
				// list. Only discovery-CONFIRMED claimants count toward
				// `runnerIds`; contradicted pins land in `claimedBy` and
				// every other unconfirmed claimant in `declaredBy`.
				for (const t of entry.tiers) slot.tiers.add(t);
				const verdict = confirmRunnerModel(record, entry.id, { now }).status;
				if (verdict === "stale") {
					slot.claimedBy.add(runnerId);
					continue;
				}
				if (verdict !== "confirmed") {
					slot.declaredBy.add(runnerId);
					continue;
				}
				slot.runnerIds.add(runnerId);
				slot.provenance[runnerId] = {
					harnesses: [entry.harness],
					atMs: typeof detectedAt === "number" && Number.isFinite(detectedAt) && detectedAt >= 0 ? detectedAt : null,
					source,
				};
			}
			for (const item of bad) {
				let slot = batchQuarantine.get(item.id);
				if (!slot) {
					slot = { id: item.id, reason: item.reason, runnerIds: new Set() };
					batchQuarantine.set(item.id, slot);
				}
				slot.runnerIds.add(runnerId);
			}
		}
		for (const [id, slot] of live) {
			const previous = models.get(id);
			const runnerIds = [...slot.runnerIds].sort();
			const served = runnerIds.length > 0;
			models.set(id, {
				id,
				form: slot.form,
				harness: slot.harness,
				provider: slot.provider,
				model: slot.model,
				reasoning: slot.reasoning,
				harnesses: [slot.harness],
				tiers: [...slot.tiers].sort(),
				runnerIds,
				runnerCount: runnerIds.length,
				claimedBy: [...slot.claimedBy].sort(),
				declaredBy: [...slot.declaredBy].sort(),
				firstSeenAtMs: previous?.firstSeenAtMs ?? seenAt,
				lastSeenAtMs: seenAt,
				// Last-served memory: stamped while served, carried while
				// not — this is what lets a 0-runner entry report "last
				// served 3d ago by box-a" instead of vanishing.
				// `available`/`unavailableReason`/`verified` are NOT
				// stored: derived on read.
				lastServedAtMs: served ? seenAt : (previous?.lastServedAtMs ?? null),
				lastServedRunnerIds: served ? runnerIds : (previous?.lastServedRunnerIds ?? []),
				provenance: served ? slot.provenance : (previous?.provenance ?? {}),
			});
		}
		for (const [id, entry] of models) {
			if (live.has(id)) continue;
			// No live runner advertises this id: kept indefinitely with
			// empty claimant lists (no current claimants) and untouched
			// last-seen; last-served memory and provenance ride along.
			models.set(id, {
				...entry,
				runnerIds: [],
				runnerCount: 0,
				claimedBy: [],
				declaredBy: [],
			});
		}
		for (const [id, slot] of batchQuarantine) {
			const previous = quarantined.get(id);
			const runnerIds = new Set([...(previous?.runnerIds ?? []), ...slot.runnerIds]);
			quarantined.set(id, {
				id,
				reason: slot.reason,
				runnerIds: [...runnerIds].sort(),
				firstSeenAtMs: previous?.firstSeenAtMs ?? seenAt,
				lastSeenAtMs: seenAt,
			});
		}
		updatedAtMs = seenAt;
		evictOverflow();
		persist();
		return read();
	};

	const remove = (rawId) => {
		const id = String(rawId ?? "").trim();
		if (!id || !models.has(id)) return false;
		models.delete(id);
		persist();
		return true;
	};

	const removeQuarantined = (rawId) => {
		const id = String(rawId ?? "").trim();
		if (!id || !quarantined.has(id)) return false;
		quarantined.delete(id);
		persist();
		return true;
	};

	const clear = () => {
		models.clear();
		quarantined.clear();
		updatedAtMs = null;
		persist();
	};

	return { update, read, clear, remove, removeQuarantined };
};
