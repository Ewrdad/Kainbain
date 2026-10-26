import { spawn } from "node:child_process";
import { resolveSpawnBinary } from "../../harnessDiscovery.js";
import { config } from "../../../config.js";
import { resolveModel, withModelKey } from "../../../models.js";
import { parseModelKey, stripReasoning } from "../../../../shared/modelKeys.js";
import { buildAgyChildEnv, parseAgyDurationMs } from "./agyPermissions.js";

/** The antigravity harness id — the first segment of every harness-scoped
 *  model key this catalog produces (`antigravity::antigravity::<slug>`). */
const AGY_HARNESS_ID = "antigravity";

/**
 * MARK: agyModelCatalog
 * @description Model discovery for the antigravity harness: it wraps the agy
 *   CLI's `models` subcommand, parses its slug/description lines into the
 *   engine's model shape (`{ provider: "antigravity", id, name, key }`), and
 *   caches the list with a TTL so stage dispatch does not spawn the CLI on
 *   every resolution. Pure parsing is separated from spawning so tests can
 *   inject fixture output — no real CLI install is required.
 *
 *   The provider tag is the harness id ("antigravity"), so canonical model
 *   keys look like `antigravity::antigravity::gemini-3.1-pro-high`
 *   (harness::provider::id, shared/modelKeys.js) and survive alongside pi's
 *   keys in stored model references (see api/models.js). Legacy
 *   `antigravity::<slug>` refs still resolve (the shared resolver matches
 *   composite keys by provider+id as well).
 */

/** Default cache TTL for the `agy models` output (mirrors the model-discovery cache). */
const DEFAULT_CACHE_TTL_MS = config.modelCacheTtlMs || 30000;

/** Last-resort discovery watchdog (ms) when `KAINBAIN_AGY_MODELS_TIMEOUT_MS`
 *  is empty or unparseable — fail safe rather than an unbounded spawn. */
const FALLBACK_MODELS_SPAWN_TIMEOUT_MS = 15000;

/** Default watchdog for the `agy models` discovery spawn (ms), from
 *  `KAINBAIN_AGY_MODELS_TIMEOUT_MS` (default 15s). A hung CLI must never pin
 *  model selection until the stage timeout — discovery degrades to a warn +
 *  empty list instead. The api test gate pins a larger value (vitest.config.js)
 *  because ~10 branches share 4 cores and process scheduling can stretch a
 *  healthy child's startup past 15s, which must not read as a hang. */
const DEFAULT_MODELS_SPAWN_TIMEOUT_MS =
	parseAgyDurationMs(config.agyModelsTimeout) || FALLBACK_MODELS_SPAWN_TIMEOUT_MS;

/** Grace period between SIGTERM and SIGKILL for a watchdog-killed discovery child (ms). */
const KILL_GRACE_MS = 200;

/***
 * MARK: classifyAgyModelsFailure
 * @description Sorts one `agy models` discovery failure into a stable,
 *   user-facing error: `{ code, message, hint }`. Every code maps to exactly
 *   one fix, so the UI and the process log can show the reason plus the
 *   remediation instead of a silent empty list:
 *   - `AGY_BIN_MISSING`: the CLI binary is not on PATH (ENOENT) → install it
 *     or set `KAINBAIN_AGY_BIN`.
 *   - `AGY_MODELS_TIMEOUT`: the CLI hung past the discovery watchdog → check
 *     the CLI/network and retry.
 *   - `AGY_MODELS_AUTH`: the CLI reports missing credentials → `agy auth login`.
 *   - `AGY_MODELS_FAILED`: any other non-zero exit → run `agy models` by hand.
 *   - `AGY_MODELS_UNPARSEABLE`: exit 0 but zero recognizable slugs → the CLI
 *     output shape drifted (see `unparseableAgyModelsError`, not this function).
 *   Unknown failures stay `AGY_MODELS_FAILED` (never misreport auth).
 * @example classifyAgyModelsFailure(new Error("spawn agy ENOENT")).code => "AGY_BIN_MISSING"
 * @example classifyAgyModelsFailure(new Error("'agy models' timed out after 15000ms")).code => "AGY_MODELS_TIMEOUT"
 * @param {Error|string} error - The discovery failure (spawn rejection).
 * @param {Object} [opts]
 * @param {string} [opts.bin] - The binary path attempted (named in the missing-binary message).
 * @returns {{code: string, message: string, hint: string}} The classified error.
 ***/
export function classifyAgyModelsFailure(error, { bin } = {}) {
	const detail = error?.message || String(error ?? "unknown error");
	const binary = bin || config.agyBin || "agy";
	if (/ENOENT/i.test(detail)) {
		return {
			code: "AGY_BIN_MISSING",
			message: `The agy CLI was not found ('${binary}' is not on PATH).`,
			hint: "Install the Antigravity CLI and ensure it is on PATH or in ~/.local/bin, or set KAINBAIN_AGY_BIN to its absolute path.",
		};
	}
	if (/timed out after/i.test(detail)) {
		return {
			code: "AGY_MODELS_TIMEOUT",
			message: `'agy models' timed out (${detail.trim()}).`,
			hint: "The CLI may be hanging — check the network and the CLI install, then retry (Settings › Harness › Refresh).",
		};
	}
	if (
		/authenticat|auth login|not logged in|login required|unauthorized|unauthorised|unauthenticated|invalid credential|expired credential|missing credential/i.test(
			detail,
		)
	) {
		return {
			code: "AGY_MODELS_AUTH",
			message: `'agy models' reported an authentication problem (${detail.trim().slice(-300)}).`,
			hint: "Run `agy auth login` in a terminal, then retry (Settings › Harness › Refresh).",
		};
	}
	return {
		code: "AGY_MODELS_FAILED",
		message: `'agy models' failed (${detail.trim().slice(-300)}).`,
		hint: "Run `agy models` in a terminal to see the full error, then retry.",
	};
}

/***
 * MARK: agyModelsExitError
 * @description Builds the rejection for a `agy models` child that exited without
 *   producing a usable model list. Pure (no spawn, no clock) so the exit-code +
 *   stderr → error-message mapping is unit-testable without a real subprocess —
 *   the classification (`classifyAgyModelsFailure`) reads this message, and a
 *   loaded test host must never have to start a real child just to prove the
 *   mapping. stderr is tail-truncated to 400 chars (the interesting part of a
 *   CLI failure is at the end).
 * @example agyModelsExitError({ bin: 'agy', code: 1, stderr: 'auth' }).message => "'agy models' exited with code 1: auth"
 * @param {Object} opts
 * @param {string} opts.bin - The binary path attempted (named in the message).
 * @param {number|string} opts.code - The child's exit code (or signal-derived code).
 * @param {string} [opts.stderr] - The child's captured stderr.
 * @returns {Error} The rejection the default loader hands to the classifier.
 ***/
export function agyModelsExitError({ bin, code, stderr = "" }) {
	return new Error(`'${bin} models' exited with code ${code}: ${String(stderr).trim().slice(-400)}`);
}

/***
 * MARK: unparseableAgyModelsError
 * @description Builds the `AGY_MODELS_UNPARSEABLE` error for the exit-0-but-zero-slugs
 *   case: the CLI answered, but no output line looked like a versioned model
 *   slug — almost always CLI output-shape drift the parser does not know yet.
 * @example unparseableAgyModelsError("hello").code => "AGY_MODELS_UNPARSEABLE"
 * @param {string} output - The raw stdout that yielded zero models.
 * @returns {{code: string, message: string, hint: string}} The classified error.
 ***/
export function unparseableAgyModelsError(output) {
	const snippet = String(output || "").trim().slice(0, 200);
	return {
		code: "AGY_MODELS_UNPARSEABLE",
		message: `'agy models' returned no recognizable models${snippet ? ` (output started with: ${JSON.stringify(snippet)})` : " (empty output)"}.`,
		hint: "The CLI output format may have changed — run `agy models` in a terminal and paste the output in a bug report.",
	};
}

/***
 * MARK: parseAgyModelsOutput
 * @description Parses the textual output of `agy models` into model entries.
 *   Each non-empty line whose first whitespace-separated token looks like a
 *   model slug contributes one model: the slug becomes `id`, the remainder
 *   becomes `name`. Tolerances: one ordered-list marker (`1. ` / `1) `) or
 *   bullet run (`-`, `*`, `•`) is stripped, header/prose lines ("Available
 *   models:") and blank lines are skipped — a slug always contains a
 *   separator (dash/dot/underscore) or a digit, which plain prose words do
 *   not. The stripper never eats bare digits/dots, so digit-leading slugs
 *   (`4o-mini`, `2024.10-model`) survive intact.
 * @example parseAgyModelsOutput("Available models:\\n\\ngemini-3.1-pro-high  Most capable") => [{ provider: "antigravity", id: "gemini-3.1-pro-high", ... }]
 * @param {string} output - The raw stdout of `agy models`.
 * @returns {Array<Object>} The parsed models (provider-tagged, key-attached).
 ***/
export function parseAgyModelsOutput(output) {
	const models = [];
	for (const rawLine of String(output || "").split("\n")) {
		// Strip ONE list marker — an ordered-list prefix or a bullet run —
		// and nothing else: the old character-class strip ate bare leading
		// digits/dots, corrupting digit-leading slugs (`4o-mini` → `o-mini`)
		// or dropping them entirely (`2024.10-model` → `model`, skipped).
		const line = rawLine
			.trim()
			.replace(/^\d+[.)]\s+/, "")
			.replace(/^[•\-*]+\s*/, "")
			.trim();
		if (!line) continue;
		const [slug, ...descriptionParts] = line.split(/\s+/);
		if (!slug) continue;
		// A model slug is a versioned identifier (contains a separator or a
		// digit); bare prose words are headers/sections and are skipped.
		const slugLike = /[-._]/.test(slug) || /\d/.test(slug);
		if (!slugLike) continue;
		const name = descriptionParts.join(" ").trim();
		models.push(
			withModelKey(
				{
					provider: "antigravity",
					id: slug,
					name: name || slug,
				},
				AGY_HARNESS_ID,
			),
		);
	}
	return models;
}

/***
 * MARK: createAgyModelCatalog
 * @description Builds the antigravity model catalog. `listAgyModels()` spawns
 *   `agy models` (or the injected loader), parses the output, and caches the
 *   result for `ttlMs`; resolution helpers run against the cached list.
 * @example const catalog = createAgyModelCatalog({ spawnAgyModels: async () => fixtureText });
 * @example await catalog.listAgyModels() => [{ provider: "antigravity", id: "gemini-3.1-pro-high", ... }]
 * @param {Object} [opts]
 * @param {Function} [opts.spawnAgyModels] - Async () => string loader (defaults to spawning `agy models`).
 * @param {number} [opts.spawnTimeoutMs] - Watchdog for the discovery spawn (default: `KAINBAIN_AGY_MODELS_TIMEOUT_MS`, 15s; the spawned child is killed on trip).
 * @param {number} [opts.ttlMs] - Cache TTL (default: the engine's model-cache TTL).
 * @param {Function} [opts.log] - Optional logger (message) for spawn failures.
 * @returns {Object} The catalog: { listAgyModels(), resolveModelRef(target), clearCache(), cachedModels(), lastDiscoveryError(), getModelDiscoveryStatus() }.
 ***/
export function createAgyModelCatalog({
	spawnAgyModels,
	agyBin,
	spawnTimeoutMs = DEFAULT_MODELS_SPAWN_TIMEOUT_MS,
	ttlMs = DEFAULT_CACHE_TTL_MS,
	log,
} = {}) {
	let cachedModels = null;
	let cacheLoadedAt = 0;
	let cachePromise = null;
	// The last discovery failure (`{ code, message, hint }`), retained so the
	// API and the UI can explain an empty catalogue instead of serving it
	// silently. Cleared by the next load that yields at least one model.
	let lastError = null;

	/** Default loader: run `agy models` and return its stdout. Bounded by a
	 *  watchdog so a hung CLI cannot pin model selection (the rejection lands
	 *  in loadModels' catch → warn + empty list, exactly like other failures). */
	async function defaultSpawnAgyModels() {
		const bin = resolveSpawnBinary(agyBin || config.agyBin || "agy");
		return new Promise((resolveSpawn, rejectSpawn) => {
			const child = spawn(bin, ["models"], {
				env: buildAgyChildEnv(),
				stdio: ["ignore", "pipe", "pipe"],
			});
			let stdout = "";
			let stderr = "";
			let settled = false;
			const finish = (fn, value) => {
				if (settled) return;
				settled = true;
				clearTimeout(watchdog);
				fn(value);
			};
			// Watchdog: SIGTERM (SIGKILL fallback after the grace) then reject —
			// the caller's catch degrades discovery to warn + empty list.
			const watchdog = setTimeout(() => {
				if (settled) return;
				try {
					if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
				} catch {
					// already gone
				}
				const forceKill = setTimeout(() => {
					try {
						if (child.exitCode === null && !child.killed) child.kill("SIGKILL");
					} catch {
						// already gone
					}
				}, KILL_GRACE_MS);
				if (forceKill.unref) forceKill.unref();
				finish(
					rejectSpawn,
					new Error(`'${bin} models' timed out after ${spawnTimeoutMs}ms`),
				);
			}, spawnTimeoutMs);
			if (watchdog.unref) watchdog.unref();
			child.stdout.on("data", (chunk) => {
				stdout += chunk;
			});
			child.stderr.on("data", (chunk) => {
				stderr += chunk;
			});
			child.on("error", (error) => {
				finish(
					rejectSpawn,
					new Error(`Failed to run '${bin} models': ${error.message}`),
				);
			});
			child.on("close", (code) => {
				// A watchdog-killed child's late close/error must not override the
				// timeout rejection (settled guard).
				if (code === 0) {
					finish(resolveSpawn, stdout);
				} else {
					finish(rejectSpawn, agyModelsExitError({ bin, code, stderr }));
				}
			});
		});
	}

	const loader = spawnAgyModels || defaultSpawnAgyModels;

	/** Records one discovery failure: retained for the API/UI, and loud on
	 *  purpose (console, not just the project bridge) — a silent [] here used
	 *  to surface as pi-flavored fallback models in the antigravity picker. */
	function recordFailure(classified) {
		lastError = classified;
		const message =
			`[WARN] antigravity model discovery failed [${classified.code}]: ` +
			`${classified.message} ${classified.hint}`;
		console.warn(message);
		log?.(message);
	}

	async function loadModels() {
		const age = Date.now() - cacheLoadedAt;
		if (cachedModels && age < ttlMs) return cachedModels;
		if (!cachePromise) {
			cachePromise = loader()
				.then((output) => {
					cachedModels = parseAgyModelsOutput(output);
					cacheLoadedAt = Date.now();
					if (cachedModels.length === 0) {
						// Exit 0 but zero recognizable slugs: the CLI answered
						// with output the parser does not understand (shape
						// drift) — an empty catalogue the UI must explain.
						recordFailure(unparseableAgyModelsError(output));
					} else {
						lastError = null;
					}
					return cachedModels;
				})
				.catch((error) => {
					recordFailure(
						classifyAgyModelsFailure(error, {
							bin: agyBin || config.agyBin || "agy",
						}),
					);
					return [];
				})
				.finally(() => {
					cachePromise = null;
				});
		}
		return cachePromise;
	}

	return {
		/***
		 * MARK: listAgyModels
		 * @description Lists the antigravity models (cached for the TTL). A failed
		 *   discovery degrades to an empty list with a logged warning — model
		 *   selection then soft-fails exactly like the engine's other paths.
		 * @returns {Promise<Array<Object>>} The provider-tagged model list.
		 ***/
		async listAgyModels() {
			return loadModels();
		},

		/***
		 * MARK: resolveModelRef
		 * @description Resolves a stored model reference (composite key or bare
		 *   slug) against the catalog. See `parseAgyModelRef` for the
		 *   effort-suffix convention (`gemini-3.1-pro:high`).
		 * @returns {Promise<Object|null>} The resolved model (with `effort` when a suffix was used), or null.
		 ***/
		async resolveModelRef(target) {
			const models = await loadModels();
			const parsed = parseModelKey(target);
			const level =
				parsed?.form === "harnessReasoning" ? parsed.reasoning : null;
			const baseTarget =
				parsed?.form === "harnessReasoning" ? stripReasoning(target) : target;
			const exact = resolveModel(models, baseTarget);
			if (exact) {
				return level ? { ...exact, effort: level, reasoning: level } : exact;
			}
			const { ref, effort } = parseAgyModelRef(baseTarget);
			const effectiveEffort = level || effort;
			if (!effectiveEffort) return null;
			const stripped = resolveModel(models, ref);
			if (stripped) {
				return {
					...stripped,
					effort: effectiveEffort,
					reasoning: effectiveEffort,
				};
			}
			// Real agy slugs embed the effort level (`gemini-3.1-pro-high`), so an
			// effort-suffixed ref whose base slug is absent still resolves against
			// the joined form: gemini-3.1-pro:high → gemini-3.1-pro-high.
			const joined = resolveModel(models, `${ref}-${effectiveEffort}`);
			if (!joined) return null;
			return { ...joined, effort: effectiveEffort, reasoning: effectiveEffort };
		},

		/***
		 * MARK: clearCache
		 * @description Drops the cached model list so the next call re-runs discovery.
		 ***/
		clearCache() {
			cachedModels = null;
			cacheLoadedAt = 0;
		},

		/***
		 * MARK: cachedModels
		 * @description Returns the current cached list (null when never loaded) — for tests.
		 ***/
		cachedModels() {
			return cachedModels;
		},

		/***
		 * MARK: lastDiscoveryError
		 * @description Returns the last discovery failure (`{ code, message,
		 *   hint }`, see `classifyAgyModelsFailure`), or null when the last
		 *   load succeeded (or nothing has loaded yet). The API serves this
		 *   alongside an empty catalogue so the UI can name the cause + fix.
		 * @example catalog.lastDiscoveryError()?.code => "AGY_BIN_MISSING"
		 * @returns {Object|null} The retained error, or null.
		 ***/
		lastDiscoveryError() {
			return lastError;
		},

		/***
		 * MARK: getModelDiscoveryStatus
		 * @description Reports the catalog's discovery health: `{ ok: true }`
		 *   when the last load succeeded (or nothing has loaded yet — no
		 *   failure to report), `{ ok: false, error }` after a failure. The
		 *   harness forwards this behind its own optional
		 *   `getModelDiscoveryStatus` contract method.
		 * @example catalog.getModelDiscoveryStatus() => { ok: false, error: { code: "AGY_BIN_MISSING", … } }
		 * @returns {{ok: boolean, error?: Object}} The discovery status.
		 ***/
		getModelDiscoveryStatus() {
			return lastError ? { ok: false, error: lastError } : { ok: true };
		},
	};
}

/** Effort suffixes the stage model ref may carry (`<slug>:high` convention). */
const EFFORT_LEVELS = new Set(["low", "medium", "high"]);

/***
 * MARK: parseAgyModelRef
 * @description Splits a trailing effort suffix off a model reference:
 *   `gemini-3.1-pro:high` → `{ ref: "gemini-3.1-pro", effort: "high" }`.
 *   Composite keys keep their `provider::id` part intact
 *   (`antigravity::gemini-3.1-pro:high` → ref `antigravity::gemini-3.1-pro`).
 *   The split happens at the last single colon that is NOT part of a `::`
 *   separator; a ref without a valid effort suffix is returned untouched.
 * @example parseAgyModelRef("gemini-3.1-pro:high").effort => "high"
 * @example parseAgyModelRef("antigravity::gemini-3.1-pro").effort => null
 * @param {string} target - The raw model reference.
 * @returns {Object} { ref, effort } — effort is null when no valid suffix is present.
 ***/
export function parseAgyModelRef(target) {
	const text = String(target || "");
	// Find the last single colon that is not part of a "::" separator: scan
	// from the end and skip any colon immediately preceded by another colon.
	for (let i = text.length - 1; i > 0; i -= 1) {
		// eslint-disable-next-line security/detect-object-injection -- index access on a plain string, not an object
		if (text[i] !== ":") continue;
		if (text[i - 1] === ":") continue; // part of "::" — keep scanning left
		const suffix = text.slice(i + 1).toLowerCase();
		if (EFFORT_LEVELS.has(suffix)) {
			return { ref: text.slice(0, i), effort: suffix };
		}
		return { ref: text, effort: null };
	}
	return { ref: text, effort: null };
}
