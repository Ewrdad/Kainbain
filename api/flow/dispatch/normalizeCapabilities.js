/***
 * MARK: sanitizeDiscoveryStatus
 * @description Bounds one Runner-reported per-harness discovery status to a
 *   servable shape: at most 64 harness entries, each a plain
 *   `{ok,count,atMs,error?}` with a finite non-negative count, a finite
 *   timestamp (or null), and a `{code,message?,hint?}` error with capped
 *   strings. Lenient like the models list (malformed slices are dropped,
 *   never rejected): status is advisory display data, and a cosmetic
 *   field must never 400 a heartbeat. Well-formed Runner output passes
 *   through byte-identical.
 * @example sanitizeDiscoveryStatus({ pi: { ok: true, count: 2, atMs: 1 } }) => { pi: { ok: true, count: 2, atMs: 1 } }
 * @param {Object} value - Raw `facts.discoveryStatus` object.
 * @returns {Object} Sanitized status (possibly empty).
 ***/
const sanitizeDiscoveryStatus = (value) => {
	const out = {};
	const entries = Object.entries(value);
	for (let i = 0; i < entries.length && Object.keys(out).length < 64; i += 1) {
		const [harnessId, slice] = entries[i];
		if (typeof harnessId !== "string" || !harnessId.trim() || harnessId.length > 64) continue;
		if (!slice || typeof slice !== "object" || Array.isArray(slice)) continue;
		let error;
		const rawError = slice.error;
		if (rawError && typeof rawError === "object" && !Array.isArray(rawError)
			&& typeof rawError.code === "string" && rawError.code.trim()) {
			error = { code: rawError.code.trim().slice(0, 120) };
			if (typeof rawError.message === "string" && rawError.message) {
				error.message = rawError.message.slice(0, 500);
			}
			if (typeof rawError.hint === "string" && rawError.hint) {
				error.hint = rawError.hint.slice(0, 500);
			}
		}
		out[harnessId] = {
			ok: typeof slice.ok === "boolean" ? slice.ok : !error,
			count: typeof slice.count === "number" && Number.isFinite(slice.count) && slice.count >= 0
				? Math.min(Math.floor(slice.count), 1000000)
				: 0,
			atMs: typeof slice.atMs === "number" && Number.isFinite(slice.atMs) && slice.atMs >= 0
				? slice.atMs
				: null,
			...(error ? { error } : {}),
		};
	}
	return out;
};

/***
 * MARK: sanitizeModelProvenance
 * @description Bounds one Runner-reported per-model provenance map to a
 *   servable shape: at most 1000 id entries, each a plain
 *   `{harness?, atMs?}` with a short harness string and a finite
 *   timestamp (or null). Lenient like the discovery status (malformed
 *   entries are dropped, never rejected): provenance is advisory display
 *   data, and a cosmetic field must never 400 a heartbeat.
 * @example sanitizeModelProvenance({ 'muse::meta::m': { harness: 'muse', atMs: 1 } }) => { 'muse::meta::m': { harness: 'muse', atMs: 1 } }
 * @param {Object} value - Raw `facts.modelProvenance` object.
 * @returns {Object} Sanitized provenance (possibly empty).
 ***/
const sanitizeModelProvenance = (value) => {
	const out = {};
	const entries = Object.entries(value);
	for (let i = 0; i < entries.length && Object.keys(out).length < 1000; i += 1) {
		const [id, slice] = entries[i];
		if (typeof id !== "string" || !id.trim() || id.length > 500) continue;
		if (!slice || typeof slice !== "object" || Array.isArray(slice)) continue;
		const entry = {};
		if (typeof slice.harness === "string" && slice.harness.trim()) {
			entry.harness = slice.harness.trim().slice(0, 64);
		}
		if (typeof slice.atMs === "number" && Number.isFinite(slice.atMs) && slice.atMs >= 0) {
			entry.atMs = slice.atMs;
		} else {
			entry.atMs = null;
		}
		out[id] = entry;
	}
	return out;
};

/***
 * MARK: normalizeCapabilities
 * @description Validates and normalizes a Runner's heartbeat facts into a
 *   capability advertisement struct: harnesses (id + version), models,
 *   tiers, runnable flag, disk headroom, protocol versions, the additive
 *   per-harness discovery status, and the additive model advertisement
 *   source + per-model provenance (all sanitized, absent for old Runners;
 *   a malformed value is dropped, never an error). Unknown
 *   shapes are rejected with an explanatory error list instead of
 *   throwing, so the register/heartbeat routes can answer 400 with all
 *   problems.
 * @example normalizeCapabilities({ harnesses: [{ id: 'pi', version: '1.2.3' }], tiers: ['T1'] }) => { harnesses: [...], errors: [] }
 * @param {Object} [facts] - Raw heartbeat facts.
 * @returns {Object} Normalized capabilities plus `errors`.
 ***/
export function normalizeCapabilities(facts = {}) {
	const errors = [];
	const src = facts && typeof facts === "object" ? facts : {};

	const harnesses = [];
	if (src.harnesses !== undefined) {
		if (!Array.isArray(src.harnesses)) {
			errors.push("harnesses must be an array");
		} else {
			for (const h of src.harnesses) {
				if (!h || typeof h.id !== "string" || !h.id.trim()) {
					errors.push("every harness needs a non-empty string id");
					continue;
				}
				harnesses.push({
					id: h.id.trim(),
					version:
						typeof h.version === "string" && h.version.trim()
							? h.version.trim()
							: "unknown",
				});
			}
		}
	}

	const models = [];
	if (src.models !== undefined) {
		if (!Array.isArray(src.models)) {
			errors.push("models must be an array");
		} else {
			for (const m of src.models) {
				if (typeof m !== "string" || !m.trim()) continue;
				const cleanedModel = m.trim();
				// The "default" sentinel is harness-managed, not a model
				// a Runner can serve: an old or hand-configured Runner
				// advertising it would match nothing real (no task ever
				// requires "default"), so drop it instead of letting it
				// pose as a capability. Duplicates carry no information.
				if (cleanedModel.toLowerCase() === "default") continue;
				if (!models.includes(cleanedModel)) models.push(cleanedModel);
			}
		}
	}

	const tiers = [];
	if (src.tiers !== undefined) {
		if (!Array.isArray(src.tiers)) {
			errors.push("tiers must be an array");
		} else {
			for (const t of src.tiers) {
				if (typeof t === "string" && /^T[0-3]$/.test(t.trim())) {
					if (!tiers.includes(t.trim())) tiers.push(t.trim());
				} else {
					errors.push(`unknown tier ${JSON.stringify(t)} (want T0..T3)`);
				}
			}
		}
	}

	let runnable = true;
	if (src.runnable !== undefined) {
		if (typeof src.runnable !== "boolean") {
			errors.push("runnable must be a boolean");
		} else {
			runnable = src.runnable;
		}
	}

	let diskHeadroomMb = null;
	if (src.diskHeadroomMb !== undefined && src.diskHeadroomMb !== null) {
		if (
			typeof src.diskHeadroomMb !== "number" ||
			!Number.isFinite(src.diskHeadroomMb) ||
			src.diskHeadroomMb < 0
		) {
			errors.push("diskHeadroomMb must be a non-negative number");
		} else {
			diskHeadroomMb = src.diskHeadroomMb;
		}
	}

	const versions =
		src.versions && typeof src.versions === "object" ? src.versions : {};

	let discoveryStatus;
	if (src.discoveryStatus !== undefined) {
		if (src.discoveryStatus === null) {
			discoveryStatus = null;
		} else if (typeof src.discoveryStatus === "object" && !Array.isArray(src.discoveryStatus)) {
			discoveryStatus = sanitizeDiscoveryStatus(src.discoveryStatus);
		}
		// Anything else (a string, number, or array from a buggy Runner)
		// is dropped silently: discovery status is advisory display data
		// for Settings, and a cosmetic field must never 400 a heartbeat
		// and take a working Runner offline.
	}

	let modelSource;
	if (src.modelSource !== undefined) {
		if (src.modelSource === "pinned" || src.modelSource === "discovered" || src.modelSource === "unpinned") {
			modelSource = src.modelSource;
		}
		// Anything else is dropped silently (same advisory rule as above).
	}

	let modelProvenance;
	if (src.modelProvenance !== undefined) {
		if (src.modelProvenance !== null && typeof src.modelProvenance === "object" && !Array.isArray(src.modelProvenance)) {
			modelProvenance = sanitizeModelProvenance(src.modelProvenance);
		}
		// Anything else is dropped silently (same advisory rule as above).
	}

	return {
		harnesses,
		models,
		tiers,
		runnable,
		diskHeadroomMb,
		versions,
		errors,
		...(discoveryStatus !== undefined ? { discoveryStatus } : {}),
		...(modelSource !== undefined ? { modelSource } : {}),
		...(modelProvenance !== undefined ? { modelProvenance } : {}),
	};
}
