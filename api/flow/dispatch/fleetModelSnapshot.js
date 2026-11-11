import { config } from "../../config.js";
import { loadStateFile } from "../loadStateFile.js";
import { resolveStatePath } from "../resolveStatePath.js";
import { saveStateFile } from "../saveStateFile.js";
import { ingestAdvertisedIds } from "./catalogIngest.js";
import { claimEligibleRunner } from "./runnerMatches/claimEligibleRunner.js";
import { effectiveRunnerModels } from "./runnerMatches/effectiveRunnerModels.js";

/***
 * MARK: fleetModelSnapshot
 * @description The persisted fleet model snapshot behind the central model
 *   catalogue (ADR 0016): every catalogue read re-derives the live entries
 *   from the current Runner registrations (same eligibility + effective-
 *   models rules as `buildFleetModelCatalog`, which stays the dispatch
 *   source of truth) and merges them into this snapshot, so the UI never
 *   depends on a transient read. Entries carry their normalized
 *   `harness::model` attributes, effort `tiers`, availability, and
 *   per-runner provenance (detecting leg + detected-at). An entry no live
 *   runner serves is marked unavailable with a reason instead of deleted
 *   (survey q4); a malformed advertised id is quarantined with a reason
 *   instead of silently dropped or served. Persisted atomically to
 *   `KAINBAIN_FLEET_CATALOG_FILE` (empty disables); after a backend
 *   restart every entry reads unavailable until its runners heartbeat
 *   again. Never a dispatch input — dispatch keeps reading the live
 *   derivation, so only claim-eligible runners decide what can run.
 * @example const store = createFleetModelSnapshotStore({ filePath: null });
 * @example store.update([{ status: 'active', runnerId: 'r1', capabilities: { harnesses: [{ id: 'muse' }], models: ['muse::meta::m'], tiers: ['T0'] } }])
 ***/

/***
 * MARK: FLEET_SNAPSHOT_MAX_MODELS
 * @description Generous entry cap for the persisted snapshot: eviction drops
 *   oldest-unavailable entries first and never an available entry unless the
 *   cap itself is exceeded by live data alone.
 * @example FLEET_SNAPSHOT_MAX_MODELS => 10000
 ***/
export const FLEET_SNAPSHOT_MAX_MODELS = 10000;

/***
 * MARK: FLEET_SNAPSHOT_MAX_QUARANTINED
 * @description Quarantine cap for malformed advertised ids: when exceeded,
 *   the oldest last-seen quarantine records are dropped first.
 * @example FLEET_SNAPSHOT_MAX_QUARANTINED => 1000
 ***/
export const FLEET_SNAPSHOT_MAX_QUARANTINED = 1000;

/***
 * MARK: FLEET_ENTRY_UNAVAILABLE_REASON
 * @description The reason text carried by catalogue entries that no
 *   claim-eligible runner currently serves (marked unavailable, never deleted).
 * @example FLEET_ENTRY_UNAVAILABLE_REASON => "No claim-eligible runner serves this model right now."
 ***/
export const FLEET_ENTRY_UNAVAILABLE_REASON = "No claim-eligible runner serves this model right now.";

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
 * @description Validates persisted snapshot state back into shape:
 *   well-formed entries survive (unknown fields dropped), anything else
 *   degrades to empty — a rotted file can never break catalogue reads.
 * @example normalizeSnapshotState(null) => { models: [], quarantined: [], updatedAtMs: null }
 * @param {unknown} raw - Parsed file content.
 * @returns {{models: Array, quarantined: Array, updatedAtMs: number|null}} Clean state.
 ***/
export const normalizeSnapshotState = (raw) => {
	const cleanEntry = (value) => {
		if (!value || typeof value !== "object" || Array.isArray(value)) return null;
		if (typeof value.id !== "string" || !value.id.trim()) return null;
		const strings = (list) =>
			(Array.isArray(list) ? list : []).filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim());
		const provenance = {};
		const rawProv = value.provenance && typeof value.provenance === "object" ? value.provenance : {};
		for (const [runnerId, slot] of Object.entries(rawProv)) {
			if (typeof runnerId !== "string" || !runnerId.trim() || !slot || typeof slot !== "object") continue;
			provenance[runnerId] = {
				harnesses: strings(slot.harnesses),
				atMs: typeof slot.atMs === "number" && Number.isFinite(slot.atMs) && slot.atMs >= 0 ? slot.atMs : null,
				source: typeof slot.source === "string" && slot.source.trim() ? slot.source.trim().slice(0, 32) : "unknown",
			};
		}
		return {
			id: value.id.trim(),
			form: typeof value.form === "string" ? value.form : "bare",
			harness: typeof value.harness === "string" ? value.harness : null,
			provider: typeof value.provider === "string" ? value.provider : null,
			model: typeof value.model === "string" ? value.model : value.id.trim(),
			reasoning: typeof value.reasoning === "string" ? value.reasoning : null,
			harnesses: strings(value.harnesses),
			tiers: strings(value.tiers),
			runnerIds: strings(value.runnerIds),
			runnerCount: Number.isInteger(value.runnerCount) && value.runnerCount >= 0 ? value.runnerCount : 0,
			available: value.available !== false,
			unavailableReason: typeof value.unavailableReason === "string" ? value.unavailableReason : null,
			firstSeenAtMs: typeof value.firstSeenAtMs === "number" && Number.isFinite(value.firstSeenAtMs) ? value.firstSeenAtMs : null,
			lastSeenAtMs: typeof value.lastSeenAtMs === "number" && Number.isFinite(value.lastSeenAtMs) ? value.lastSeenAtMs : null,
			provenance,
		};
	};
	const cleanQuarantine = (value) => {
		if (!value || typeof value !== "object" || Array.isArray(value)) return null;
		if (typeof value.id !== "string" || !value.id.trim()) return null;
		return {
			id: value.id.trim(),
			reason: typeof value.reason === "string" ? value.reason.slice(0, 500) : "Malformed model id.",
			runnerIds: (Array.isArray(value.runnerIds) ? value.runnerIds : [])
				.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()),
			firstSeenAtMs: typeof value.firstSeenAtMs === "number" && Number.isFinite(value.firstSeenAtMs) ? value.firstSeenAtMs : null,
			lastSeenAtMs: typeof value.lastSeenAtMs === "number" && Number.isFinite(value.lastSeenAtMs) ? value.lastSeenAtMs : null,
		};
	};
	return {
		models: (Array.isArray(raw?.models) ? raw.models : []).map(cleanEntry).filter(Boolean),
		quarantined: (Array.isArray(raw?.quarantined) ? raw.quarantined : []).map(cleanQuarantine).filter(Boolean),
		updatedAtMs: typeof raw?.updatedAtMs === "number" && Number.isFinite(raw.updatedAtMs) ? raw.updatedAtMs : null,
	};
};

/***
 * MARK: createFleetModelSnapshotStore
 * @description Creates one fleet snapshot store: `update(runners)` merges
 *   the live derivation into the snapshot (available unions refreshed,
 *   missing entries marked unavailable, malformed ids quarantined, caps
 *   enforced) and persists; `read()` serves `{ models, quarantined,
 *   updatedAtMs }` (id-sorted, cloned); `clear()` empties the store
 *   (tests). `filePath: null` or `''` disables persistence (pure memory).
 * @example const store = createFleetModelSnapshotStore({ filePath: '' }); store.update([]).models => []
 * @param {Object} [opts]
 * @param {string|null} [opts.filePath] - Explicit state path (undefined = configured default, null/'' = memory-only).
 * @param {Function} [opts.now] - Clock seam (ms epoch).
 * @returns {{update: Function, read: Function, clear: Function}} The store.
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
		if (models.size > FLEET_SNAPSHOT_MAX_MODELS) {
			const entries = [...models.values()].sort((a, b) => (a.lastSeenAtMs ?? 0) - (b.lastSeenAtMs ?? 0));
			for (const entry of entries) {
				if (models.size <= FLEET_SNAPSHOT_MAX_MODELS) break;
				if (!entry.available) models.delete(entry.id);
			}
			for (const entry of entries) {
				if (models.size <= FLEET_SNAPSHOT_MAX_MODELS) break;
				models.delete(entry.id);
			}
		}
		if (quarantined.size > FLEET_SNAPSHOT_MAX_QUARANTINED) {
			const entries = [...quarantined.values()].sort((a, b) => (a.lastSeenAtMs ?? 0) - (b.lastSeenAtMs ?? 0));
			for (const record of entries) {
				if (quarantined.size <= FLEET_SNAPSHOT_MAX_QUARANTINED) break;
				quarantined.delete(record.id);
			}
		}
	};

	const read = () => {
		const sorted = [...models.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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
						harnesses: new Set(),
						tiers: new Set(),
						runnerIds: new Set(),
						provenance: {},
					};
					live.set(entry.id, slot);
				}
				for (const h of entry.harnesses) slot.harnesses.add(h);
				for (const t of entry.tiers) slot.tiers.add(t);
				slot.runnerIds.add(runnerId);
				slot.provenance[runnerId] = {
					harnesses: [...entry.harnesses],
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
			models.set(id, {
				id,
				form: slot.form,
				harness: slot.harness,
				provider: slot.provider,
				model: slot.model,
				reasoning: slot.reasoning,
				harnesses: [...slot.harnesses].sort(),
				tiers: [...slot.tiers].sort(),
				runnerIds: [...slot.runnerIds].sort(),
				runnerCount: slot.runnerIds.size,
				available: true,
				unavailableReason: null,
				firstSeenAtMs: previous?.firstSeenAtMs ?? seenAt,
				lastSeenAtMs: seenAt,
				provenance: slot.provenance,
			});
		}
		for (const [id, entry] of models) {
			if (!live.has(id) && entry.available) {
				models.set(id, {
					...entry,
					available: false,
					unavailableReason: FLEET_ENTRY_UNAVAILABLE_REASON,
					runnerIds: [],
					runnerCount: 0,
				});
			}
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

	const clear = () => {
		models.clear();
		quarantined.clear();
		updatedAtMs = null;
		persist();
	};

	return { update, read, clear };
};
