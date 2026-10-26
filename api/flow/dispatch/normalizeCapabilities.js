/***
 * MARK: normalizeCapabilities
 * @description Validates and normalizes a Runner's heartbeat facts into a
 *   capability advertisement struct: harnesses (id + version), models,
 *   tiers, runnable flag, disk headroom, and protocol versions. Unknown
 *   shapes are rejected with an explanatory error list instead of throwing,
 *   so the register/heartbeat routes can answer 400 with all problems.
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
				if (typeof m === "string" && m.trim()) models.push(m.trim());
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

	return { harnesses, models, tiers, runnable, diskHeadroomMb, versions, errors };
}
