/***
 * MARK: modelKeys (shared grammar)
 * @description THE single implementation of the KainBain model-key grammar,
 *   shared verbatim by the backend engine (`api/models.js`) and the frontend
 *   switcher (`frontend/src/services/api.js`) so the two grammars cannot
 *   drift. Plain ESM, zero dependencies.
 *
 *   A model is identified by one of four reference forms:
 *
 *     1. `harness::provider::id::reasoning` — CANONICAL with reasoning level (optional 4th segment)
 *     2. `harness::provider::id`            — CANONICAL, harness-scoped
 *     3. `provider::id`                     — legacy composite key (still accepted)
 *     4. bare `id` or `name`                — oldest form (first-match fallback)
 *
 *   Parsing rule: split on the FIRST `::`, then the NEXT `::`, then the
 *   optional THIRD `::` — never `split("::")`, because model ids may contain
 *   single `:` (e.g. `glm-5.3-flash:cloud`) but never `::`. No segment may
 *   itself contain `::`; harness ids must be lowercase `[a-z0-9][a-z0-9_-]*`
 *   (URL-safe). Malformed keys are rejected (parse returns null, builders throw)
 *   — they are never parsed incorrectly and passed along silently. Keys with
 *   5 or more segments are malformed.
 ***/

export const MODEL_KEY_SEP = "::";

/** Harness ids are lowercase, start alphanumeric, and are URL-safe. */
export const HARNESS_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/***
 * MARK: modelKey
 * @description Builds the legacy provider-scoped composite key for a model so
 *   the same model id from different providers can be distinguished. Mirrors
 *   the pi SDK's internal composite identity (`${provider}\0${id}`) but uses
 *   a printable separator safe for storage and URLs. Still accepted
 *   everywhere; prefer `harnessModelKey` for new producers.
 * @example modelKey('ollama-cloud', 'deepseek-v4-flash:0731-cloud') => 'ollama-cloud::deepseek-v4-flash:0731-cloud'
 * @param {string} provider - Provider id (e.g. 'ollama-cloud', 'google').
 * @param {string} id - Bare model id (may contain single `:`).
 * @returns {string} Composite `${provider}::${id}` key.
 ***/
export function modelKey(provider, id) {
	return `${provider}${MODEL_KEY_SEP}${id}`;
}

/***
 * MARK: harnessModelKey
 * @description Builds the canonical harness-scoped key `harness::provider::id`
 *   so the same `provider::id` exposed by two different harnesses cannot
 *   collide. Rejects malformed segments with a thrown error instead of
 *   building an ambiguous key: the harness id must match
 *   `[a-z0-9][a-z0-9_-]*`, and no segment may contain or be empty of the
 *   `::` separator.
 * @example harnessModelKey('pi', 'ollama-cloud', 'glm-5.3-flash:cloud') => 'pi::ollama-cloud::glm-5.3-flash:cloud'
 * @param {string} harness - Harness id (e.g. 'pi').
 * @param {string} provider - Provider id.
 * @param {string} id - Bare model id (may contain single `:`).
 * @returns {string} Canonical `${harness}::${provider}::${id}` key.
 * @throws {Error} When any segment is empty, contains `::`, or the harness id is not a valid lowercase harness id.
 ***/
export function harnessModelKey(harness, provider, id) {
	if (typeof harness !== "string" || !HARNESS_ID_PATTERN.test(harness)) {
		throw new Error(
			`Invalid harness id '${harness}': must match [a-z0-9][a-z0-9_-]*`,
		);
	}
	if (
		typeof provider !== "string" ||
		!provider ||
		provider.includes(MODEL_KEY_SEP)
	) {
		throw new Error(
			`Invalid model provider '${provider}': must be non-empty and free of '${MODEL_KEY_SEP}'`,
		);
	}
	if (typeof id !== "string" || !id || id.includes(MODEL_KEY_SEP)) {
		throw new Error(
			`Invalid model id '${id}': must be non-empty and free of '${MODEL_KEY_SEP}'`,
		);
	}
	return `${harness}${MODEL_KEY_SEP}${provider}${MODEL_KEY_SEP}${id}`;
}

/***
 * MARK: parseModelKey
 * @description Parses any accepted model reference into its segments. Splits
 *   on the first three `::` occurrences only, so ids that contain single `:`
 *   (e.g. `pi::ollama-cloud::glm-5.3-flash:cloud::high`) survive intact, and
 *   ids can never be truncated. Returns `{ form, ...segments }` or null when
 *   the reference is structurally malformed (an empty non-final segment, or
 *   five-plus segments) — callers treat null like an opaque string and never
 *   throw, so arbitrary user input cannot crash resolution.
 * @example parseModelKey('pi::ollama-cloud::glm-5.3-flash:cloud::high') => { form: 'harnessReasoning', harness: 'pi', provider: 'ollama-cloud', id: 'glm-5.3-flash:cloud', reasoning: 'high' }
 * @example parseModelKey('pi::ollama-cloud::glm-5.3-flash:cloud') => { form: 'harness', harness: 'pi', provider: 'ollama-cloud', id: 'glm-5.3-flash:cloud' }
 * @example parseModelKey('ollama-cloud::glm-5.3-flash:cloud') => { form: 'provider', provider: 'ollama-cloud', id: 'glm-5.3-flash:cloud' }
 * @example parseModelKey('glm-5.3-flash:cloud') => { form: 'bare', id: 'glm-5.3-flash:cloud' }
 * @example parseModelKey('p::i::extra::more::evenmore') => null (5 segments)
 * @param {string|undefined} ref - Any model reference.
 * @returns {Object|null} Parsed segments, or null when malformed.
 ***/
export function parseModelKey(ref) {
	if (ref === undefined || ref === null) return null;
	const raw = String(ref);
	if (!raw) return null;

	const first = raw.indexOf(MODEL_KEY_SEP);
	if (first === -1) {
		return { form: "bare", id: raw };
	}

	const second = raw.indexOf(MODEL_KEY_SEP, first + MODEL_KEY_SEP.length);
	if (second === -1) {
		const provider = raw.slice(0, first);
		const id = raw.slice(first + MODEL_KEY_SEP.length);
		if (!provider || !id) return null;
		return { form: "provider", provider, id };
	}

	const third = raw.indexOf(MODEL_KEY_SEP, second + MODEL_KEY_SEP.length);
	if (third === -1) {
		const harness = raw.slice(0, first);
		const provider = raw.slice(first + MODEL_KEY_SEP.length, second);
		const id = raw.slice(second + MODEL_KEY_SEP.length);
		if (!harness || !provider || !id || id.includes(MODEL_KEY_SEP)) return null;
		return { form: "harness", harness, provider, id };
	}

	const harness = raw.slice(0, first);
	const provider = raw.slice(first + MODEL_KEY_SEP.length, second);
	const id = raw.slice(second + MODEL_KEY_SEP.length, third);
	const reasoning = raw.slice(third + MODEL_KEY_SEP.length);
	if (!harness || !provider || !id || !reasoning) return null;
	if (reasoning.includes(MODEL_KEY_SEP)) return null; // 5+ segments => malformed
	return { form: "harnessReasoning", harness, provider, id, reasoning };
}

/***
 * MARK: splitReasoning
 * @description Splits an optional reasoning level off a model reference:
 *   `pi::provider::id::high` => { baseRef: 'pi::provider::id', reasoning: 'high' }.
 *   For 1–3 part references and non-reasoning refs, returns { baseRef: ref, reasoning: null }.
 *   Accepts either a string reference or a labelled options object (`{ ref }` or `{ modelRef }`).
 * @example splitReasoning('pi::provider::id::high') => { baseRef: 'pi::provider::id', reasoning: 'high' }
 * @example splitReasoning({ modelRef: 'pi::provider::id::high' }) => { baseRef: 'pi::provider::id', reasoning: 'high' }
 * @example splitReasoning('pi::provider::id') => { baseRef: 'pi::provider::id', reasoning: null }
 * @param {string|Object|undefined} refOrOpts - Model reference string or options object.
 * @returns {{baseRef: string, reasoning: string|null}}
 ***/
export function splitReasoning(refOrOpts) {
	if (refOrOpts === undefined || refOrOpts === null) {
		return { baseRef: "", reasoning: null };
	}
	const candidate =
		refOrOpts && typeof refOrOpts === "object"
			? (refOrOpts.modelRef ?? refOrOpts.ref ?? "")
			: refOrOpts;
	const raw = String(candidate).trim();
	if (!raw) return { baseRef: "", reasoning: null };
	const parsed = parseModelKey(raw);
	if (parsed?.form === "harnessReasoning") {
		return {
			baseRef: harnessModelKey(parsed.harness, parsed.provider, parsed.id),
			reasoning: parsed.reasoning,
		};
	}
	return { baseRef: raw, reasoning: null };
}

/***
 * MARK: stripReasoning
 * @description Strips the reasoning level off a 4-part reference if present,
 *   returning the canonical 3-part base reference. 1–3 part references pass through untouched.
 *   Accepts either a string reference or a labelled options object (`{ ref }` or `{ modelRef }`).
 * @example stripReasoning('pi::p::m::high') => 'pi::p::m'
 * @example stripReasoning({ modelRef: 'pi::p::m::high' }) => 'pi::p::m'
 * @example stripReasoning('pi::p::m') => 'pi::p::m'
 * @param {string|Object|undefined} refOrOpts
 * @returns {string}
 ***/
export function stripReasoning(refOrOpts) {
	return splitReasoning(refOrOpts).baseRef;
}

/***
 * MARK: appendReasoning
 * @description Appends or replaces an optional reasoning level on a harness-scoped model reference.
 *   Rejects non-harness references (bare or 2-part keys) and malformed level values with thrown errors.
 *   Accepts either positional arguments `(ref, level)` or a labelled options object (`{ ref, level }` or `{ modelRef, level }`).
 * @example appendReasoning('pi::p::m', 'high') => 'pi::p::m::high'
 * @example appendReasoning({ ref: 'pi::p::m', level: 'high' }) => 'pi::p::m::high'
 * @example appendReasoning('pi::p::m::low', 'high') => 'pi::p::m::high'
 * @param {string|Object} refOrOpts - Harness-scoped reference (3 or 4 part) or options object.
 * @param {string} [maybeLevel] - Reasoning level (when refOrOpts is string).
 * @returns {string} 4-part model reference with reasoning level.
 * @throws {Error} When ref is not a valid harness reference or level is invalid.
 ***/
export function appendReasoning(refOrOpts, maybeLevel) {
	let ref = refOrOpts;
	let level = maybeLevel;
	if (refOrOpts && typeof refOrOpts === "object") {
		ref = refOrOpts.modelRef ?? refOrOpts.ref;
		level = refOrOpts.level ?? maybeLevel;
	}
	if (
		typeof level !== "string" ||
		!level ||
		level.trim() !== level ||
		level.includes(MODEL_KEY_SEP)
	) {
		throw new Error(
			`Invalid reasoning level '${level}': must be a non-empty trimmed string free of '${MODEL_KEY_SEP}'`,
		);
	}
	const parsed = parseModelKey(ref);
	if (
		!parsed ||
		(parsed.form !== "harness" && parsed.form !== "harnessReasoning")
	) {
		throw new Error(
			`Cannot append reasoning level to non-harness model reference '${ref}': must be harness-scoped`,
		);
	}
	const base = harnessModelKey(parsed.harness, parsed.provider, parsed.id);
	return `${base}${MODEL_KEY_SEP}${level}`;
}

/***
 * MARK: checkReasoningLevelText
 * @description Reports whether a reasoning level value is usable text: a
 *   non-empty string with no surrounding whitespace and no `::` separator.
 *   Levels arrive from `parseModelKey` (which already guarantees non-empty
 *   and `::`-free), so the reachable failure is padding (`" high"`); the
 *   check still names every rule so save-time errors stay specific and
 *   runtime input can never slip a malformed level through.
 * @example checkReasoningLevelText({ level: 'high' }) => null
 * @example checkReasoningLevelText({ level: ' high' }) => 'must be a non-empty string without surrounding whitespace or "::"'
 * @example checkReasoningLevelText({ level: '' }) => 'must be a non-empty string without surrounding whitespace or "::"'
 * @param {Object} [opts]
 * @param {unknown} [opts.level] - Candidate reasoning level value.
 * @returns {string|null} Null when usable, else the reason it is not.
 ***/
export function checkReasoningLevelText({ level } = {}) {
	if (
		typeof level !== "string" ||
		!level ||
		level.trim() !== level ||
		level.includes(MODEL_KEY_SEP)
	) {
		return 'must be a non-empty string without surrounding whitespace or "::"';
	}
	return null;
}

/***
 * MARK: validateModelRefShape
 * @description Classifies a stored model reference by grammar shape WITHOUT
 *   resolving it against any catalog: `"harnessReasoning"` for 4-part keys,
 *   `"harness"` for canonical 3-part keys, `"provider"` for legacy 2-part keys,
 *   `"bare"` for bare ids/names (and sentinels such as `"default"`, which
 *   callers handle separately), and null when the reference is structurally
 *   malformed (an empty non-final segment, or five-plus segments) or blank/missing.
 * @example validateModelRefShape('pi::google::m::high') => 'harnessReasoning'
 * @example validateModelRefShape('pi::google::m') => 'harness'
 * @example validateModelRefShape('google::m') => 'provider'
 * @example validateModelRefShape('m') => 'bare'
 * @example validateModelRefShape('a::b::c::d::e') => null
 * @example validateModelRefShape('') => null
 * @param {string|undefined} ref - Any stored model reference.
 * @returns {"bare"|"provider"|"harness"|"harnessReasoning"|null} The shape, or null when malformed/blank.
 ***/
export function validateModelRefShape(ref) {
	if (ref === undefined || ref === null) return null;
	const raw = String(ref).trim();
	if (!raw) return null;
	const parsed = parseModelKey(raw);
	if (!parsed) return null;
	return parsed.form;
}

/***
 * MARK: classifiesForeignHarness
 * @description Reports whether a stored model reference is a canonical 3-part
 *   or 4-part key naming a DIFFERENT harness than the one being asked — i.e.
 *   the ref is not this harness's default at all. Only the canonical forms classify;
 *   legacy 2-part and bare refs are harness-agnostic by design and always
 *   report false.
 * @example classifiesForeignHarness('pi::google::m', 'antigravity') => true
 * @example classifiesForeignHarness('pi::google::m::high', 'antigravity') => true
 * @example classifiesForeignHarness('pi::google::m', 'pi') => false
 * @example classifiesForeignHarness('google::m', 'antigravity') => false
 * @param {string|undefined} ref - Any stored model reference.
 * @param {string} [harnessId] - The harness id asking (blank = never foreign).
 * @returns {boolean} True only for keys scoped to another harness.
 ***/
export function classifiesForeignHarness(ref, harnessId) {
	if (!harnessId || typeof harnessId !== "string") return false;
	if (ref === undefined || ref === null) return false;
	const raw = String(ref).trim();
	if (!raw) return false;
	const parsed = parseModelKey(raw);
	return (
		(parsed?.form === "harness" || parsed?.form === "harnessReasoning") &&
		parsed.harness !== harnessId
	);
}

/***
 * MARK: normalizeModelRef
 * @description Normalizes a stored model reference to the canonical
 *   harness-scoped form when possible: a legacy `provider::id` reference gets
 *   the default harness injected (`provider::id` → `harness::provider::id`).
 *   Anything that cannot be canonicalized is returned UNTOUCHED so sentinel
 *   values (`"default"`) and unresolvable input keep flowing to the resolvers'
 *   backward-compatible fallbacks instead of being mangled.
 * @example normalizeModelRef('ollama-cloud::glm-5.3-flash:cloud', 'pi') => 'pi::ollama-cloud::glm-5.3-flash:cloud'
 * @example normalizeModelRef('pi::ollama-cloud::glm-5.3-flash:cloud::high', 'pi') => 'pi::ollama-cloud::glm-5.3-flash:cloud::high' (preserved)
 * @example normalizeModelRef('default', 'pi') => 'default' (sentinel untouched)
 * @param {string|undefined} ref - Stored model reference (any accepted form).
 * @param {string} [defaultHarness] - Harness id to inject for legacy `provider::id` references.
 * @returns {string|undefined} The reference, canonical when possible.
 ***/
export function normalizeModelRef(ref, defaultHarness) {
	if (ref === undefined || ref === null) return ref;
	const raw = String(ref);
	if (!raw) return raw;
	const parsed = parseModelKey(raw);
	if (
		!parsed ||
		parsed.form === "bare" ||
		parsed.form === "harness" ||
		parsed.form === "harnessReasoning"
	) {
		return raw;
	}
	if (!defaultHarness) return raw;
	return harnessModelKey(defaultHarness, parsed.provider, parsed.id);
}

/***
 * MARK: withModelKey
 * @description Returns the model object with a `key` field attached, derived
 *   from its provider + id (plus the owning `harness` when supplied, which
 *   also stamps a `harness` field for the UI). Non-destructive; returns a
 *   shallow copy. Preserves `supportedReasoning` on `m` when present.
 * @example withModelKey({ id: 'gemma4:31b-cloud', provider: 'ollama-cloud' }) => { …, key: 'ollama-cloud::gemma4:31b-cloud' }
 * @example withModelKey({ id: 'm', provider: 'p' }, 'pi') => { …, key: 'pi::p::m', harness: 'pi' }
 * @param {Object} m - Model object with at least `provider` and `id`.
 * @param {string} [harness] - Owning harness id; scopes the key when supplied.
 * @returns {Object} Copy of `m` including a `key` (and `harness`) field.
 ***/
export function withModelKey(m, harness) {
	if (!m || typeof m !== "object") return m;
	// `supportedReasoning` (per-model advertised levels, when the catalog
	// entry carries it) rides along on every spread below — preserved, never
	// validated here.
	if (!harness || typeof harness !== "string") {
		if (m.key) return m;
		return { ...m, key: modelKey(m.provider, m.id) };
	}
	if (!m.provider || !m.id) {
		return m.key ? m : { ...m, key: modelKey(m.provider, m.id) };
	}
	const key = harnessModelKey(harness, m.provider, m.id);
	if (m.key === key && m.harness === harness) return m;
	return { ...m, key, harness };
}

/***
 * MARK: resolveModel
 * @description Resolves a user-supplied model reference against the available
 *   model snapshot. Accepts all reference forms: canonical 4-part with reasoning,
 *   canonical 3-part `harness::provider::id`, legacy `provider::id`, and bare
 *   `id`/`name`. Matches 4-part references by their 3-part base for model identity
 *   while returning the parsed level alongside in `{ ...model, reasoning }`.
 * @param {Array<Object>} available - Snapshot of available models.
 * @param {string|undefined} target - Model reference in any accepted form.
 * @returns {Object|null} Matching model (with reasoning attached if 4-part) or null.
 ***/
export function resolveModel(available, target) {
	if (!Array.isArray(available) || !target) return null;
	const key = String(target);
	const parsed = parseModelKey(key);

	if (
		parsed &&
		(parsed.form === "harness" || parsed.form === "harnessReasoning")
	) {
		const baseKey = harnessModelKey(
			parsed.harness,
			parsed.provider,
			parsed.id,
		);
		// Exact harness-scoped key match first (models tagged by this harness).
		const byKey = available.find((m) => m.key === key || m.key === baseKey);
		if (byKey) {
			return parsed.form === "harnessReasoning"
				? { ...byKey, reasoning: parsed.reasoning }
				: byKey;
		}
		// Then match on provider + id: with a single configured harness a key
		// scoped to another (unknown) harness still names the same model.
		const sameModel = available.filter(
			(m) => m.provider === parsed.provider && m.id === parsed.id,
		);
		if (sameModel.length > 0) {
			const matched =
				sameModel.find((m) => m.harness === parsed.harness) || sameModel[0];
			return parsed.form === "harnessReasoning"
				? { ...matched, reasoning: parsed.reasoning }
				: matched;
		}
	} else {
		// Legacy 2-part / bare targets: exact composite-key match first.
		const byKey = available.find(
			(m) =>
				m.key === key ||
				(m.provider !== undefined && modelKey(m.provider, m.id) === key),
		);
		if (byKey) return byKey;
	}

	// Backward-compatible bare id / name fallback (all forms).
	const fallback =
		available.find((m) => m.id === key || m.name === key) || null;
	if (fallback && parsed?.form === "harnessReasoning") {
		return { ...fallback, reasoning: parsed.reasoning };
	}
	return fallback;
}

/***
 * MARK: resolveModelFromRegistry
 * @description Resolves a model reference against a ModelRuntime's FULL model
 *   registry (all configured models), not just the availability snapshot.
 *   Matches 4-part references by base identity and attaches `reasoning`.
 * @example resolveModelFromRegistry(runtime, 'pi::ollama-cloud-direct::glm-5.3-flash:cloud::high') => model
 * @param {Object} runtime - ModelRuntime instance exposing getModels()/getModel().
 * @param {string|undefined} target - Model reference in any accepted form.
 * @returns {Object|null} Matching model or null.
 ***/
export function resolveModelFromRegistry(runtime, target) {
	if (!runtime || !target) return null;
	const key = String(target);
	const parsed = parseModelKey(key);
	if (parsed && parsed.form !== "bare") {
		try {
			const found = runtime.getModel?.(parsed.provider, parsed.id);
			if (found) {
				return parsed.form === "harnessReasoning"
					? { ...found, reasoning: parsed.reasoning }
					: found;
			}
		} catch {
			// Fall through to the scan below.
		}
	}
	try {
		const all = runtime.getModels?.() || [];
		if (
			parsed &&
			(parsed.form === "harness" || parsed.form === "harnessReasoning")
		) {
			const sameModel = all.filter(
				(m) => m.provider === parsed.provider && m.id === parsed.id,
			);
			if (sameModel.length > 0) {
				const matched =
					sameModel.find((m) => m.harness === parsed.harness) || sameModel[0];
				return parsed.form === "harnessReasoning"
					? { ...matched, reasoning: parsed.reasoning }
					: matched;
			}
		}
		const fallback =
			all.find((m) => m.key === key || m.id === key || m.name === key) || null;
		if (fallback && parsed?.form === "harnessReasoning") {
			return { ...fallback, reasoning: parsed.reasoning };
		}
		return fallback;
	} catch {
		return null;
	}
}
