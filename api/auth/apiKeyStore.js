// Role: API-key records — least-privilege credentials for agents and services.
// Domain: Access — organisation-level user control (OIDC + RBAC, togglable).

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { _atomicWriteFileSync } from "../house/fileWriting.js";
import { sanitizeRoles } from "./roles.js";
import { sanitizeApiKeyScopes } from "./apiKeyScopes.js";

/***
 * MARK: API_KEYS_FILENAME
 * @description API-key records live in this JSON file inside the auth state
 *   dir. Only SHA-256 hashes persist — a stolen file never yields a live
 *   secret.
 * @example API_KEYS_FILENAME => 'api-keys.json'
 ***/
export const API_KEYS_FILENAME = "api-keys.json";

/***
 * MARK: API_KEY_SECRET_PREFIX
 * @description Plaintext secrets start with this marker so logs, pastes, and
 *   support threads can recognise an API key at a glance.
 * @example API_KEY_SECRET_PREFIX => 'kb_'
 ***/
export const API_KEY_SECRET_PREFIX = "kb_";

/***
 * MARK: API_KEY_NAME_MAX_LENGTH
 * @description Longest accepted key name. Names flag every action the key
 *   takes, so they stay short enough for history lines and audit entries.
 * @example API_KEY_NAME_MAX_LENGTH => 80
 ***/
export const API_KEY_NAME_MAX_LENGTH = 80;

/***
 * MARK: apiKeysFilePath
 * @description Absolute path of the API-key file for a state dir.
 * @example apiKeysFilePath('/tmp/x') => '/tmp/x/api-keys.json'
 * @param {string} stateDir - Auth state directory.
 * @returns {string} Path of `api-keys.json` inside it.
 ***/
export const apiKeysFilePath = (stateDir) =>
	path.join(stateDir, API_KEYS_FILENAME);

/***
 * MARK: hashApiKeySecret
 * @description One-way hash used as the at-rest key. The raw secret only
 *   ever travels in the create response and the caller's header.
 * @example typeof hashApiKeySecret('kb_abc') => 'string'
 * @param {string} secret - Raw plaintext API-key secret.
 * @returns {string} Hex SHA-256 digest.
 ***/
export const hashApiKeySecret = (secret) =>
	crypto.createHash("sha256").update(String(secret)).digest("hex");

/***
 * MARK: newApiKeySecret
 * @description Mints one unguessable API-key secret (256 bits of randomness,
 *   URL-safe) plus its short public prefix. The prefix identifies the key in
 *   listings without ever revealing the secret.
 * @example newApiKeySecret().secret.startsWith('kb_') => true
 * @returns {{ secret: string, prefix: string }} Fresh secret and prefix.
 ***/
export const newApiKeySecret = () => {
	const raw = crypto.randomBytes(32).toString("base64url");
	return {
		secret: `${API_KEY_SECRET_PREFIX}${raw}`,
		prefix: raw.slice(0, 8),
	};
};

/***
 * MARK: normalizeApiKeyName
 * @description Trims and validates a key name. Names are the attribution
 *   label on every action the key takes, so they must be non-empty.
 * @example normalizeApiKeyName('  scanner  ') => 'scanner'
 * @param {*} name - Candidate name.
 * @returns {string} Trimmed name.
 ***/
export const normalizeApiKeyName = (name) => {
	if (typeof name !== "string" || name.trim() === "") {
		throw new Error("createApiKey needs a non-empty name");
	}
	const trimmed = name.trim();
	if (trimmed.length > API_KEY_NAME_MAX_LENGTH) {
		throw new Error(
			`API key name must be ${API_KEY_NAME_MAX_LENGTH} characters or fewer`,
		);
	}
	return trimmed;
};

/***
 * MARK: normalizeApiKeyExpiry
 * @description Normalises an optional expiry to an ISO string or null.
 *   Empty means the key lives until revoked; garbage fails loud so a typo
 *   can never silently mint a never-expiring key.
 * @example normalizeApiKeyExpiry(null) => null
 * @param {*} expiresAt - Candidate expiry (ISO string, Date, or empty).
 * @returns {string|null} ISO timestamp or null.
 ***/
export const normalizeApiKeyExpiry = (expiresAt) => {
	if (expiresAt === null || expiresAt === undefined || expiresAt === "") {
		return null;
	}
	const date =
		expiresAt instanceof Date ? expiresAt : new Date(String(expiresAt));
	if (Number.isNaN(date.getTime())) {
		throw new Error("expiresAt must be an ISO date string or null");
	}
	return date.toISOString();
};

/***
 * MARK: publicApiKeyShape
 * @description The safe listing shape: everything except the hash. The
 *   plaintext secret exists only in the create response and is never stored.
 * @example publicApiKeyShape({ hash: 'x', name: 'n' }).hash => undefined
 * @param {Object} [record] - Stored key record.
 * @returns {Object} Metadata without secret material.
 ***/
export const publicApiKeyShape = (record = {}) => ({
	id: record.id,
	name: record.name,
	prefix: record.prefix,
	roles: Array.isArray(record.roles) ? [...record.roles] : [],
	scopes: Array.isArray(record.scopes) ? [...record.scopes] : [],
	expiresAt: record.expiresAt ?? null,
	createdBy: record.createdBy ?? "",
	createdAt: record.createdAt ?? "",
	lastUsedAt: record.lastUsedAt ?? null,
	revoked: record.revoked === true,
	revokedAt: record.revokedAt ?? null,
});

/***
 * MARK: createApiKeyStore
 * @description Builds the API-key store bound to one state dir: create (the
 *   plaintext secret is returned once, only its hash persists), verify per
 *   request (revocation + expiry aware), list (metadata only), revoke, and
 *   throttled last-used tracking. The JSON file loads once at creation and
 *   every mutation rewrites it atomically.
 * @example createApiKeyStore({ stateDir: '/tmp/x' }).listApiKeys() => []
 * @param {Object} [args] - Labelled inputs.
 * @param {string} [args.stateDir] - Auth state directory.
 * @returns {{ createApiKey: Function, verifyApiKey: Function, findById: Function, listApiKeys: Function, revokeApiKey: Function, touchLastUsed: Function, countApiKeys: Function }} API-key store handle.
 ***/
export const createApiKeyStore = ({ stateDir } = {}) => {
	const filePath = apiKeysFilePath(stateDir);
	const byId = new Map();
	let lastPersistedAt = 0;
	const loadFromDisk = () => {
		let parsed = null;
		try {
			/* eslint-disable-next-line security/detect-non-literal-fs-filename -- path built by apiKeysFilePath from the resolved state dir */
			parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
		} catch {
			parsed = null;
		}
		byId.clear();
		const rows = parsed && Array.isArray(parsed.keys) ? parsed.keys : [];
		for (const row of rows) {
			if (!row || typeof row !== "object") continue;
			if (typeof row.id !== "string" || row.id === "") continue;
			if (typeof row.hash !== "string" || row.hash === "") continue;
			byId.set(row.id, {
				id: row.id,
				name: typeof row.name === "string" ? row.name : "",
				prefix: typeof row.prefix === "string" ? row.prefix : "",
				roles: sanitizeRoles(row.roles),
				scopes: sanitizeApiKeyScopes(row.scopes),
				hash: row.hash,
				expiresAt: typeof row.expiresAt === "string" ? row.expiresAt : null,
				createdBy: typeof row.createdBy === "string" ? row.createdBy : "",
				createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
				lastUsedAt:
					typeof row.lastUsedAt === "string" ? row.lastUsedAt : null,
				revoked: row.revoked === true,
				revokedAt: typeof row.revokedAt === "string" ? row.revokedAt : null,
			});
		}
	};
	const persist = () => {
		if (!fs.existsSync(stateDir)) {
			/* eslint-disable-next-line security/detect-non-literal-fs-filename -- state dir resolved by resolveAuthStateDir */
			fs.mkdirSync(stateDir, { recursive: true });
		}
		_atomicWriteFileSync(
			filePath,
			`${JSON.stringify({ keys: [...byId.values()] }, null, 2)}\n`,
		);
		lastPersistedAt = Date.now();
	};
	loadFromDisk();

	return {
		createApiKey: ({
			name,
			roles,
			scopes,
			expiresAt,
			createdBy = "",
			now,
		} = {}) => {
			const cleanName = normalizeApiKeyName(name);
			const lowered = cleanName.toLowerCase();
			for (const existing of byId.values()) {
				if (
					existing.revoked !== true &&
					String(existing.name).toLowerCase() === lowered
				) {
					throw new Error(`An API key named "${cleanName}" already exists`);
				}
			}
			const keptRoles = sanitizeRoles(roles);
			const at = Number.isFinite(Number(now)) ? Number(now) : Date.now();
			const { secret, prefix } = newApiKeySecret();
			const record = {
				id: crypto.randomUUID(),
				name: cleanName,
				prefix,
				roles: keptRoles.length > 0 ? keptRoles : ["viewer"],
				scopes: sanitizeApiKeyScopes(scopes),
				hash: hashApiKeySecret(secret),
				expiresAt: normalizeApiKeyExpiry(expiresAt),
				createdBy: typeof createdBy === "string" ? createdBy : "",
				createdAt: new Date(at).toISOString(),
				lastUsedAt: null,
				revoked: false,
				revokedAt: null,
			};
			byId.set(record.id, record);
			persist();
			return { secret, key: publicApiKeyShape(record) };
		},
		verifyApiKey: (secret, { now } = {}) => {
			if (typeof secret !== "string" || secret === "") {
				return { ok: false, reason: "unknown" };
			}
			const presented = Buffer.from(hashApiKeySecret(secret), "utf8");
			let matched = null;
			for (const record of byId.values()) {
				const stored = Buffer.from(String(record.hash), "utf8");
				if (
					stored.length === presented.length &&
					crypto.timingSafeEqual(stored, presented)
				) {
					matched = record;
					break;
				}
			}
			if (!matched) return { ok: false, reason: "unknown" };
			if (matched.revoked === true) {
				return {
					ok: false,
					reason: "revoked",
					record: publicApiKeyShape(matched),
				};
			}
			if (matched.expiresAt) {
				const at = Number.isFinite(Number(now)) ? Number(now) : Date.now();
				if (at >= Date.parse(matched.expiresAt)) {
					return {
						ok: false,
						reason: "expired",
						record: publicApiKeyShape(matched),
					};
				}
			}
			return { ok: true, record: publicApiKeyShape(matched) };
		},
		findById: (id) => {
			if (typeof id !== "string" || id === "") return null;
			const record = byId.get(id);
			return record ? publicApiKeyShape(record) : null;
		},
		listApiKeys: () =>
			[...byId.values()]
				.sort((left, right) =>
					String(left.createdAt).localeCompare(String(right.createdAt)),
				)
				.map((record) => publicApiKeyShape(record)),
		revokeApiKey: (id, { now } = {}) => {
			if (typeof id !== "string" || id === "") return null;
			const record = byId.get(id);
			if (!record) return null;
			if (record.revoked !== true) {
				const at = Number.isFinite(Number(now)) ? Number(now) : Date.now();
				record.revoked = true;
				record.revokedAt = new Date(at).toISOString();
				persist();
			}
			return publicApiKeyShape(record);
		},
		touchLastUsed: (id, { now } = {}) => {
			if (typeof id !== "string" || id === "") return;
			const record = byId.get(id);
			if (!record || record.revoked === true) return;
			const at = Number.isFinite(Number(now)) ? Number(now) : Date.now();
			record.lastUsedAt = new Date(at).toISOString();
			// Last-used writes are throttled like session refreshes: memory
			// is always current, the file catches up at most once a minute,
			// so per-request traffic never becomes per-request disk writes.
			if (at - lastPersistedAt >= 60 * 1000) persist();
		},
		countApiKeys: () => byId.size,
	};
};
