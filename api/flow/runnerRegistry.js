import { v4 as uuidv4 } from "uuid";
import { config } from "../config.js";
import { loadStateFile } from "./loadStateFile.js";
import { resolveStatePath } from "./resolveStatePath.js";
import { saveStateFile } from "./saveStateFile.js";
import { normalizeCapabilities } from "./dispatch/normalizeCapabilities.js";
import { runnerApiCompatible } from "./dispatch/runnerApiCompat.js";
import { updateInfoForRunner } from "./runnerVersionCompat.js";

const RUNNER_STATE_VERSION = 3;

const JOB_TYPE_KEYS = ["runsCi", "runsMerges", "runsImpromptu"];

/***
 * MARK: defaultOperatorConfig
 * @description Fresh operator-owned configuration for one Runner. Kept
 *   separate from Runner-reported `facts`/`capabilities` so heartbeats
 *   never wipe operator choices. `displayName` null falls back to the
 *   Runner id; `availableTools` null means every advertised harness id;
 *   `projectScope` null means the Runner serves every project. All job
 *   switches default to true (current behaviour).
 * @example defaultOperatorConfig() => { displayName: null, jobTypes: { runsCi: true, ... } }
 * @returns {Object} Default operator configuration.
 ***/
const defaultOperatorConfig = () => {
	return {
		displayName: null,
		availableTools: null,
		availableModels: null,
		jobTypes: { runsCi: true, runsMerges: true, runsImpromptu: true },
		directories: { masterDir: "", worktreeDir: "" },
		projectScope: null,
	};
};

/***
 * MARK: normalizeOperatorConfig
 * @description Coerces a persisted operatorConfig (possibly from an older
 *   state file that predates it) into the current shape. Unknown or
 *   wrong-typed fields fall back to defaults rather than crashing load.
 * @example normalizeOperatorConfig(null) => defaultOperatorConfig()
 * @param {*} raw - Persisted value, if any.
 * @returns {Object} Normalized operator configuration.
 ***/
const normalizeOperatorConfig = (raw) => {
	const fresh = defaultOperatorConfig();
	if (!raw || typeof raw !== "object") return fresh;
	const jobTypes = { ...fresh.jobTypes };
	if (raw.jobTypes && typeof raw.jobTypes === "object") {
		for (const key of JOB_TYPE_KEYS) {
			if (typeof raw.jobTypes[key] === "boolean") jobTypes[key] = raw.jobTypes[key];
		}
	}
	const directories = { ...fresh.directories };
	if (raw.directories && typeof raw.directories === "object") {
		for (const key of ["masterDir", "worktreeDir"]) {
			if (typeof raw.directories[key] === "string") directories[key] = raw.directories[key];
		}
	}
	return {
		displayName: typeof raw.displayName === "string" ? raw.displayName : null,
		availableTools: Array.isArray(raw.availableTools)
			? raw.availableTools.filter((t) => typeof t === "string")
			: null,
		availableModels: Array.isArray(raw.availableModels)
			? raw.availableModels.filter((m) => typeof m === "string")
			: null,
		jobTypes,
		directories,
		projectScope: Array.isArray(raw.projectScope)
			? raw.projectScope.filter((p) => typeof p === "string")
			: null,
	};
};

/***
 * MARK: normalizePendingCommands
 * @description Coerces a persisted pendingCommands list into the canonical
 *   `{ command, requestedAt }` entries, deduplicating by command and
 *   dropping unknown commands / malformed rows so older state files load.
 * @example normalizePendingCommands([{ command: 'requestUpdate', requestedAt: '2020-01-01T00:00:00.000Z' }]) => [...]
 * @param {*} raw - Persisted value, if any.
 * @returns {Array<{command:string,requestedAt:string}>} Normalized entries.
 ***/
const normalizePendingCommands = (raw) => {
	if (!Array.isArray(raw)) return [];
	const byCommand = new Map();
	for (const entry of raw) {
		if (!entry || typeof entry !== "object") continue;
		const command = entry.command;
		if (typeof command !== "string" || !RUNNER_COMMANDS.includes(command)) continue;
		const requestedAt =
			typeof entry.requestedAt === "string" && entry.requestedAt
				? entry.requestedAt
				: new Date().toISOString();
		const prev = byCommand.get(command);
		if (!prev || Date.parse(requestedAt) >= Date.parse(prev.requestedAt)) {
			byCommand.set(command, { command, requestedAt });
		}
	}
	return [...byCommand.values()];
};

/***
 * MARK: normalizeCommandResults
 * @description Coerces a persisted commandResults map into the canonical
 *   `{ command: { ok, detail, at } }` shape, dropping unknown/invalid.
 * @example normalizeCommandResults({ requestUpdate: { ok: true, detail: 'done', at: '2020-01-01T00:00:00.000Z' } }) => {...}
 * @param {*} raw - Persisted value, if any.
 * @returns {Object} Normalized results map.
 ***/
const normalizeCommandResults = (raw) => {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
	const out = {};
	for (const [command, result] of Object.entries(raw)) {
		if (typeof command !== "string" || !RUNNER_COMMANDS.includes(command)) continue;
		if (!result || typeof result !== "object" || Array.isArray(result)) continue;
		out[command] = {
			ok: result.ok === true,
			detail: typeof result.detail === "string" ? result.detail : "",
			at: typeof result.at === "string" ? result.at : "",
		};
	}
	return out;
};

/***
 * MARK: advertisedToolIds
 * @description Harness/tool ids this Runner advertised in its capabilities,
 *   or null when unknown (no capabilities yet). Used to validate the
 *   operator's available-tools subset.
 * @example advertisedToolIds({ capabilities: { harnesses: [{ id: 'pi' }] } }) => ['pi']
 * @param {Object} record - Runner record.
 * @returns {string[]|null} Advertised ids, or null when unknown.
 ***/
const advertisedToolIds = (record) => {
	const list = record?.capabilities?.harnesses;
	if (!Array.isArray(list)) return null;
	const ids = list
		.map((h) => (typeof h === "string" ? h : h?.id))
		.filter((id) => typeof id === "string" && id);
	return ids.length > 0 ? ids : null;
}

/***
 * MARK: RunnerRegistry
 * @description Backend-side Runner identity ledger (D4, ADR 0009 lifecycle
 *   steps 1–2). Join flow: `register` with the operator join token yields
 *   `pending`; a human approves/denies in Settings (Phase 2 minimal
 *   onboarding UI); `approve` issues the per-Runner credential the Runner
 *   presents on every later endpoint. Heartbeats refresh capabilities and
 *   versions; revocation invalidates the credential immediately and leases
 *   expire on their own TTL, so a revoked Runner's work re-queues instead
 *   of completing. Protocol `v1` only: outside-window Runners are rejected
 *   with an explicit signal, never best-effort dispatched (D7). Identity
 *   + approvals + credentials persist to disk (WP-4.1, 0600); liveness
 *   is memory-only — after a restart every Runner re-establishes
 *   freshness with its first heartbeat, which is the secure default.
 * @example const runners = new RunnerRegistry({ joinToken: 'secret' })
 * @param {Object} [opts] - Options.
 * @param {string} [opts.joinToken=""] - Operator join secret Runners present
 *   at register time. Empty disables registration (403 REGISTRATION_DISABLED).
 * @param {Function} [opts.newCredential] - Credential factory (tests inject
 *   a deterministic one; production uses UUIDs).
 ***/

export const RUNNER_PROTOCOL = "v1";
const MIN_RUNNER_PROTOCOL = "v1";
/***
 * MARK: RUNNER_COMMANDS
 * @description Backend-to-Runner command ids the registry accepts, delivers
 *   on the heartbeat pull channel, and the Runner daemon consumes at next
 *   idle (never interrupting live work).
 * @example RUNNER_COMMANDS.includes('requestUpdate') => true
 ***/
export const RUNNER_COMMANDS = ["requestModelRediscovery", "requestUpdate"];
/***
 * MARK: RUNNER_COMMAND_TTL_MS
 * @description How long an undelivered Runner command waits for the next
 *   heartbeat before it expires (one day).
 * @example RUNNER_COMMAND_TTL_MS => 86400000
 ***/
export const RUNNER_COMMAND_TTL_MS = 24 * 60 * 60 * 1000;
/***
 * MARK: resolveRunnerStatePath
 * @description Resolves the durable registry file: explicit wins, then the
 *   schema path (env `KAINBAIN_RUNNER_STATE_FILE`), then the conventional
 *   `~/.kainbain/engine/runners.json`. Persists identity + approvals +
 *   credentials (0600) so a restart never forces fleet re-approval;
 *   liveness (`lastSeenAt`) is deliberately NOT restored — every Runner
 *   re-establishes freshness with its first post-boot heartbeat, which is
 *   the secure default after an outage. Empty disables persistence.
 * @example resolveRunnerStatePath('/tmp/r.json') => '/tmp/r.json'
 * @param {string} [explicit] - Explicit path (tests).
 * @returns {string|null} Resolved path, or null when disabled.
 ***/
export function resolveRunnerStatePath(explicit) {
	if (typeof explicit === "string") return explicit || null;
	const configured = config?.runnerStateFile;
	if (typeof configured === "string" && !configured.trim()) return null;
	return resolveStatePath(null, configured, "runners.json");
}

/***
 * MARK: RunnerRegistry
 * @description Runner identity ledger for D4/R04: join/approve/deny/
 *   revoke/rotate with per-Runner credentials. Identity + approvals +
 *   credentials persist to disk (WP-4.1); liveness is memory-only.
 * @example const r = new RunnerRegistry({ joinToken: 's3cret' })
 * @example r.register({ runnerId: 'h1', joinToken: 's3cret', facts: {} }) => { status: 'pending', ... }
 ***/
export class RunnerRegistry {
	constructor(
		{ joinToken = "", newCredential = () => uuidv4(), staleAfterMs = 60000, stateFile = null } = {},
	) {
		this.joinToken = joinToken;
		this.newCredential = newCredential;
		this.staleAfterMs =
			typeof staleAfterMs === "number" && staleAfterMs > 0 ? staleAfterMs : 60000;
		this.runners = new Map();
		this.credentials = new Map();
		this.pendingCommands = new Map();
		this.stateFile = resolveRunnerStatePath(stateFile);
		this._loadState();
	}

	_loadState() {
		if (!this.stateFile) return;
		const raw = loadStateFile(this.stateFile, (v) => v);
		const records = raw && typeof raw === "object" ? raw.runners : null;
		if (!Array.isArray(records)) return;
		for (const rec of records) {
			if (!rec || typeof rec.runnerId !== "string") continue;
			if (typeof rec.status !== "string") continue;
			const record = {
				runnerId: rec.runnerId,
				status: rec.status,
				facts: rec.facts && typeof rec.facts === "object" ? rec.facts : {},
				capabilities:
					rec.capabilities && typeof rec.capabilities === "object" ? rec.capabilities : null,
				credential: typeof rec.credential === "string" ? rec.credential : null,
				credentialIssuedAt:
					typeof rec.credentialIssuedAt === "string" ? rec.credentialIssuedAt : null,
				joinNonce:
					typeof rec.joinNonce === "string" && rec.joinNonce ? rec.joinNonce : null,
				credentialExposed: rec.credentialExposed === true,
				lastOrigin: typeof rec.lastOrigin === "string" ? rec.lastOrigin : null,
				originConflicts:
					Number.isInteger(rec.originConflicts) && rec.originConflicts > 0
						? rec.originConflicts
						: 0,
				paused: rec.paused === true,
				operatorConfig: normalizeOperatorConfig(rec.operatorConfig),
				pendingCommands: normalizePendingCommands(rec.pendingCommands),
				commandResults: normalizeCommandResults(rec.commandResults),
				lastSeenAt: null,
			};
			this.runners.set(record.runnerId, record);
			if (record.credential) this.credentials.set(record.credential, record.runnerId);
		}
	}

	_persist() {
		if (!this.stateFile) return;
		saveStateFile(this.stateFile, {
			version: RUNNER_STATE_VERSION,
			runners: [...this.runners.values()].map((record) => ({
				runnerId: record.runnerId,
				status: record.status,
				facts: record.facts || {},
				capabilities: record.capabilities || null,
				credential: record.credential || null,
				credentialIssuedAt: record.credentialIssuedAt || null,
				joinNonce:
					typeof record.joinNonce === "string" && record.joinNonce
						? record.joinNonce
						: null,
				credentialExposed: record.credentialExposed === true,
				lastOrigin: record.lastOrigin || null,
				originConflicts: record.originConflicts || 0,
				paused: record.paused === true,
				operatorConfig: normalizeOperatorConfig(record.operatorConfig),
				pendingCommands: Array.isArray(record.pendingCommands)
					? record.pendingCommands.map((e) => ({ command: e.command, requestedAt: e.requestedAt }))
					: [],
				commandResults: record.commandResults && typeof record.commandResults === "object" && !Array.isArray(record.commandResults)
					? { ...record.commandResults }
					: {},
			})),
		});
	}

	static _fail(statusCode, code, message) {
		const err = new Error(message);
		err.statusCode = statusCode;
		err.code = code;
		return err;
	}

	static _requireRunnerId(runnerId) {
		if (!runnerId || typeof runnerId !== "string" || runnerId.length > 128) {
			throw RunnerRegistry._fail(
				400,
				"INVALID_RUNNER_ARGS",
				"register requires a runnerId string (max 128 chars).",
			);
		}
	}

	_public(record) {
		// Fleet matrix (Option A, ADR 0012): the product version the Runner
		// reported, whether it is below the dispatch floor or the badge
		// target, and its API compatibility — all derived from heartbeat
		// facts + operator knobs, never stored separately.
		const apiCompat = runnerApiCompatible(record?.facts?.versions?.api);
		const update = updateInfoForRunner(record?.facts, {
			minVersion: config?.runnerMinVersion,
			recommendedVersion: config?.runnerRecommendedVersion,
		});
		this._expireStale(record);
		const pendingEntries = Array.isArray(record.pendingCommands) ? record.pendingCommands : [];
		const supported = RUNNER_COMMANDS.filter(
			(command) => Array.isArray(record?.facts?.commands) && record.facts.commands.includes(command),
		);
		return {
			runnerId: record.runnerId,
			status: record.status,
			facts: record.facts,
			capabilities: record.capabilities || null,
			lastSeenAt: record.lastSeenAt,
			credentialIssuedAt: record.credentialIssuedAt || null,
			originConflicts: record.originConflicts || 0,
			paused: record.paused === true,
			projectScope: Array.isArray(record.projectScope) ? [...record.projectScope] : null,
			operatorConfig: normalizeOperatorConfig(record.operatorConfig),
			runnerVersion: update.runnerVersion,
			apiCompatible: apiCompat.ok,
			apiRange: apiCompat.range,
			updateAvailable: update.updateAvailable,
			belowMinimum: update.belowMinimum,
			minimumVersion: update.minimumVersion,
			recommendedVersion: update.recommendedVersion,
			updateStatus: update.updateStatus,
			update: {
				minimumVersion: update.minimumVersion,
				recommendedVersion: update.recommendedVersion,
				updateAvailable: update.updateAvailable,
				belowMinimum: update.belowMinimum,
				apiCompatible: apiCompat.ok,
			},
			pendingCommands: pendingEntries.map((e) => e.command),
			commands: {
				pending: pendingEntries.map((e) => ({ command: e.command, requestedAt: e.requestedAt })),
				results: record.commandResults && typeof record.commandResults === "object" && !Array.isArray(record.commandResults)
					? { ...record.commandResults }
					: {},
				supported,
			},
		};
	}

	/***
	 * MARK: getConfig
	 * @description Returns the public Runner record including its
	 *   operator-owned configuration (display name, tool filter, job-type
	 *   switches, directories, project override). Backs
	 *   `GET /runners/:id/config` for the System Settings Runner screen.
	 * @example registry.getConfig('r1') => { runnerId: 'r1', operatorConfig: {...} }
	 * @param {string} runnerId - Runner id.
	 * @returns {Object} Public record with `operatorConfig`.
	 ***/
	getConfig(runnerId) {
		return this._public(this._getOrThrow(runnerId));
	}

	/***
	 * MARK: updateConfig
	 * @description Applies an operator-owned configuration patch to one
	 *   Runner and persists it. Heartbeat-reported `facts`/`capabilities`
	 *   are never touched here, so Runner heartbeats cannot wipe operator
	 *   choices. Any status (including `pending`) may be configured.
	 * @example registry.updateConfig('r1', { jobTypes: { runsCi: false } }) => {...}
	 * @param {string} runnerId - Runner id.
	 * @param {Object} [patch={}] - Partial operator configuration.
	 * @returns {Object} Public record with the updated `operatorConfig`.
	 ***/
	updateConfig(runnerId, patch = {}) {
		const record = this._getOrThrow(runnerId);
		if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
			throw RunnerRegistry._fail(
				400,
				"INVALID_CONFIG_PATCH",
				"Config patch must be an object.",
			);
		}
		const allowed = new Set([
			"displayName",
			"availableTools",
			"availableModels",
			"jobTypes",
			"directories",
			"projectScope",
		]);
		for (const key of Object.keys(patch)) {
			if (!allowed.has(key)) {
				throw RunnerRegistry._fail(
					400,
					"UNKNOWN_CONFIG_FIELD",
					`Unknown config field '${key}'.`,
				);
			}
		}
		const current = normalizeOperatorConfig(record.operatorConfig);
		const next = {
			displayName: current.displayName,
			availableTools: current.availableTools ? [...current.availableTools] : null,
			availableModels: current.availableModels ? [...current.availableModels] : null,
			jobTypes: { ...current.jobTypes },
			directories: { ...current.directories },
			projectScope: current.projectScope ? [...current.projectScope] : null,
		};
		if (Object.hasOwn(patch, "displayName")) {
			const name = patch.displayName;
			if (name !== null && typeof name !== "string") {
				throw RunnerRegistry._fail(
					400,
					"INVALID_DISPLAY_NAME",
					"displayName must be a string or null.",
				);
			}
			const trimmed = typeof name === "string" ? name.trim() : "";
			if (typeof name === "string" && !trimmed) {
				throw RunnerRegistry._fail(
					400,
					"INVALID_DISPLAY_NAME",
					"displayName must not be blank.",
				);
			}
			if (trimmed.length > 128) {
				throw RunnerRegistry._fail(
					400,
					"INVALID_DISPLAY_NAME",
					"displayName must be at most 128 characters.",
				);
			}
			next.displayName = typeof name === "string" ? trimmed : null;
		}
		if (Object.hasOwn(patch, "availableTools")) {
			const tools = patch.availableTools;
			if (tools !== null && !Array.isArray(tools)) {
				throw RunnerRegistry._fail(
					400,
					"INVALID_AVAILABLE_TOOLS",
					"availableTools must be an array of tool ids or null (all advertised).",
				);
			}
			if (Array.isArray(tools)) {
				for (const tool of tools) {
					if (typeof tool !== "string" || !tool.trim()) {
						throw RunnerRegistry._fail(
							400,
							"INVALID_AVAILABLE_TOOLS",
							"availableTools must be an array of non-empty tool id strings.",
						);
					}
				}
				// Trim like projectScope below so " pi " and "pi" are the
				// same tool id at match time (runnerMatches compares exact
				// strings). Builds a new array: the patch object belongs to
				// the caller (request body) and is never mutated in place.
				const trimmed = tools.map((tool) => tool.trim());
				const advertised = advertisedToolIds(record);
				if (advertised) {
					const unknown = trimmed.filter((tool) => !advertised.includes(tool));
					if (unknown.length > 0) {
						throw RunnerRegistry._fail(
							400,
							"UNKNOWN_TOOL",
							`Runner ${runnerId} does not advertise these tools: ${unknown.join(", ")}.`,
						);
					}
				}
				next.availableTools = [...new Set(trimmed)];
			} else {
				next.availableTools = null;
			}
		}
		if (Object.hasOwn(patch, "availableModels")) {
			const models = patch.availableModels;
			if (models !== null && !Array.isArray(models)) {
				throw RunnerRegistry._fail(
					400,
					"INVALID_AVAILABLE_MODELS",
					"availableModels must be an array of model id strings or null (advertised).",
				);
			}
			if (Array.isArray(models)) {
				for (const model of models) {
					if (typeof model !== "string" || !model.trim()) {
						throw RunnerRegistry._fail(
							400,
							"INVALID_AVAILABLE_MODELS",
							"availableModels must be an array of non-empty model id strings.",
						);
					}
				}
				// Deliberately NOT subset-validated against advertised
				// models (unlike availableTools): the point is letting the
				// operator declare what the box can serve when the Runner
				// under-reports (or reports nothing). Same trust model as
				// the KAINBAIN_RUNNER_MODELS env claim. Trim + dedupe so
				// matching compares exact strings.
				next.availableModels = [...new Set(models.map((model) => model.trim()))];
			} else {
				next.availableModels = null;
			}
		}
		if (Object.hasOwn(patch, "jobTypes")) {
			const jobTypes = patch.jobTypes;
			if (!jobTypes || typeof jobTypes !== "object" || Array.isArray(jobTypes)) {
				throw RunnerRegistry._fail(
					400,
					"INVALID_JOB_TYPES",
					"jobTypes must be an object of boolean switches.",
				);
			}
			for (const key of Object.keys(jobTypes)) {
				if (!JOB_TYPE_KEYS.includes(key)) {
					throw RunnerRegistry._fail(
						400,
						"UNKNOWN_JOB_TYPE",
						`Unknown job type '${key}'.`,
					);
				}
				if (typeof jobTypes[key] !== "boolean") {
					throw RunnerRegistry._fail(
						400,
						"INVALID_JOB_TYPES",
						`Job switch '${key}' must be a boolean.`,
					);
				}
				next.jobTypes[key] = jobTypes[key];
			}
		}
		if (Object.hasOwn(patch, "directories")) {
			const directories = patch.directories;
			if (!directories || typeof directories !== "object" || Array.isArray(directories)) {
				throw RunnerRegistry._fail(
					400,
					"INVALID_DIRECTORIES",
					"directories must be an object with masterDir/worktreeDir strings.",
				);
			}
			for (const key of Object.keys(directories)) {
				if (key !== "masterDir" && key !== "worktreeDir") {
					throw RunnerRegistry._fail(
						400,
						"UNKNOWN_DIRECTORY_FIELD",
						`Unknown directory field '${key}'.`,
					);
				}
				const value = directories[key];
				if (typeof value !== "string" || !value.trim()) {
					throw RunnerRegistry._fail(
						400,
						"INVALID_DIRECTORIES",
						`Directory '${key}' must be a non-empty string.`,
					);
				}
				if (value.trim().length > 1024) {
					throw RunnerRegistry._fail(
						400,
						"INVALID_DIRECTORIES",
						`Directory '${key}' must be at most 1024 characters.`,
					);
				}
				next.directories[key] = value.trim();
			}
		}
		if (Object.hasOwn(patch, "projectScope")) {
			const scope = patch.projectScope;
			if (scope !== null && !Array.isArray(scope)) {
				throw RunnerRegistry._fail(
					400,
					"INVALID_PROJECT_SCOPE",
					"projectScope must be an array of project ids or null (all projects).",
				);
			}
			if (Array.isArray(scope)) {
				for (const id of scope) {
					if (typeof id !== "string" || !id.trim()) {
						throw RunnerRegistry._fail(
							400,
							"INVALID_PROJECT_SCOPE",
							"projectScope must be an array of non-empty project id strings.",
						);
					}
				}
				next.projectScope = [...new Set(scope.map((id) => id.trim()))];
			} else {
				next.projectScope = null;
			}
		}
		record.operatorConfig = next;
		this._persist();
		return this._public(record);
	}

	/***
	 * MARK: recordDispatchScope
	 * @description Remembers the Runner-enforced project allowlist from its
	 *   latest dispatch poll (`KAINBAIN_RUNNER_PROJECTS`): null means the
	 *   Runner serves every project. Display-only for Settings › Runners —
	 *   enforcement already happens in the dispatch scan.
	 * @example registry.recordDispatchScope('r1', ['p1'])
	 * @param {string} runnerId - Runner id.
	 * @param {string[]|undefined} projectIds - Allowlist or undefined (all).
	 ***/
	recordDispatchScope(runnerId, projectIds) {
		const record = this.runners.get(runnerId);
		if (!record) return;
		record.projectScope =
			Array.isArray(projectIds) && projectIds.length > 0 ? [...projectIds] : null;
	}

	static _capabilitiesOrThrow(facts) {
		const capabilities = normalizeCapabilities(facts);
		if (capabilities.errors.length > 0) {
			throw RunnerRegistry._fail(
				400,
				"CAPABILITIES_INVALID",
				`Unusable capability advertisement: ${capabilities.errors.join("; ")}`,
			);
		}
		return capabilities;
	}

	isFresh(record, now = Date.now()) {
		const seen = Date.parse(record?.lastSeenAt || "");
		return Number.isFinite(seen) && now - seen <= this.staleAfterMs;
	}

	records() {
		return [...this.runners.values()];
	}

	register({ runnerId, joinToken, facts = {}, joinNonce } = {}) {
		RunnerRegistry._requireRunnerId(runnerId);
		// Join nonce (one-click approval, D2): the Runner mints a random
		// secret per boot and repeats it on every join poll. Only the
		// poller presenting the stored nonce collects the credential after
		// approval — the shared join token alone never impersonates an
		// approved Runner. Capped in length; anything else is ignored.
		const nonce =
			typeof joinNonce === "string" && joinNonce && joinNonce.length <= 256
				? joinNonce
				: null;
		if (!this.joinToken) {
			throw RunnerRegistry._fail(
				403,
				"REGISTRATION_DISABLED",
				"Runner registration is disabled: set KAINBAIN_RUNNER_JOIN_TOKEN.",
			);
		}
		if (joinToken !== this.joinToken) {
			throw RunnerRegistry._fail(
				403,
				"INVALID_JOIN_TOKEN",
				"Runner join token rejected.",
			);
		}
		const capabilities = RunnerRegistry._capabilitiesOrThrow(facts);
		const protocol = facts?.versions?.protocol;
		if (protocol !== RUNNER_PROTOCOL) {
			throw RunnerRegistry._fail(
				409,
				"PROTOCOL_VERSION_UNSUPPORTED",
				`Runner protocol ${String(protocol)} is outside the N-1 window (backend ${RUNNER_PROTOCOL}, floor ${MIN_RUNNER_PROTOCOL}).`,
			);
		}
		const apiCompat = runnerApiCompatible(facts?.versions?.api);
		if (!apiCompat.ok) {
			throw RunnerRegistry._fail(
				409,
				"PROTOCOL_VERSION_UNSUPPORTED",
				`Runner API version ${String(facts?.versions?.api)} does not satisfy backend accepts.runner ${apiCompat.range}.`,
			);
		}
		const existing = this.runners.get(runnerId);
		if (existing) {
			existing.facts = facts;
			existing.capabilities = capabilities;
			// Adopt a nonce only while no credential exists to steal
			// (pre-feature records joined without one); once a credential
			// is issued the stored nonce is immutable.
			if (!existing.credential && !existing.joinNonce && nonce) {
				existing.joinNonce = nonce;
			}
			// One-time handover: the approved Runner collecting its own
			// credential with the nonce it joined with. Every other poller
			// still gets `credential: null` (see the handover tests).
			if (
				existing.status === "active" &&
				existing.credential &&
				existing.credentialExposed !== true &&
				nonce &&
				nonce === existing.joinNonce
			) {
				existing.credentialExposed = true;
				this._persist();
				return { ...this._public(existing), credential: existing.credential };
			}
			this._persist();
			return { ...this._public(existing), credential: null };
		}
		const record = {
			runnerId,
			status: "pending",
			facts,
			capabilities,
			credential: null,
			credentialIssuedAt: null,
			joinNonce: nonce,
			credentialExposed: false,
			paused: false,
			operatorConfig: defaultOperatorConfig(),
			pendingCommands: [],
			commandResults: {},
			lastSeenAt: null,
		};
		this.runners.set(runnerId, record);
		this._persist();
		return { ...this._public(record), credential: null };
	}

	_getOrThrow(runnerId) {
		const record = this.runners.get(runnerId);
		if (!record) {
			throw RunnerRegistry._fail(
				404,
				"UNKNOWN_RUNNER",
				`Unknown Runner ${runnerId}.`,
			);
		}
		return record;
	}

	_issueCredential(record) {
		if (record.credential) this.credentials.delete(record.credential);
		record.credential = this.newCredential();
		record.credentialIssuedAt = new Date().toISOString();
		record.status = "active";
		// A fresh credential is collectible once by the join-nonce holder
		// (one-click approval); the flag flips on first handover.
		record.credentialExposed = false;
		this.credentials.set(record.credential, record.runnerId);
		this._persist();
		return { ...this._public(record), credential: record.credential };
	}

	approve(runnerId) {
		const record = this._getOrThrow(runnerId);
		if (record.status === "active" && record.credential) {
			return { ...this._public(record), credential: null };
		}
		return this._issueCredential(record);
	}

	/***
	 * MARK: rotate
	 * @description Fleet credential rotation rehearsal (WP-4.1): issues a
	 *   fresh credential for an ACTIVE Runner, invalidating the old one
	 *   immediately. Zero stage failures when rotated between assignments —
	 *   the in-flight lease keeps working (it is epoch-fenced, not
	 *   credential-fenced), but the next heartbeat with the old credential
	 *   401s, so the operator rotates idle Runners or restarts the daemon
	 *   with the new credential right after.
	 * @example runners.rotate('h1') => { status: 'active', credential: '…' }
	 * @param {string} runnerId - Runner id.
	 * @returns {Object} Public record plus the one-time new credential.
	 ***/
	rotate(runnerId) {
		const record = this._getOrThrow(runnerId);
		if (record.status !== "active" || !record.credential) {
			throw RunnerRegistry._fail(
				409,
				"ROTATE_INVALID_STATE",
				`Cannot rotate Runner ${runnerId} in status ${record.status}; only active Runners with a credential rotate.`,
			);
		}
		return this._issueCredential(record);
	}

	deny(runnerId) {
		const record = this._getOrThrow(runnerId);
		if (record.status !== "pending") {
			throw RunnerRegistry._fail(
				409,
				"DENY_INVALID_STATE",
				`Cannot deny a Runner in status ${record.status}; use revoke for active Runners.`,
			);
		}
		record.status = "denied";
		this._persist();
		return this._public(record);
	}

	revoke(runnerId) {
		const record = this._getOrThrow(runnerId);
		if (record.credential) this.credentials.delete(record.credential);
		record.credential = null;
		record.status = "revoked";
		// The join nonce deliberately stays: it is immutable once set, so
		// a same-boot Runner can still collect a re-issued credential via
		// the one-time handover; a restarted Runner (new nonce) safely
		// falls back to the manual paste.
		this._persist();
		return this._public(record);
	}

	/***
	 * MARK: pause
	 * @description Parks an ACTIVE Runner so it stops picking up new tasks
	 *   (dispatch and direct claim both refuse it) while its credential,
	 *   heartbeats, and any in-flight lease keep working — pausing never
	 *   strands running work. The flag persists to disk, so a restart
	 *   keeps the fleet parked. Idempotent: pausing a paused Runner is a
	 *   no-op success.
	 * @example runners.pause('r1') => { status: 'active', paused: true }
	 * @param {string} runnerId - Runner id.
	 * @returns {Object} Public record with the paused flag.
	 ***/
	pause(runnerId) {
		const record = this._getOrThrow(runnerId);
		if (record.status !== "active") {
			throw RunnerRegistry._fail(
				409,
				"PAUSE_INVALID_STATE",
				`Cannot pause a Runner in status ${record.status}; only active Runners pause.`,
			);
		}
		record.paused = true;
		this._persist();
		return this._public(record);
	}

	/***
	 * MARK: resume
	 * @description Clears the pause flag so the Runner picks up new tasks
	 *   again. Idempotent: resuming an unpaused Runner is a no-op success.
	 * @example runners.resume('r1') => { status: 'active', paused: false }
	 * @param {string} runnerId - Runner id.
	 * @returns {Object} Public record with the paused flag.
	 ***/
	resume(runnerId) {
		const record = this._getOrThrow(runnerId);
		if (record.status !== "active") {
			throw RunnerRegistry._fail(
				409,
				"RESUME_INVALID_STATE",
				`Cannot resume a Runner in status ${record.status}; only active Runners resume.`,
			);
		}
		record.paused = false;
		this._persist();
		return this._public(record);
	}

	authenticate(credential) {
		const runnerId = this.credentials.get(credential);
		if (!runnerId) {
			throw RunnerRegistry._fail(
				401,
				"INVALID_CREDENTIAL",
				"Unknown or missing Runner credential.",
			);
		}
		const record = this.runners.get(runnerId);
		if (!record || record.credential !== credential) {
			throw RunnerRegistry._fail(
				401,
				"INVALID_CREDENTIAL",
				"Unknown or missing Runner credential.",
			);
		}
		if (record.status !== "active") {
			throw RunnerRegistry._fail(
				403,
				record.status === "revoked" ? "RUNNER_REVOKED" : "RUNNER_NOT_ACTIVE",
				`Runner ${runnerId} is ${record.status}.`,
			);
		}
		return record;
	}

	_expireStale(record, now = Date.now()) {
		if (!record || !Array.isArray(record.pendingCommands)) return false;
		const kept = [];
		let changed = false;
		for (const entry of record.pendingCommands) {
			const age = now - Date.parse(entry?.requestedAt || "");
			if (Number.isFinite(age) && age > RUNNER_COMMAND_TTL_MS) {
				changed = true;
				if (!record.commandResults || typeof record.commandResults !== "object") record.commandResults = {};
				record.commandResults[entry.command] = {
					ok: false,
					detail: "expired: runner did not collect the command in time",
					at: new Date(now).toISOString(),
				};
			} else {
				kept.push(entry);
			}
		}
		record.pendingCommands = kept;
		if (changed) this._persist();
		return changed;
	}

	enqueueCommand(runnerId, command) {
		const record = this._getOrThrow(runnerId);
		if (record.status !== "active") {
			throw RunnerRegistry._fail(
				409,
				"COMMAND_INVALID_STATE",
				`Runner ${runnerId} is ${record.status}; commands require an active Runner.`,
			);
		}
		if (typeof command !== "string" || !RUNNER_COMMANDS.includes(command)) {
			throw RunnerRegistry._fail(400, "UNKNOWN_COMMAND", `Unknown runner command '${command}'.`);
		}
		this._expireStale(record);
		const pending = (Array.isArray(record.pendingCommands) ? record.pendingCommands : []).filter((e) => e.command !== command);
		const requestedAt = new Date().toISOString();
		pending.push({ command, requestedAt });
		record.pendingCommands = pending;
		this._persist();
		return { runnerId, command, status: "queued", requestedAt, pending: pending.map((e) => e.command) };
	}

	/***
	 * MARK: peekCommands
	 * @description Delivery read for the heartbeat pull channel: the queued,
	 *   unexpired command names for one Runner, WITHOUT clearing them.
	 *   Entries clear only on Runner ack (`heartbeat()` consumes
	 *   `facts.commandAck`) or TTL expiry, so a Runner that crashes between
	 *   delivery and action still collects the command on its next
	 *   heartbeat (at-least-once; the daemon dedups in-flight repeats and
	 *   skips commands it already staged an ack for).
	 * @example registry.peekCommands('r1') => ['requestUpdate']
	 * @param {string} runnerId - Runner id.
	 * @returns {string[]} Queued command names.
	 ***/
	peekCommands(runnerId) {
		const record = this.runners.get(runnerId);
		if (!record) return [];
		this._expireStale(record);
		const entries = Array.isArray(record.pendingCommands) ? record.pendingCommands : [];
		return entries.map((e) => e.command);
	}

	heartbeat({ runnerId, credential, facts = {}, origin = null } = {}) {
		const record = this.authenticate(credential);
		if (record.runnerId !== runnerId) {
			throw RunnerRegistry._fail(
				403,
				"SCOPE_MISMATCH",
				"Credential does not belong to this Runner.",
			);
		}
		const capabilities = RunnerRegistry._capabilitiesOrThrow(facts);
		const apiCompat = runnerApiCompatible(facts?.versions?.api);
		if (!apiCompat.ok) {
			throw RunnerRegistry._fail(
				409,
				"PROTOCOL_VERSION_UNSUPPORTED",
				`Runner API version ${String(facts?.versions?.api)} does not satisfy backend accepts.runner ${apiCompat.range}.`,
			);
		}
		const protocol = facts?.versions?.protocol;
		if (protocol && protocol !== RUNNER_PROTOCOL) {
			throw RunnerRegistry._fail(
				409,
				"PROTOCOL_VERSION_UNSUPPORTED",
				`Runner protocol ${String(protocol)} is outside the N-1 window (backend ${RUNNER_PROTOCOL}, floor ${MIN_RUNNER_PROTOCOL}).`,
			);
		}
		// G11 audit alert: one identity (credential) heartbeating from
		// multiple origins means the credential leaked or the Runner
		// migrated hosts. Loopback Runners share one origin, so any change
		// is worth counting loudly — the monitor surface exposes the
		// per-Runner `originConflicts` count, never the address itself.
		const seenOrigin = typeof origin === "string" && origin ? origin : null;
		if (seenOrigin) {
			if (record.lastOrigin && record.lastOrigin !== seenOrigin) {
				record.originConflicts = (record.originConflicts || 0) + 1;
			}
			record.lastOrigin = seenOrigin;
		}
		const ack = facts?.commandAck;
		let changedByAck = false;
		if (ack && typeof ack === "object" && typeof ack.command === "string" && RUNNER_COMMANDS.includes(ack.command)) {
			if (!record.commandResults || typeof record.commandResults !== "object" || Array.isArray(record.commandResults)) {
				record.commandResults = {};
			}
			record.commandResults[ack.command] = {
				ok: typeof ack.ok === "boolean" ? ack.ok : Boolean(ack.ok),
				detail: typeof ack.detail === "string" ? ack.detail : "",
				at: new Date().toISOString(),
			};
			if (Array.isArray(record.pendingCommands)) {
				const before = record.pendingCommands.length;
				record.pendingCommands = record.pendingCommands.filter((e) => e.command !== ack.command);
				if (record.pendingCommands.length !== before) changedByAck = true;
			}
			changedByAck = true;
		}
		record.facts = facts;
		record.capabilities = capabilities;
		record.lastSeenAt = new Date().toISOString();
		this._expireStale(record);
		if (changedByAck) this._persist();
		return this._public(record);
	}

	list() {
		return [...this.runners.values()].map((record) => this._public(record));
	}
}
