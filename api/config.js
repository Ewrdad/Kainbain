/***
 * MARK: config (shim)
 * @description Back-compat re-export: the configuration engine lives in
 *   `api/config/` (schema in `schema.js`, loader in `index.js`). This shim
 *   stays so existing `from "./config.js"` importers keep working untouched.
 *
 *   The schema is the source of truth for every tunable — see
 *   `api/config/schema.js`, the generated root `.env.example`, and
 *   `GET /status/config` (alias `GET /api/system/config-spec`).
 *
 * @example import { config } from "./config.js"
 ***/

export {
	config,
	configSources,
	configWarnings,
	CONFIG_GROUPS,
	CONFIG_SCHEMA,
	ConfigError,
	getConfigSpec,
	loadConfig,
	REDACTED_VALUE,
	validateConfig,
} from "./config/index.js";
export { default } from "./config/index.js";
