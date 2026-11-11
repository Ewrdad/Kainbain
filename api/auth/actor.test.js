import { describe, it, expect } from "vitest";
import { resolveRequestActor, actorLabel } from "./actor.js";

/***
 * MARK: actor tests
 * @description Locks request-actor resolution: API keys resolve to their
 *   key identity, sessions to their user, the off-mode request to the
 *   builtin, and guard misses to anonymous — with `api-key:<name>` labels
 *   for every key action.
 ***/

describe("resolveRequestActor", () => {
	it("resolves API-key requests to the key identity", () => {
		expect(
			resolveRequestActor({
				user: null,
				auth: {
					kind: "api-key",
					keyId: "k1",
					keyName: "scanner",
					roles: ["member"],
				},
			}),
		).toEqual({ kind: "api-key", id: "k1", name: "scanner", roles: ["member"] });
	});

	it("resolves signed-in users by name, email, then id", () => {
		const base = { auth: { enabled: true, kind: "user", roles: ["viewer"] } };
		expect(
			resolveRequestActor({ ...base, user: { id: "u1", name: "Ada" } }).name,
		).toBe("Ada");
		expect(
			resolveRequestActor({
				...base,
				user: { id: "u1", email: "ada@example.com" },
			}).name,
		).toBe("ada@example.com");
		expect(resolveRequestActor({ ...base, user: { id: "u1" } })).toMatchObject({
			kind: "user",
			id: "u1",
			name: "u1",
		});
	});

	it("resolves off-mode requests to the builtin admin", () => {
		expect(
			resolveRequestActor({
				user: { id: "admin", name: "admin", builtin: true },
				auth: { enabled: false, roles: ["admin"] },
			}),
		).toMatchObject({ kind: "builtin", id: "admin", name: "admin" });
	});

	it("resolves guard misses to anonymous", () => {
		expect(resolveRequestActor({ user: null, auth: { kind: "anonymous" } })).toEqual({
			kind: "anonymous",
			id: "",
			name: "anonymous",
			roles: [],
		});
		expect(resolveRequestActor({})).toMatchObject({ kind: "anonymous" });
		expect(resolveRequestActor()).toMatchObject({ kind: "anonymous" });
	});
});

describe("actorLabel", () => {
	it("flags keys by name and users by name", () => {
		expect(
			actorLabel({
				user: null,
				auth: { kind: "api-key", keyName: "scanner", roles: [] },
			}),
		).toBe("api-key:scanner");
		expect(
			actorLabel({
				user: { id: "u1", name: "Ada" },
				auth: { enabled: true, kind: "user", roles: [] },
			}),
		).toBe("Ada");
		expect(actorLabel({ user: null })).toBe("anonymous");
	});
});
