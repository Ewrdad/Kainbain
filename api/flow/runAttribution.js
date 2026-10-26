/***
 * MARK: Timeline run attribution
 * @description The one shared shape for the resolved harness/model/alias
 *   choice stamped on task timeline rows (task history), so a troublesome
 *   model can be identified per stage or task. Field names are IDENTICAL to
 *   `reportMetadata` (one concept = one name): `harnessId`, `modelRef`,
 *   `aliasName`, `targetIndex`. Absent values are dropped, never worded —
 *   CI / merge / deploy / human rows simply carry no fields and the UI
 *   renders nothing for them (no "no model" / "automated" placeholders).
 *
 * Failure contract: total on untrusted input (never throws, never invents
 *   sentinel strings for absence).
 ***/

/***
 * MARK: buildTimelineAttribution
 * @description Normalizes one run's resolved choice into the shared
 *   timeline-attribution shape. Blank/undefined string fields are dropped
 *   (absent, not blank-worded); `targetIndex` survives only as a genuine
 *   integer; unknown fields (e.g. the in-memory `stageId` matcher) are never
 *   passed through. Returns null when neither `harnessId` nor `modelRef`
 *   names anything — the caller then spreads nothing, so a row with no
 *   agent run behind it stays completely blank.
 * @example buildTimelineAttribution({ harnessId: 'pi', modelRef: 'glm', aliasName: 'w', targetIndex: 0 }) => { harnessId: 'pi', modelRef: 'glm', aliasName: 'w', targetIndex: 0 }
 * @example buildTimelineAttribution({ aliasName: 'w' }) => null
 * @example buildTimelineAttribution({}) => null
 * @param {Object} [attribution] - Raw attribution fields (`harnessId`, `modelRef`, `aliasName`, `targetIndex`).
 * @returns {{ harnessId: string, modelRef: string, aliasName?: string, targetIndex?: number }|null} The clean shape, or null when nothing meaningful remains.
 ***/
export function buildTimelineAttribution(attribution = {}) {
	try {
		const raw = attribution && typeof attribution === "object" ? attribution : {};
		const cleanString = (value) =>
			typeof value === "string" && value.trim() ? value.trim() : null;
		const harnessId = cleanString(raw.harnessId);
		const modelRef = cleanString(raw.modelRef);
		const aliasName = cleanString(raw.aliasName);
		const targetIndex =
			Number.isInteger(raw.targetIndex) && raw.targetIndex >= 0
				? raw.targetIndex
				: null;
		// A row is attributable only when a harness or a model actually ran;
		// an alias name or index alone never stamps a row.
		if (!harnessId && !modelRef) return null;
		return {
			...(harnessId ? { harnessId } : {}),
			...(modelRef ? { modelRef } : {}),
			...(aliasName ? { aliasName } : {}),
			...(targetIndex !== null ? { targetIndex } : {}),
		};
	} catch {
		return null;
	}
}

/***
 * MARK: isArrivalTimelineRowStatus
 * @description True for timeline statuses that record an ARRIVAL into the
 *   row's stage (Moved / Advanced / Failed back, including suffixed forms
 *   like 'Advanced (First Stage)'), as opposed to outcome rows (Failed /
 *   Retrying / Completed) that record what happened IN the row's stage.
 *   Mirrors the frontend arrival match in taskFormatters.js.
 * @example isArrivalTimelineRowStatus('Advanced (First Stage)') => true
 * @example isArrivalTimelineRowStatus('Failed') => false
 * @param {string} [status] - Stored timeline row status.
 * @returns {boolean} True when the row is an arrival into its stage.
 ***/
function isArrivalTimelineRowStatus(status) {
	const normalized =
		typeof status === "string" ? status.trim().toLowerCase() : "";
	return (
		normalized === "moved" ||
		normalized.startsWith("moved ") ||
		normalized === "advanced" ||
		normalized.startsWith("advanced ") ||
		normalized === "failed back" ||
		normalized.startsWith("failed back ")
	);
}

/***
 * MARK: stampArrivalRowAttribution
 * @description Stamps one run's resolved choice onto the most recent ARRIVAL
 *   row into `arrivalLabel` — the row headed with the run's OWN stage name —
 *   so a row's attribution always describes the run of the stage the row is
 *   about, never the previous stage's run (an agent run must never put its
 *   badge on a human / CI stage's row). Searches newest-first; outcome rows
 *   (Failed / Retrying / Completed) are never touched. Returns the stamped
 *   row, or null when there is no matching arrival row or nothing meaningful
 *   to stamp — the caller then writes nothing.
 * @example stampArrivalRowAttribution(task, 'Build', { harnessId: 'pi', modelRef: 'glm' }) => the 'Build' arrival row, now stamped
 * @example stampArrivalRowAttribution(task, 'Build', {}) => null
 * @param {Object} [task] - Task object (timeline array walked newest-first).
 * @param {string} [arrivalLabel] - Stage label of the arrival row to stamp (the run's own stage).
 * @param {Object} [attribution] - Raw attribution fields (`harnessId`, `modelRef`, `aliasName`, `targetIndex`).
 * @returns {Object|null} The stamped timeline row, or null when nothing was stamped.
 ***/
export function stampArrivalRowAttribution(
	task,
	arrivalLabel,
	attribution = {},
) {
	try {
		const clean = buildTimelineAttribution(attribution);
		if (!clean) return null;
		const label =
			typeof arrivalLabel === "string" && arrivalLabel.trim()
				? arrivalLabel.trim()
				: null;
		if (!label) return null;
		const timeline = task && Array.isArray(task.timeline) ? task.timeline : [];
		for (let i = timeline.length - 1; i >= 0; i--) {
			const row = timeline[i];
			if (!row || typeof row !== "object") continue;
			if (String(row.stage ?? "") !== label) continue;
			if (!isArrivalTimelineRowStatus(row.status)) continue;
			Object.assign(row, clean);
			return row;
		}
		return null;
	} catch {
		return null;
	}
}
