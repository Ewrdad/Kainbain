// Domain: image generation — server-owned API key store for survey image providers.
// Mirrors the prompt-layout atomic-store posture: a 0600 JSON file under the
// server-owned `~/.kainbain/image-gen/` dir (override via KAINBAIN_IMAGE_GEN_DIR),
// tmp-file + rename writes, and missing/corrupt files reading as "no stored
// key". A per-provider env override (KAINBAIN_IMAGE_GEN_<PROVIDER>_API_KEY)
// always wins over the stored file. Keys are never logged and never leave
// this module except to the provider call itself.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/***
 * MARK: IMAGE_GEN_KEYS_FILE_NAME
 * @description File name of the stored key map inside the image-gen dir.
 * @example IMAGE_GEN_KEYS_FILE_NAME => 'image-gen-keys.json'
 ***/
export const IMAGE_GEN_KEYS_FILE_NAME = "image-gen-keys.json";

/***
 * MARK: IMAGE_GEN_KEY_MAX_LENGTH
 * @description Longest accepted API key (over-long input is a misconfiguration,
 *   not a key, and is rejected on write).
 * @example IMAGE_GEN_KEY_MAX_LENGTH => 4096
 ***/
export const IMAGE_GEN_KEY_MAX_LENGTH = 4096;

const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

// Monotonic counter so concurrent writes from this process never share a
// tmp file (the pid alone collides when two PUTs race in one process).
let tmpWriteCounter = 0;

/***
 * MARK: isValidImageGenProviderId
 * @description Strict validator for provider ids carried in routes and the key
 *   file: a lowercase slug that can never traverse (`..`, slashes, and
 *   uppercase are all rejected — ids are matched case-sensitively).
 * @example isValidImageGenProviderId('muse') => true
 * @example isValidImageGenProviderId('../x') => false
 * @param {*} value
 * @returns {boolean}
 ***/
export const isValidImageGenProviderId = (value) => {
	if (typeof value !== "string") return false;
	return PROVIDER_ID_PATTERN.test(value);
};

/***
 * MARK: resolveImageGenDir
 * @description Default on-disk home for the image-gen key file. Explicit
 *   `KAINBAIN_IMAGE_GEN_DIR` wins (tests and isolated deploys); otherwise
 *   `~/.kainbain/image-gen`, mirroring the prompt-layout `~/.kainbain`
 *   convention.
 * @example resolveImageGenDir() => '/home/server/.kainbain/image-gen'
 ***/
export const resolveImageGenDir = () => {
	const override =
		typeof process.env.KAINBAIN_IMAGE_GEN_DIR === "string"
			? process.env.KAINBAIN_IMAGE_GEN_DIR.trim()
			: "";
	if (override) return override;
	return path.join(os.homedir(), ".kainbain", "image-gen");
};

/***
 * MARK: envKeyNameForProvider
 * @description The env override name for one provider's API key
 *   (`KAINBAIN_IMAGE_GEN_<PROVIDER>_API_KEY`), or null for an invalid id.
 * @example envKeyNameForProvider('muse') => 'KAINBAIN_IMAGE_GEN_MUSE_API_KEY'
 * @param {string} providerId
 * @returns {string|null}
 ***/
export const envKeyNameForProvider = (providerId) => {
	if (!isValidImageGenProviderId(providerId)) return null;
	const slug = providerId.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
	return `KAINBAIN_IMAGE_GEN_${slug}_API_KEY`;
};

const keysFilePath = (dir) => path.join(path.resolve(dir), IMAGE_GEN_KEYS_FILE_NAME);

const readStoredKeys = (dir) => {
	/* eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is server-owned image-gen state, not request input */
	const raw = fs.readFileSync(keysFilePath(dir), "utf8");
	const parsed = JSON.parse(raw);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
	const keys = parsed.keys;
	if (!keys || typeof keys !== "object" || Array.isArray(keys)) return {};
	return keys;
};

const storedKeyFor = (dir, providerId) => {
	let keys = {};
	try {
		keys = readStoredKeys(dir);
	} catch {
		return "";
	}
	/* eslint-disable-next-line security/detect-object-injection -- providerId is validated before every call */
	const entry = keys[providerId];
	const raw = typeof entry === "string" ? entry : entry?.key;
	return typeof raw === "string" ? raw.trim() : "";
};

/***
 * MARK: getImageGenKey
 * @description The effective API key for one provider: the env override when
 *   set, else the stored file key, else "". Callers must never log the
 *   result — it is secret material for the provider call only.
 * @example getImageGenKey({ providerId: 'muse', dir: '/tmp/kb-x' }) => ''
 * @param {Object} [opts]
 * @param {string} [opts.providerId] - Registered provider id.
 * @param {string} [opts.dir] - Key store dir (defaults to resolveImageGenDir()).
 * @returns {string}
 ***/
export const getImageGenKey = ({ providerId, dir } = {}) => {
	if (!isValidImageGenProviderId(providerId)) return "";
	const envName = envKeyNameForProvider(providerId);
	/* eslint-disable security/detect-object-injection -- envName is derived from a validated provider id */
	const fromEnv =
		envName && typeof process.env[envName] === "string"
			? process.env[envName].trim()
			: "";
	/* eslint-enable security/detect-object-injection */
	if (fromEnv) return fromEnv;
	const home = dir || resolveImageGenDir();
	if (!home || typeof home !== "string") return "";
	return storedKeyFor(home, providerId);
};

/***
 * MARK: describeImageGenKey
 * @description Key presence for one provider without exposing the key: where
 *   the effective key comes from (`env` wins over `stored`), or unconfigured.
 *   This is the only shape routes and the UI ever see.
 * @example describeImageGenKey({ providerId: 'muse', dir: '/tmp/kb-x' }) => ({ configured: false, source: null })
 * @param {Object} [opts]
 * @param {string} [opts.providerId] - Registered provider id.
 * @param {string} [opts.dir] - Key store dir (defaults to resolveImageGenDir()).
 * @returns {{ configured: boolean, source: 'env'|'stored'|null }}
 ***/
export const describeImageGenKey = ({ providerId, dir } = {}) => {
	if (!isValidImageGenProviderId(providerId)) {
		return { configured: false, source: null };
	}
	const envName = envKeyNameForProvider(providerId);
	/* eslint-disable security/detect-object-injection -- envName is derived from a validated provider id */
	const fromEnv =
		envName && typeof process.env[envName] === "string"
			? process.env[envName].trim()
			: "";
	/* eslint-enable security/detect-object-injection */
	if (fromEnv) return { configured: true, source: "env" };
	const home = dir || resolveImageGenDir();
	if (!home || typeof home !== "string") return { configured: false, source: null };
	return storedKeyFor(home, providerId)
		? { configured: true, source: "stored" }
		: { configured: false, source: null };
};

/***
 * MARK: assertValidImageGenKeyForWrite
 * @description Strict write-path validation for an API key: a trimmed
 *   1–4096 char single-line string. Anything else throws a 400
 *   `INVALID_IMAGE_GEN_KEY` without touching the store.
 * @example assertValidImageGenKeyForWrite('sk-abc') => 'sk-abc'
 * @param {*} value
 * @returns {string} The trimmed key.
 ***/
export const assertValidImageGenKeyForWrite = (value) => {
	const fail = () => {
		const err = new Error(
			"Image provider key must be a non-empty single-line string (max 4096 chars)",
		);
		err.statusCode = 400;
		err.code = "INVALID_IMAGE_GEN_KEY";
		throw err;
	};
	if (typeof value !== "string") fail();
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > IMAGE_GEN_KEY_MAX_LENGTH) fail();
	if (/[\r\n\0]/.test(trimmed)) fail();
	return trimmed;
};

const writeKeysFile = (dir, keys) => {
	const resolvedDir = path.resolve(dir);
	/* eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is server-owned image-gen state, not request input */
	fs.mkdirSync(resolvedDir, { recursive: true, mode: 0o700 });
	tmpWriteCounter += 1;
	const tmp = path.join(
		resolvedDir,
		`.${IMAGE_GEN_KEYS_FILE_NAME}.tmp-${process.pid}-${tmpWriteCounter}`,
	);
	/* eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is server-owned image-gen state, not request input */
	fs.writeFileSync(tmp, JSON.stringify(keys, null, 2), { mode: 0o600 });
	try {
		/* eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is server-owned image-gen state, not request input */
		fs.chmodSync(tmp, 0o600);
	} catch {
		// Best-effort: the write mode already requested 0600.
	}
	/* eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is server-owned image-gen state, not request input */
	fs.renameSync(tmp, path.join(resolvedDir, IMAGE_GEN_KEYS_FILE_NAME));
};

/***
 * MARK: setImageGenKey
 * @description Stores one provider's API key (0600, crash-safe tmp + rename).
 *   Unknown provider ids throw a 400 `UNKNOWN_IMAGE_GEN_PROVIDER`; invalid
 *   keys throw `INVALID_IMAGE_GEN_KEY`. Never returns or logs the key.
 * @example setImageGenKey({ providerId: 'muse', key: 'sk-abc', dir }) => ({ providerId: 'muse', configured: true })
 * @param {Object} [opts]
 * @param {string} [opts.providerId] - Registered provider id.
 * @param {string} [opts.key] - Raw API key.
 * @param {string} [opts.dir] - Key store dir (defaults to resolveImageGenDir()).
 * @returns {{ providerId: string, configured: boolean }}
 ***/
export const setImageGenKey = ({ providerId, key, dir } = {}) => {
	if (!isValidImageGenProviderId(providerId)) {
		const err = new Error(`Unknown image provider: ${String(providerId)}`);
		err.statusCode = 400;
		err.code = "UNKNOWN_IMAGE_GEN_PROVIDER";
		throw err;
	}
	const trimmed = assertValidImageGenKeyForWrite(key);
	const home = dir || resolveImageGenDir();
	if (!home || typeof home !== "string") {
		throw new Error("setImageGenKey requires a dir");
	}
	let keys = {};
	try {
		keys = readStoredKeys(home);
	} catch {
		keys = {};
	}
	/* eslint-disable-next-line security/detect-object-injection -- providerId is validated above */
	keys[providerId] = { key: trimmed, updatedAt: new Date().toISOString() };
	writeKeysFile(home, { keys });
	return { providerId, configured: true };
};

/***
 * MARK: clearImageGenKey
 * @description Removes one provider's stored key (the env override, when set,
 *   keeps the provider configured — reported honestly in the result).
 * @example clearImageGenKey({ providerId: 'muse', dir }) => ({ providerId: 'muse', configured: false })
 * @param {Object} [opts]
 * @param {string} [opts.providerId] - Registered provider id.
 * @param {string} [opts.dir] - Key store dir (defaults to resolveImageGenDir()).
 * @returns {{ providerId: string, configured: boolean }}
 ***/
export const clearImageGenKey = ({ providerId, dir } = {}) => {
	if (!isValidImageGenProviderId(providerId)) {
		const err = new Error(`Unknown image provider: ${String(providerId)}`);
		err.statusCode = 400;
		err.code = "UNKNOWN_IMAGE_GEN_PROVIDER";
		throw err;
	}
	const home = dir || resolveImageGenDir();
	if (!home || typeof home !== "string") {
		throw new Error("clearImageGenKey requires a dir");
	}
	let keys = {};
	try {
		keys = readStoredKeys(home);
	} catch {
		keys = {};
	}
	/* eslint-disable-next-line security/detect-object-injection -- providerId is validated above */
	delete keys[providerId];
	writeKeysFile(home, { keys });
	const { configured } = describeImageGenKey({ providerId, dir: home });
	return { providerId, configured };
};
