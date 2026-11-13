// Role: access config — merging boot-time env knobs with settings-page overrides.
// Domain: Access — organisation-level user control (OIDC + RBAC, togglable).

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { throwIfLiveEnginePathUnderTest } from "../flow/resolveStatePath.js";
import { _atomicWriteFileSync } from "../house/fileWriting.js";
import { sanitizeRoles } from "./roles.js";

/***
 * MARK: AUTH_STATE_DIRNAME
 * @description Folder (under the engine state dir) holding the auth state
 *   files. Overridable per test or per install via `authStatePath`.
 * @example AUTH_STATE_DIRNAME => 'auth'
 ***/
export const AUTH_STATE_DIRNAME = "auth";

/***
 * MARK: ACCESS_OVERRIDES_FILENAME
 * @description Runtime settings-page overrides live in this JSON file, so a
 *   restart never loses what an admin changed in the UI.
 * @example ACCESS_OVERRIDES_FILENAME => 'access.json'
 ***/
export const ACCESS_OVERRIDES_FILENAME = "access.json";

/***
 * MARK: RUNTIME_OVERRIDE_KEYS
 * @description Auth knobs the settings page may override at runtime. Each
 *   key maps to its schema `config` key; when the overrides file names one,
 *   it wins over the boot-time env value.
 * @example RUNTIME_OVERRIDE_KEYS => ['authEnabled', 'authIssuerUrl', ...]
 ***/
export const RUNTIME_OVERRIDE_KEYS = [
	"authEnabled",
	"apiKeysEnabled",
	"authIssuerUrl",
	"authClientId",
	"authClientSecret",
	"authRedirectUri",
	"authScopes",
	"authGroupsClaim",
	"authAdminGroup",
	"authBootstrapAdmins",
	"authSessionTtlMs",
	"authSessionIdleMs",
	"authCookieName",
	"authRoleManagerRoles",
];

/***
 * MARK: resolveAuthStateDir
 * @description Picks the directory holding the auth state files: explicit
 *   test path first, then the configured override, then the engine default.
 *
 *   Shares the 2026-11 test-pollution guard (cause N5): while `VITEST`
 *   is set, resolving a dir at or under the LIVE `~/.kainbain/engine/`
 *   THROWS (via `throwIfLiveEnginePathUnderTest`), so a suite that
 *   forgets its temp auth dir fails loudly instead of writing
 *   users/sessions/overrides into production. The standard setup
 *   (`testSetup.isolation.js`) pins `KAINBAIN_AUTH_STATE_PATH` at a temp
 *   dir for every suite; per-file suites pass `explicitDir`.
 *   Production (`VITEST` unset) resolves byte-identically to before.
 * @example resolveAuthStateDir({ configuredDir: '/tmp/x' }) => '/tmp/x'
 * @param {Object} [args] - Labelled inputs.
 * @param {string} [args.explicitDir] - Test-only directory (wins).
 * @param {string} [args.configuredDir] - Deploy-time override directory.
 * @returns {string} Directory for auth state files.
 ***/
export const resolveAuthStateDir = ({ explicitDir, configuredDir } = {}) => {
	let dir;
	if (typeof explicitDir === "string" && explicitDir.trim() !== "") {
		dir = explicitDir;
	} else if (
		typeof configuredDir === "string" &&
		configuredDir.trim() !== ""
	) {
		dir = configuredDir;
	} else {
		dir = path.join(os.homedir(), ".kainbain", "engine", AUTH_STATE_DIRNAME);
	}
	throwIfLiveEnginePathUnderTest({
		candidatePath: dir,
		callerName: "resolveAuthStateDir",
	});
	return dir;
};

/***
 * MARK: accessOverridesPath
 * @description Absolute path of the runtime overrides file for a state dir.
 * @example accessOverridesPath('/tmp/x') => '/tmp/x/access.json'
 * @param {string} stateDir - Auth state directory.
 * @returns {string} Path of `access.json` inside it.
 ***/
export const accessOverridesPath = (stateDir) =>
	path.join(stateDir, ACCESS_OVERRIDES_FILENAME);

/***
 * MARK: readAccessOverrides
 * @description Reads the runtime overrides file. Missing or corrupt files
 *   read as empty (fail safe to boot-time env values, never crash boot).
 * @example readAccessOverrides('/tmp/empty-dir') => {}
 * @param {string} stateDir - Auth state directory.
 * @returns {Object} Stored overrides (possibly empty).
 ***/
export const readAccessOverrides = (stateDir) => {
	let parsed = null;
	try {
		/* eslint-disable-next-line security/detect-non-literal-fs-filename -- path built by accessOverridesPath from the resolved state dir */
		const raw = fs.readFileSync(accessOverridesPath(stateDir), "utf8");
		parsed = JSON.parse(raw);
	} catch {
		return {};
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
	return parsed;
};

/***
 * MARK: sanitizeGroupRoleMappings
 * @description Keeps only well-formed group→role mappings: string group
 *   names to non-empty known-role lists. Stale or mistyped rows are dropped.
 * @example sanitizeGroupRoleMappings({ team: ['member', 'nope'] }) => { team: ['member'] }
 * @param {*} value - Candidate mappings (anything; garbage yields {}).
 * @returns {Object} Clean `{ [group]: [role] }` map.
 ***/
export const sanitizeGroupRoleMappings = (value) => {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const cleaned = {};
	for (const [group, roles] of Object.entries(value)) {
		if (typeof group !== "string" || group.trim() === "") continue;
		const kept = sanitizeRoles(roles);
		if (kept.length === 0) continue;
		// eslint-disable-next-line security/detect-object-injection -- group is an IdP-side name validated to a non-empty string above
		cleaned[group] = kept;
	}
	return cleaned;
};

/***
 * MARK: toPositiveInt
 * @description Reads a millisecond knob, falling back when it is missing or
 *   not a positive number. Non-finite input never becomes a timeout.
 * @example toPositiveInt('60000', 30) => 60000
 * @param {*} value - Candidate value.
 * @param {number} fallback - Value used when the candidate is unusable.
 * @returns {number} A positive integer or the fallback.
 ***/
export const toPositiveInt = (value, fallback) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0
		? Math.floor(parsed)
		: fallback;
};

/***
 * MARK: resolveAuthConfig
 * @description Merges boot-time schema config with the settings-page
 *   overrides file into one effective auth config. Precedence per knob is
 *   runtime override > env value > schema default; role lists are
 *   sanitised so stale names never grant access.
 * @example resolveAuthConfig({ schemaConfig: { authEnabled: false }, stateDir: '/tmp/x' }).enabled => false
 * @param {Object} args - Labelled inputs.
 * @param {Object} [args.schemaConfig] - Validated schema config object.
 * @param {string} [args.stateDir] - Auth state directory.
 * @returns {Object} Effective auth config (enabled, apiKeysEnabled, issuerUrl, ..., groupRoleMappings, roleManagerRoles).
 ***/
export const resolveAuthConfig = ({ schemaConfig = {}, stateDir } = {}) => {
	const overrides = readAccessOverrides(stateDir);
	const pick = (key) =>
		Object.hasOwn(overrides, key) && overrides[key] !== undefined
			? overrides[key]
			: schemaConfig[key];
	const asStringList = (value) =>
		Array.isArray(value)
			? value.filter((entry) => typeof entry === "string" && entry !== "")
			: [];
	// An empty manager list would open role administration to every signed-in
	// user, so it fails safe back to admin-only.
	const keptManagers = sanitizeRoles(pick("authRoleManagerRoles"));
	// The public base is boot-time only (it shapes the registered OIDC
	// callback URL); settings-page overrides never move it.
	const publicKbUrl =
		typeof schemaConfig.publicKbUrl === "string" &&
		schemaConfig.publicKbUrl !== ""
			? schemaConfig.publicKbUrl
			: "http://localhost:3100";
	return {
		publicKbUrl,
		enabled: pick("authEnabled") === true,
		apiKeysEnabled: pick("apiKeysEnabled") === true,
		issuerUrl:
			typeof pick("authIssuerUrl") === "string" ? pick("authIssuerUrl") : "",
		clientId:
			typeof pick("authClientId") === "string" ? pick("authClientId") : "",
		clientSecret:
			typeof pick("authClientSecret") === "string"
				? pick("authClientSecret")
				: "",
		redirectUri:
			typeof pick("authRedirectUri") === "string"
				? pick("authRedirectUri")
				: "",
		scopes:
			typeof pick("authScopes") === "string" && pick("authScopes").trim() !== ""
				? pick("authScopes")
				: "openid profile email",
		groupsClaim:
			typeof pick("authGroupsClaim") === "string" &&
			pick("authGroupsClaim") !== ""
				? pick("authGroupsClaim")
				: "groups",
		adminGroup:
			typeof pick("authAdminGroup") === "string" ? pick("authAdminGroup") : "",
		bootstrapAdmins: asStringList(pick("authBootstrapAdmins")),
		sessionTtlMs: toPositiveInt(
			pick("authSessionTtlMs"),
			12 * 60 * 60 * 1000,
		),
		sessionIdleMs: toPositiveInt(pick("authSessionIdleMs"), 30 * 60 * 1000),
		cookieName:
			typeof pick("authCookieName") === "string" &&
			pick("authCookieName") !== ""
				? pick("authCookieName")
				: "kb_session",
		roleManagerRoles: keptManagers.length > 0 ? keptManagers : ["admin"],
		groupRoleMappings: sanitizeGroupRoleMappings(overrides.groupRoleMappings),
	};
};

/***
 * MARK: writeAccessOverrides
 * @description Persists one settings-page change to `access.json`: only
 *   known override keys survive, values are lightly normalised, and the
 *   write is atomic so a crash cannot leave half a file.
 * @example writeAccessOverrides({ stateDir: '/tmp/x', partial: { authEnabled: true } }).authEnabled => true
 * @param {Object} args - Labelled inputs.
 * @param {string} args.stateDir - Auth state directory.
 * @param {Object} args.partial - Override keys to store.
 * @returns {Object} Full stored overrides after the write.
 ***/
export const writeAccessOverrides = ({ stateDir, partial } = {}) => {
	if (typeof stateDir !== "string" || stateDir === "") {
		throw new Error("writeAccessOverrides needs a stateDir");
	}
	const current = readAccessOverrides(stateDir);
	const next = { ...current };
	for (const key of RUNTIME_OVERRIDE_KEYS) {
		if (!Object.hasOwn(partial || {}, key)) continue;
		if (key === "authRoleManagerRoles") {
			// eslint-disable-next-line security/detect-object-injection -- key comes from the RUNTIME_OVERRIDE_KEYS allowlist above
			next[key] = sanitizeRoles(partial[key]);
			continue;
		}
		// eslint-disable-next-line security/detect-object-injection -- key comes from the RUNTIME_OVERRIDE_KEYS allowlist above
		next[key] = partial[key];
	}
	if (Object.hasOwn(partial || {}, "groupRoleMappings")) {
		next.groupRoleMappings = sanitizeGroupRoleMappings(
			partial.groupRoleMappings,
		);
	}
	if (!fs.existsSync(stateDir)) {
		/* eslint-disable-next-line security/detect-non-literal-fs-filename -- state dir resolved by resolveAuthStateDir */
		fs.mkdirSync(stateDir, { recursive: true });
	}
	_atomicWriteFileSync(
		accessOverridesPath(stateDir),
		`${JSON.stringify(next, null, 2)}\n`,
	);
	return next;
};

/***
 * MARK: createAccessConfig
 * @description Builds the live access-config reader/writer bound to one
 *   state dir and one schema config. Call sites read through `get()` so a
 *   settings-page save applies without a restart.
 * @example createAccessConfig({ schemaConfig: {}, stateDir: '/tmp/x' }).get().enabled => false
 * @param {Object} args - Labelled inputs.
 * @param {Object} [args.schemaConfig] - Validated schema config object.
 * @param {string} [args.stateDir] - Auth state directory.
 * @returns {{ get: Function, save: Function, stateDir: string }} Live access config handle.
 ***/
export const createAccessConfig = ({ schemaConfig = {}, stateDir } = {}) => {
	const dir = resolveAuthStateDir({ configuredDir: stateDir });
	return {
		stateDir: dir,
		get: () => resolveAuthConfig({ schemaConfig, stateDir: dir }),
		save: (partial) => writeAccessOverrides({ stateDir: dir, partial }),
	};
};
