import { describe, it, expect } from "vitest";
import {
	KNOWN_API_KEY_SCOPES,
	isKnownApiKeyScope,
	sanitizeApiKeyScopes,
	impliedApiKeyScopes,
	effectiveApiKeyScopes,
	keyHasScope,
} from "./apiKeyScopes.js";

/***
 * MARK: apiKeyScopes tests
 * @description Locks the key scope vocabulary: known names, sanitising that
 *   drops unknown scopes, role-implied scopes mirroring the user catalogue,
 *   and the narrowing rule (an allowlist only subtracts, never widens).
 ***/

describe("apiKeyScopes vocabulary", () => {
	it("recognises the task and reserved scopes", () => {
		for (const scope of [
			"tasks:read",
			"tasks:create",
			"tasks:update",
			"tasks:delete",
			"status:read",
			"runs:control",
			"settings:write",
			"admin:users",
			"admin:keys",
		]) {
			expect(KNOWN_API_KEY_SCOPES).toContain(scope);
			expect(isKnownApiKeyScope(scope)).toBe(true);
		}
		expect(isKnownApiKeyScope("tasks:destroy")).toBe(false);
		expect(isKnownApiKeyScope(null)).toBe(false);
	});

	it("sanitises to known scopes, deduped in catalogue order", () => {
		expect(
			sanitizeApiKeyScopes([
				"tasks:delete",
				"nope",
				"tasks:create",
				"tasks:delete",
				null,
			]),
		).toEqual(["tasks:create", "tasks:delete"]);
		expect(sanitizeApiKeyScopes("tasks:create")).toEqual([]);
		expect(sanitizeApiKeyScopes(null)).toEqual([]);
	});

	it("implies member task writes and viewer reads from the role catalogue", () => {
		expect(impliedApiKeyScopes(["member"])).toEqual([
			"tasks:read",
			"tasks:create",
			"tasks:update",
			"tasks:delete",
			"status:read",
		]);
		expect(impliedApiKeyScopes(["viewer"])).toEqual([
			"tasks:read",
			"status:read",
		]);
		expect(impliedApiKeyScopes(["admin"])).toEqual([...KNOWN_API_KEY_SCOPES]);
		expect(impliedApiKeyScopes(["member", "viewer"])).toEqual(
			impliedApiKeyScopes(["member"]),
		);
		expect(impliedApiKeyScopes(["nope"])).toEqual([]);
		expect(impliedApiKeyScopes(null)).toEqual([]);
	});

	it("grants the full role when no allowlist is set", () => {
		expect(effectiveApiKeyScopes({ roles: ["member"] })).toEqual(
			impliedApiKeyScopes(["member"]),
		);
		expect(effectiveApiKeyScopes({ roles: ["member"], scopes: [] })).toEqual(
			impliedApiKeyScopes(["member"]),
		);
	});

	it("narrows to the overlap and never widens past the role", () => {
		expect(
			effectiveApiKeyScopes({ roles: ["member"], scopes: ["tasks:create"] }),
		).toEqual(["tasks:create"]);
		// A viewer allowlist naming a write scope still grants nothing: the
		// scope is dropped because the role never implied it.
		expect(
			effectiveApiKeyScopes({ roles: ["viewer"], scopes: ["tasks:create"] }),
		).toEqual([]);
		expect(
			effectiveApiKeyScopes({
				roles: ["viewer"],
				scopes: ["tasks:create", "tasks:read"],
			}),
		).toEqual(["tasks:read"]);
	});

	it("answers single-scope checks fail-closed", () => {
		expect(
			keyHasScope({ roles: ["member"], scopes: [], scope: "tasks:create" }),
		).toBe(true);
		expect(
			keyHasScope({ roles: ["viewer"], scopes: [], scope: "tasks:create" }),
		).toBe(false);
		expect(
			keyHasScope({
				roles: ["member"],
				scopes: ["tasks:read"],
				scope: "tasks:create",
			}),
		).toBe(false);
		expect(
			keyHasScope({ roles: ["member"], scopes: [], scope: "tasks:nope" }),
		).toBe(false);
		expect(keyHasScope({ roles: ["member"], scopes: [] })).toBe(false);
	});
});
