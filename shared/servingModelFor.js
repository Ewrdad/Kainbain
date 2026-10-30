/***
 * MARK: servingModelFor
 * @description THE single source of truth for "which model does this
 *   assignment serve?", shared verbatim by the Runner (`runner/daemon.js`,
 *   which reports it on the `prompted` progress event and inside the
 *   completion posture string) and the backend (`api/flow/`, re-exported
 *   through `api/flow/runnerPosture.js`) so the two can never drift.
 *
 *   Rules, in order:
 *   1. Non-LLM stage kinds (ci/script/deploy/command/merge/integrate/
 *      integration/human) serve NO model and report `null` — even if a
 *      model string arrives by accident. CI stages run a command, not an
 *      LLM, so inventing a model for them is a lie the UI would render.
 *   2. Otherwise the dispatched task's required model wins (`model`).
 *   3. Otherwise the Runner's configured default (`fallbackModel`) wins —
 *      that is the model the harness actually runs in single-assignment
 *      mode or for a model-less task.
 *   4. Otherwise `null`.
 *
 *   The literal string `"default"` is NEVER returned: `null` means "no
 *   model to report" and downstream (client body builder, posture
 *   formatter, ledger, UI pills) treats it as "omit the field", whereas
 *   `"default"` used to render as a fake model on every CI stage.
 *   Blank/whitespace-only and non-string inputs count as absent, so a
 *   malformed dispatch answer degrades to "no model" instead of leaking
 *   `"  "` into the UI. Kind matching is case-insensitive and trimmed.
 * @example servingModelFor({ kind: 'agent', model: 'kimi-k3:cloud', fallbackModel: 'x' }) => 'kimi-k3:cloud'
 * @example servingModelFor({ kind: 'agent', model: '', fallbackModel: 'runner-default' }) => 'runner-default'
 * @example servingModelFor({ kind: 'ci', model: 'anything', fallbackModel: 'x' }) => null
 * @example servingModelFor({ kind: 'agent', model: '   ', fallbackModel: '   ' }) => null
 * @param {Object} [opts]
 * @param {string} [opts.kind] - Assignment kind (stage type, normalized by the backend: `ci` for ci/script/deploy/command, `merge`/`integrate` for merges).
 * @param {string} [opts.model] - Model required by the dispatched task (`requirements.model`).
 * @param {string} [opts.fallbackModel] - The Runner's configured default model (`config.model`).
 * @returns {string|null} The served model, or `null` when the assignment serves no LLM.
 ***/
export function servingModelFor({ kind, model, fallbackModel } = {}) {
	// Stage kinds that never run an LLM. The backend normalizes
	// ci/script/deploy/command to `ci` before dispatch, but the raw types
	// are listed too so a hand-rolled or older dispatch answer still fails
	// safe (reports no model) instead of reporting one that is not in use.
	const nonLlmKinds = new Set([
		"ci",
		"script",
		"deploy",
		"command",
		"merge",
		"integrate",
		"integration",
		"human",
	]);
	const k = String(kind ?? "").trim().toLowerCase();
	if (nonLlmKinds.has(k)) return null;
	const clean = (value) =>
		typeof value === "string" && value.trim() ? value.trim() : null;
	const explicit = clean(model);
	if (explicit) return explicit;
	return clean(fallbackModel);
}
