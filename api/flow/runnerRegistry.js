import { v4 as uuidv4 } from "uuid";
import { config } from "../config.js";
import { loadStateFile } from "./loadStateFile.js";
import { resolveStatePath } from "./resolveStatePath.js";
import { saveStateFile } from "./saveStateFile.js";
import { normalizeCapabilities } from "./dispatch/normalizeCapabilities.js";
import { runnerApiCompatible } from "./dispatch/runnerApiCompat.js";

const RUNNER_STATE_VERSION = 1;

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
				lastOrigin: typeof rec.lastOrigin === "string" ? rec.lastOrigin : null,
				originConflicts:
					Number.isInteger(rec.originConflicts) && rec.originConflicts > 0
						? rec.originConflicts
						: 0,
				paused: rec.paused === true,
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
				lastOrigin: record.lastOrigin || null,
				originConflicts: record.originConflicts || 0,
				paused: record.paused === true,
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
		};
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

	register({ runnerId, joinToken, facts = {} } = {}) {
		RunnerRegistry._requireRunnerId(runnerId);
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
			paused: false,
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
		record.facts = facts;
		record.capabilities = capabilities;
		record.lastSeenAt = new Date().toISOString();
		return this._public(record);
	}

	list() {
		return [...this.runners.values()].map((record) => this._public(record));
	}
}
