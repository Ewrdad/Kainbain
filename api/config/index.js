/***
 * MARK: config
 * @description Central, environment-driven configuration for the KainBain API.
 *   The schema (`./schema.js`) is the source of truth: every tunable the API
 *   reads is declared there with its type, default, constraints, and docs.
 *   This module loads it once at import, failing fast on invalid values
 *   before the server listens, and serves the introspection endpoint.
 *
 *   Fail-fast policy: missing/empty -> default (silent); malformed value ->
 *   throw `CONFIG <VAR>: <reason> (got "<value>", want <constraint>)`;
 *   deprecated alias -> honor it, warn once with `CONFIG DEPRECATION`.
 *
 * @example import { config } from "./config/index.js"
 * @example config.port => 3100
 ***/

import {
	CONFIG_GROUPS,
	CONFIG_SCHEMA,
	ConfigError,
	loadConfig,
} from "./schema.js";

/***
 * MARK: loaded config
 * @description The validated active config. Loading runs at import so an
 *   invalid environment fails before Fastify listens. Deprecation warnings go
 *   to stderr via `console.warn`; the first malformed value throws.
 * @example config.agentTimeoutMs => 1800000
 ***/
const loaded = loadConfig(process.env);

export const config = loaded.config;
export const configSources = loaded.sources;
export const configWarnings = loaded.warnings;

export { CONFIG_GROUPS, CONFIG_SCHEMA, ConfigError, loadConfig };

/***
 * MARK: validateConfig
 * @description Validates an env-like object against the schema without touching
 *   the live config. Returns `{ config, warnings, sources }`, or throws the
 *   same `ConfigError` boot would throw. Warnings are collected, not printed.
 * @example validateConfig({ PORT: "3101" }).config.port => 3101
 * @param {Object} [env] - Env-like object (defaults to `process.env`).
 * @returns {{ config: Object, warnings: string[], sources: Object }}
 ***/
export function validateConfig(env = process.env) {
	return loadConfig(env, { onWarning: () => {} });
}

/***
 * MARK: redacted value
 * @description The placeholder shown for secret values in the introspection
 *   endpoint. Secrets are never returned, even when set via env.
 * @example REDACTED_VALUE => '[redacted]'
 ***/
export const REDACTED_VALUE = "[redacted]";

/***
 * MARK: getConfigSpec
 * @description Builds the introspection payload: one entry per schema variable
 *   with its active value, default, type, group, doc, and source
 *   (env|alias|default), plus the load warnings. Secret values set via env
 *   are returned as `[redacted]`, never the value.
 * @example getConfigSpec().entries.find((e) => e.env === "PORT").value => 3100
 * @param {Object} [overrides] - `{ config, sources, warnings }` (defaults to live).
 * @returns {{ entries: Object[], warnings: string[] }}
 ***/
export function getConfigSpec(overrides = {}) {
	const active = overrides.config || config;
	const sources = overrides.sources || configSources;
	const warnings = overrides.warnings || configWarnings;
	const entries = CONFIG_SCHEMA.map((entry) => {
		const value = active[entry.key];
		const source = sources[entry.key] || { var: entry.env, source: "default" };
		const isSecret = entry.secret === true;
		return {
			key: entry.key,
			env: entry.env,
			value: isSecret && source.source !== "default" ? REDACTED_VALUE : value,
			default: defaultForDocs(entry, active),
			type: entry.type,
			group: entry.group,
			doc: entry.doc,
			source: source.source,
			secret: isSecret,
		};
	});
	return { entries, warnings: [...warnings] };
}

/***
 * MARK: defaultForDocs
 * @description Resolves the display default for one schema entry: chained
 *   `{ ref }` defaults resolve against the active config, computed defaults
 *   evaluate fresh, array defaults copy.
 * @example defaultForDocs({ default: 1 }, {}) => 1
 ***/
function defaultForDocs(entry, active) {
	const fallback = entry.default;
	if (typeof fallback === "function") return fallback();
	if (fallback !== null && typeof fallback === "object" && fallback.ref) {
		return active[fallback.ref];
	}
	if (Array.isArray(fallback)) return [...fallback];
	return fallback;
}

export default config;
