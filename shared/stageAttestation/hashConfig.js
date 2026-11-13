import { createHash } from "node:crypto";
import { canonicalize } from "./canonicalize.js";

/***
 * MARK: hashConfig
 * @description Hashes a plain-JSON config object to a self-identifying
 *   `sha256:<hex>` digest over its canonical bytes. Strict like
 *   `canonicalize`: non-plain-JSON input throws (fail loud at the boundary).
 *   Producers that must never break stage execution hash through
 *   `hashStageConfig`, which sanitizes first and returns null instead.
 *   Backend + Runner only — the `node:crypto` import never loads in the
 *   browser, so frontend code must not import this module.
 * @example hashConfig({ a: 1 }) => 'sha256:015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862'
 * @param {*} obj - Plain-JSON object to hash.
 * @returns {string} `sha256:` plus 64 lowercase hex characters.
 ***/
export function hashConfig(obj) {
	const bytes = canonicalize(obj);
	return `sha256:${createHash("sha256").update(bytes, "utf8").digest("hex")}`;
}
