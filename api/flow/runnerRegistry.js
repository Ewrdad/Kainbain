import { v4 as uuidv4 } from "uuid";
import { normalizeCapabilities } from "./dispatch/normalizeCapabilities.js";

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
 *   with an explicit signal, never best-effort dispatched (D7). In-memory
 *   for Phase 2 (the backend is still the single writer); durability is
 *   Phase 4 per the risk-retirement matrix — until then a restart drops
 *   registrations back to pending and Runners re-register.
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
 * MARK: RunnerRegistry
 * @description In-memory Runner identity ledger for D4/R04. See the module
 *   block above for the lifecycle.
 * @example const r = new RunnerRegistry({ joinToken: 's3cret' }); r.register({ runnerId: 'h1', joinToken: 's3cret', facts: {} }) => { status: 'pending', ... }
 ***/
export class RunnerRegistry {
	constructor({ joinToken = "", newCredential = () => uuidv4(), staleAfterMs = 60000 } = {}) {
		this.joinToken = joinToken;
		this.newCredential = newCredential;
		this.staleAfterMs =
			typeof staleAfterMs === "number" && staleAfterMs > 0 ? staleAfterMs : 60000;
		this.runners = new Map();
		this.credentials = new Map();
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
		};
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
		const existing = this.runners.get(runnerId);
		if (existing) {
			existing.facts = facts;
			existing.capabilities = capabilities;
			return { ...this._public(existing), credential: null };
		}
		const record = {
			runnerId,
			status: "pending",
			facts,
			capabilities,
			credential: null,
			lastSeenAt: null,
		};
		this.runners.set(runnerId, record);
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

	approve(runnerId) {
		const record = this._getOrThrow(runnerId);
		if (record.status === "active" && record.credential) {
			return { ...this._public(record), credential: null };
		}
		if (record.credential) this.credentials.delete(record.credential);
		record.credential = this.newCredential();
		record.status = "active";
		this.credentials.set(record.credential, record.runnerId);
		return { ...this._public(record), credential: record.credential };
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
		return this._public(record);
	}

	revoke(runnerId) {
		const record = this._getOrThrow(runnerId);
		if (record.credential) this.credentials.delete(record.credential);
		record.credential = null;
		record.status = "revoked";
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

	heartbeat({ runnerId, credential, facts = {} } = {}) {
		const record = this.authenticate(credential);
		if (record.runnerId !== runnerId) {
			throw RunnerRegistry._fail(
				403,
				"SCOPE_MISMATCH",
				"Credential does not belong to this Runner.",
			);
		}
		const capabilities = RunnerRegistry._capabilitiesOrThrow(facts);
		const protocol = facts?.versions?.protocol;
		if (protocol && protocol !== RUNNER_PROTOCOL) {
			throw RunnerRegistry._fail(
				409,
				"PROTOCOL_VERSION_UNSUPPORTED",
				`Runner protocol ${String(protocol)} is outside the N-1 window (backend ${RUNNER_PROTOCOL}, floor ${MIN_RUNNER_PROTOCOL}).`,
			);
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
