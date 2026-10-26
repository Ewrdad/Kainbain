// Domain: Web Push — VAPID key lifecycle (RFC 8292).
/***
 * MARK: VAPID key store
 * @description Generates, persists, and serves the VAPID P-256 key pair used
 *   to authenticate Web Push protocol sends. Precedence: explicit
 *   `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` env vars win (stateless deploys),
 *   otherwise `<pushDir>/push-vapid.json` (mode 0600), otherwise a fresh
 *   pair generated via the `web-push` library and saved atomically.
 *   Pure module state is cached per process; tests reset via `resetVapidCache`
 *   and pass an isolated `dir` so the live `~/.kainbain/push` is never touched.
 * @example getPublicVapidKey({ dir: "/tmp/kb-push-test" }) => "BNc..."
 ***/
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "../config.js";
import { writePushJsonFile } from "./atomicWrite.js";

export const VAPID_FILE_NAME = "push-vapid.json";
export const DEFAULT_VAPID_SUBJECT = "mailto:admin@kainbain.local";

/***
 * MARK: resolvePushDir
 * @description Default on-disk home for push state (VAPID keys,
 *   subscriptions, settings): `~/.kainbain/push`, mirroring the deploy
 *   manager's `~/.kainbain/deploy` convention.
 * @example resolvePushDir() => "~/.kainbain/push"
 ***/
export function resolvePushDir() {
	return path.join(os.homedir(), ".kainbain", "push");
}

/**
 * In-process key cache, keyed by resolved push dir. A single global entry
 * would leak keys across dirs (production `~/.kainbain/push` vs isolated
 * test dirs), so each dir owns its entry. Explicit env keys always win for
 * the dir they were requested with and refresh that dir's entry.
 */
const cachedByDir = new Map();

/***
 * MARK: resetVapidCache
 * @description Test seam: drops the in-process key cache so the next read
 *   re-evaluates env/disk. Never touches disk.
 * @example resetVapidCache()
 ***/
export function resetVapidCache() {
	cachedByDir.clear();
}

/***
 * MARK: readKeysFile
 * @description Reads a persisted key pair, returning null when absent or
 *   malformed (a corrupt file is treated as missing, never fatal).
 * @param {string} dir
 * @returns {{ publicKey: string, privateKey: string }|null}
 ***/
function readKeysFile(dir) {
	try {
		/* eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is server-owned push state, not request input */
		const raw = fs.readFileSync(path.join(dir, VAPID_FILE_NAME), "utf8");
		const parsed = JSON.parse(raw);
		if (
			typeof parsed?.publicKey === "string" &&
			parsed.publicKey.length > 0 &&
			typeof parsed?.privateKey === "string" &&
			parsed.privateKey.length > 0
		) {
			return { publicKey: parsed.publicKey, privateKey: parsed.privateKey };
		}
		return null;
	} catch {
		return null;
	}
}

/***
 * MARK: writeKeysFile
 * @description Atomically persists a key pair (tmp write + rename) with mode
 *   0600 so a concurrent reader never sees a half-written file.
 * @param {string} dir
 * @param {{ publicKey: string, privateKey: string }} keys
 ***/
function writeKeysFile(dir, keys) {
	writePushJsonFile(dir, VAPID_FILE_NAME, keys);
}

/***
 * MARK: getVapidKeys
 * @description Returns the active VAPID key pair, generating + persisting one
 *   on first use when neither env nor disk provides it.
 * @param {Object} [opts]
 * @param {string} [opts.dir] - Push state dir (defaults to ~/.kainbain/push).
 * @param {Object} [opts.env] - Env source (defaults to process.env; injectable for tests).
 * @returns {Promise<{ publicKey: string, privateKey: string }>}
 ***/
export async function getVapidKeys(opts = {}) {
	const env = opts.env || process.env;
	const dir = opts.dir || resolvePushDir();
	const envPublic = typeof env?.VAPID_PUBLIC_KEY === "string" ? env.VAPID_PUBLIC_KEY.trim() : "";
	const envPrivate = typeof env?.VAPID_PRIVATE_KEY === "string" ? env.VAPID_PRIVATE_KEY.trim() : "";
	if (envPublic && envPrivate) {
		const fromEnv = { publicKey: envPublic, privateKey: envPrivate };
		cachedByDir.set(dir, fromEnv);
		return fromEnv;
	}
	const cached = cachedByDir.get(dir);
	if (cached) return cached;
	const fromDisk = readKeysFile(dir);
	if (fromDisk) {
		cachedByDir.set(dir, fromDisk);
		return fromDisk;
	}
	const { default: webpush } = await import("web-push");
	const generated = webpush.generateVAPIDKeys();
	const fresh = { publicKey: generated.publicKey, privateKey: generated.privateKey };
	cachedByDir.set(dir, fresh);
	try {
		writeKeysFile(dir, fresh);
	} catch {
		// Persistence is best-effort: the in-memory pair still serves this
		// process (a read-only home must not break boot).
	}
	return fresh;
}

/***
 * MARK: getPublicVapidKey
 * @description Returns only the public key (the value shipped to browsers).
 * @param {Object} [opts] - Same options as getVapidKeys.
 * @returns {Promise<string>}
 ***/
export async function getPublicVapidKey(opts = {}) {
	const keys = await getVapidKeys(opts);
	return keys.publicKey;
}

/***
 * MARK: getVapidSubject
 * @description Returns the VAPID contact subject (`mailto:` or URL).
 *   Precedence: `VAPID_SUBJECT` env, explicit `opts.fallback`, the configured
 *   `vapidSubject` (`api/config/schema.js`, env `VAPID_SUBJECT`), then the
 *   built-in default.
 * @param {Object} [opts]
 * @param {Object} [opts.env]
 * @param {string} [opts.fallback]
 * @returns {string}
 ***/
export function getVapidSubject(opts = {}) {
	const env = opts.env || process.env;
	const raw = typeof env?.VAPID_SUBJECT === "string" ? env.VAPID_SUBJECT.trim() : "";
	if (raw) return raw;
	if (opts.fallback) return opts.fallback;
	const configured =
		typeof config?.vapidSubject === "string" ? config.vapidSubject.trim() : "";
	if (configured) return configured;
	return DEFAULT_VAPID_SUBJECT;
}
