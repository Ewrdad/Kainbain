import {
	ALIAS_HARNESS_ID,
	aliasTargetsSignature,
	getAliasTargets,
	normalizeAliasName,
	resolveAlias,
	selectWeightedIndex,
} from "../shared/modelAliases.js";

/***
 * MARK: aliasSelector
 * @description THE single place that picks which weighted target of a model
 *   alias serves one stage run. Every alias reference resolves through
 *   `selectAliasTarget` — explicit per-stage refs and inherited
 *   project-default aliases via `resolveStageTarget` (`api/agentRunner.js`),
 *   display reads via `SessionStore.resolveDisplayHarness`, project-default
 *   session creation via `SessionStore._resolveHarness`, and explicit stuck-
 *   check diagnoses (`api/stuckCheck.js`) — so every path shares one counter
 *   per alias and can never diverge or double-count. No caller may pass the
 *   virtual id `"alias"` into harness resolution: resolve here first.
 *
 *   Selection is smooth weighted round-robin over the stored integer
 *   percents (see `selectWeightedIndex` in `shared/modelAliases.js`): with
 *   90/10 the minority target fires exactly every 10th resolution, evenly
 *   spread instead of randomly clustered, and the sequence is deterministic
 *   and replayable in tests. Counters live in memory per server process,
 *   keyed `projectId:aliasName` — tasks on one server share the counter
 *   (global load balance, by design); a restart resets the phase while the
 *   proportions stay exact from the first resolution. Two server processes
 *   each keep their own counters (statistically correct, not exact across
 *   instances — acceptable for quota balancing, and nothing is persisted).
 *
 *   Targets whose harness is unknown right now are skipped for that
 *   resolution (their share redistributes across the remaining targets);
 *   when NO target has a known harness the selector returns null and the
 *   caller keeps its existing loud unknown-alias fallback.
 ***/

/** Per-alias running scores, keyed `projectId:aliasName`. */
const aliasCounters = new Map();

/***
 * MARK: counterKeyFor
 * @description Builds the counter key for an alias resolution (project id +
 *   alias name, so two projects or two aliases never share a rotation).
 * @example counterKeyFor({ id: "p1" }, "small") => "p1:small"
 * @param {Object} [project] - Project entity.
 * @param {string} aliasName - Normalized alias name.
 * @returns {string} Counter key.
 ***/
export function counterKeyFor(project, aliasName) {
	const projectId =
		typeof project?.id === "string" && project.id ? project.id : "default";
	return `${projectId}:${aliasName}`;
}

/***
 * MARK: selectAliasTarget
 * @description Resolves one alias to the concrete `{ harness, model }`
 *   target serving this stage run, advancing the alias's round-robin
 *   counter. Unknown/deleted aliases (and alias→alias loops, which never
 *   survive `getAliasTargets`) return null — the caller warns loudly and
 *   falls back to the project default, never silently running the wrong
 *   model. Pass `state` (a `{ scores }` holder) in tests for deterministic
 *   replay without touching the shared counters.
 * @example selectAliasTarget({ modelAliases: [{ name: "s", harness: "pi", model: "m" }] }, "s") => { harness: "pi", model: "m", aliasName: "s", targetIndex: 0 }
 * @param {Object} [project] - Project entity (`modelAliases`, optional `id` for counter scoping).
 * @param {unknown} name - Alias name.
 * @param {Object} [opts]
 * @param {Function} [opts.isHarnessKnown] - `(harnessName) => boolean`; targets on unknown harnesses are skipped for this resolution (defaults to all-known).
 * @param {Object} [opts.state] - Injectable `{ scores: Array<number>, fingerprint: string }` holder replacing the shared counter (tests).
 * @param {boolean} [opts.peek] - When true, reports the next target WITHOUT advancing the counter (display-only reads such as queue listings must never consume a rotation step).
 * @returns {{harness: string, model: string, aliasName: string, targetIndex: number}|null} Concrete target, or null when unresolvable.
 ***/
export function selectAliasTarget(project, name, opts = {}) {
	const aliasName = normalizeAliasName(name);
	if (!aliasName || aliasName === "default") return null;
	const alias = resolveAlias(project, aliasName);
	if (!alias) return null;
	const targets = getAliasTargets(alias);
	if (targets.length === 0) return null;
	const isKnown =
		typeof opts.isHarnessKnown === "function" ? opts.isHarnessKnown : null;
	const eligible = targets
		.map((target, index) => ({ target, index }))
		.filter(
			({ target }) =>
				target.harness !== ALIAS_HARNESS_ID &&
				(!isKnown || isKnown(target.harness)),
		);
	if (eligible.length === 0) return null;
	if (eligible.length === 1) {
		return {
			harness: eligible[0].target.harness,
			model: eligible[0].target.model,
			aliasName,
			targetIndex: eligible[0].index,
		};
	}
	const fingerprint = aliasTargetsSignature({ targets });
	const weights = eligible.map(({ target }) => target.percent);
	if (opts.peek) {
		const key = counterKeyFor(project, aliasName);
		const counter = aliasCounters.get(key);
		const live =
			counter &&
			counter.fingerprint === fingerprint &&
			Array.isArray(counter.scores) &&
			counter.scores.length === eligible.length;
		const preview = live ? [...counter.scores] : eligible.map(() => 0);
		const winner = selectWeightedIndex(weights, preview);
		// eslint-disable-next-line security/detect-object-injection -- winner is a bounded round-robin index, never external input
		const picked = eligible[winner];
		return {
			harness: picked.target.harness,
			model: picked.target.model,
			aliasName,
			targetIndex: picked.index,
		};
	}
	let scores;
	if (opts.state && typeof opts.state === "object") {
		if (
			opts.state.fingerprint !== fingerprint ||
			!Array.isArray(opts.state.scores) ||
			opts.state.scores.length !== eligible.length
		) {
			opts.state.scores = eligible.map(() => 0);
			opts.state.fingerprint = fingerprint;
		}
		scores = opts.state.scores;
	} else {
		const key = counterKeyFor(project, aliasName);
		let counter = aliasCounters.get(key);
		if (
			!counter ||
			counter.fingerprint !== fingerprint ||
			!Array.isArray(counter.scores) ||
			counter.scores.length !== eligible.length
		) {
			counter = { fingerprint, scores: eligible.map(() => 0) };
			aliasCounters.set(key, counter);
		}
		scores = counter.scores;
	}
	const winner = selectWeightedIndex(weights, scores);
	// eslint-disable-next-line security/detect-object-injection -- winner is a bounded round-robin index, never external input
	const picked = eligible[winner];
	return {
		harness: picked.target.harness,
		model: picked.target.model,
		aliasName,
		targetIndex: picked.index,
	};
}

/***
 * MARK: resetAliasCounters
 * @description Clears every in-memory round-robin counter (tests isolate
 *   alias rotations through this; production never calls it).
 * @example resetAliasCounters() => undefined
 ***/
export function resetAliasCounters() {
	aliasCounters.clear();
}
