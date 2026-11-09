// Role: browser sessions — opaque ids, hashing at rest, TTL, cookies.
// Domain: Access — organisation-level user control (OIDC + RBAC, togglable).

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { _atomicWriteFileSync } from "../house/fileWriting.js";

/***
 * MARK: SESSIONS_FILENAME
 * @description Server-side browser sessions live in this JSON file, keyed by
 *   the SHA-256 hash of the opaque id — a stolen file never yields a live
 *   session cookie.
 * @example SESSIONS_FILENAME => 'sessions.json'
 ***/
export const SESSIONS_FILENAME = "sessions.json";

/***
 * MARK: sessionsFilePath
 * @description Absolute path of the session file for a state dir.
 * @example sessionsFilePath('/tmp/x') => '/tmp/x/sessions.json'
 * @param {string} stateDir - Auth state directory.
 * @returns {string} Path of `sessions.json` inside it.
 ***/
export const sessionsFilePath = (stateDir) =>
	path.join(stateDir, SESSIONS_FILENAME);

/***
 * MARK: hashSessionId
 * @description One-way hash used as the at-rest session key. The raw opaque
 *   id only ever travels in the cookie and in this call's return value.
 * @example typeof hashSessionId('abc') => 'string'
 * @param {string} sessionId - Raw opaque session id.
 * @returns {string} Hex SHA-256 digest.
 ***/
export const hashSessionId = (sessionId) =>
	crypto.createHash("sha256").update(String(sessionId)).digest("hex");

/***
 * MARK: newSessionId
 * @description Mints one unguessable opaque session id (256 bits of
 *   randomness, URL-safe). Rotated on every login against fixation.
 * @example newSessionId().length => 43
 * @returns {string} Fresh session id.
 ***/
export const newSessionId = () => crypto.randomBytes(32).toString("base64url");

/***
 * MARK: shouldUseSecureCookie
 * @description Whether the session cookie carries the `Secure` flag:
 *   always on https, and on plain http only for loopback hosts (browsers
 *   accept `Secure` cookies over `http://localhost`, but a non-loopback
 *   plain-http `Secure` cookie would silently never be stored).
 * @example shouldUseSecureCookie({ protocol: 'http:', hostname: 'localhost' }) => true
 * @param {Object} [args] - Labelled inputs.
 * @param {string} [args.protocol] - Request protocol (`https:` or `http:`).
 * @param {string} [args.hostname] - Request hostname.
 * @returns {boolean} True when the cookie must be `Secure`.
 ***/
export const shouldUseSecureCookie = ({ protocol, hostname } = {}) => {
	if (protocol === "https:") return true;
	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "::1"
	);
};

/***
 * MARK: buildSessionCookie
 * @description Renders the `Set-Cookie` value for a live session: opaque id,
 *   `HttpOnly`, `SameSite=Lax` (the top-level OIDC redirect back still
 *   works), `Path=/`, and `Secure` per `shouldUseSecureCookie`.
 * @example buildSessionCookie({ sessionId: 's', cookieName: 'kb_session', secure: false }) => 'kb_session=s; Path=/; HttpOnly; SameSite=Lax'
 * @param {Object} args - Labelled inputs.
 * @param {string} args.sessionId - Raw opaque session id.
 * @param {string} args.cookieName - Cookie name.
 * @param {boolean} args.secure - Whether to add the `Secure` flag.
 * @param {number} [args.maxAgeMs] - `Max-Age` in ms (defaults to the absolute TTL passed by the caller).
 * @returns {string} `Set-Cookie` header value.
 ***/
export const buildSessionCookie = ({
	sessionId,
	cookieName,
	secure,
	maxAgeMs,
} = {}) => {
	const parts = [
		`${cookieName}=${encodeURIComponent(sessionId)}`,
		"Path=/",
		"HttpOnly",
		"SameSite=Lax",
	];
	if (Number.isFinite(maxAgeMs) && maxAgeMs > 0) {
		parts.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`);
	}
	if (secure === true) parts.push("Secure");
	return parts.join("; ");
};

/***
 * MARK: buildClearedCookie
 * @description Renders the logout `Set-Cookie` value: empty, immediately
 *   expired, same `Path` so it overwrites the live cookie.
 * @example buildClearedCookie('kb_session') => 'kb_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
 * @param {string} cookieName - Cookie name.
 * @returns {string} `Set-Cookie` header value.
 ***/
export const buildClearedCookie = (cookieName) =>
	`${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

/***
 * MARK: readSessionIdFromHeader
 * @description Pulls one cookie value out of a raw `Cookie` header without
 *   any new dependency. Malformed pairs are skipped, never thrown on.
 * @example readSessionIdFromHeader('a=1; kb_session=s3cr3t', 'kb_session') => 's3cr3t'
 * @param {*} header - Raw `Cookie` header value.
 * @param {string} cookieName - Cookie name to find.
 * @returns {string|null} Decoded value or null.
 ***/
export const readSessionIdFromHeader = (header, cookieName) => {
	if (typeof header !== "string" || typeof cookieName !== "string") {
		return null;
	}
	for (const pair of header.split(";")) {
		const index = pair.indexOf("=");
		if (index < 0) continue;
		if (pair.slice(0, index).trim() !== cookieName) continue;
		try {
			return decodeURIComponent(pair.slice(index + 1).trim());
		} catch {
			return null;
		}
	}
	return null;
};

/***
 * MARK: createSessionStore
 * @description Builds the server-side browser-session store bound to one
 *   state dir: create on login, verify per request (absolute + idle TTL
 *   with sliding refresh), destroy on logout. TTL values ride along per
 *   call so a settings-page change applies without a restart.
 * @example createSessionStore({ stateDir: '/tmp/x' }).lookupSession('nope', {}) => null
 * @param {Object} [args] - Labelled inputs.
 * @param {string} [args.stateDir] - Auth state directory.
 * @returns {{ createSession: Function, lookupSession: Function, destroySession: Function, countSessions: Function }} Session store handle.
 ***/
export const createSessionStore = ({ stateDir } = {}) => {
	const filePath = sessionsFilePath(stateDir);
	const byHash = new Map();
	let lastPersistedAt = 0;
	const loadFromDisk = () => {
		let parsed = null;
		try {
			/* eslint-disable-next-line security/detect-non-literal-fs-filename -- path built by sessionsFilePath from the resolved state dir */
			parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
		} catch {
			parsed = null;
		}
		byHash.clear();
		const rows = parsed && typeof parsed === "object" ? parsed : {};
		for (const [hash, record] of Object.entries(rows)) {
			if (!record || typeof record !== "object") continue;
			if (typeof record.userId !== "string" || record.userId === "") continue;
			// eslint-disable-next-line security/detect-object-injection -- hash keys come from this store's own file
			byHash.set(hash, { ...record });
		}
	};
	const persist = () => {
		if (!fs.existsSync(stateDir)) {
			/* eslint-disable-next-line security/detect-non-literal-fs-filename -- state dir resolved by resolveAuthStateDir */
			fs.mkdirSync(stateDir, { recursive: true });
		}
		_atomicWriteFileSync(
			filePath,
			`${JSON.stringify(Object.fromEntries(byHash), null, 2)}\n`,
		);
		lastPersistedAt = Date.now();
	};
	loadFromDisk();

	return {
		createSession: ({ userId, ip = "", userAgent = "", ttlMs } = {}) => {
			if (typeof userId !== "string" || userId === "") {
				throw new Error("createSession needs a userId");
			}
			const now = Date.now();
			const absoluteTtl =
				Number.isFinite(Number(ttlMs)) && Number(ttlMs) > 0
					? Number(ttlMs)
					: 12 * 60 * 60 * 1000;
			const sessionId = newSessionId();
			const record = {
				userId,
				createdAt: new Date(now).toISOString(),
				expiresAt: new Date(now + absoluteTtl).toISOString(),
				lastSeenAt: new Date(now).toISOString(),
				ip: typeof ip === "string" ? ip : "",
				userAgent: typeof userAgent === "string" ? userAgent : "",
			};
			byHash.set(hashSessionId(sessionId), record);
			persist();
			return { sessionId, record: { ...record } };
		},
		lookupSession: (sessionId, { now, ttlMs, idleMs } = {}) => {
			if (typeof sessionId !== "string" || sessionId === "") return null;
			const record = byHash.get(hashSessionId(sessionId));
			if (!record) return null;
			const at = Number.isFinite(Number(now)) ? Number(now) : Date.now();
			const absoluteTtl =
				Number.isFinite(Number(ttlMs)) && Number(ttlMs) > 0
					? Number(ttlMs)
					: 12 * 60 * 60 * 1000;
			const idleTtl =
				Number.isFinite(Number(idleMs)) && Number(idleMs) > 0
					? Number(idleMs)
					: 30 * 60 * 1000;
			const absoluteDeadline =
				Date.parse(record.expiresAt) ||
				Date.parse(record.createdAt) + absoluteTtl;
			if (at >= absoluteDeadline) {
				byHash.delete(hashSessionId(sessionId));
				persist();
				return null;
			}
			if (at - Date.parse(record.lastSeenAt) >= idleTtl) {
				byHash.delete(hashSessionId(sessionId));
				persist();
				return null;
			}
			const refreshed = {
				...record,
				lastSeenAt: new Date(at).toISOString(),
			};
			byHash.set(hashSessionId(sessionId), refreshed);
			// Sliding refresh writes are throttled: the in-memory record is
			// always current, the file catches up at most once a minute (and
			// on every create/destroy), so per-request traffic never turns
			// into per-request disk writes.
			if (at - lastPersistedAt >= 60 * 1000) persist();
			return { ...refreshed };
		},
		destroySession: (sessionId) => {
			if (typeof sessionId !== "string" || sessionId === "") return false;
			const removed = byHash.delete(hashSessionId(sessionId));
			if (removed) persist();
			return removed;
		},
		countSessions: () => byHash.size,
	};
};
