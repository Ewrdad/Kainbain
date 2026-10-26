import { describe, it, expect } from "vitest";
import {
	hasSessionCapability,
	guardSessionCapability,
} from "./sessionCapabilities.js";

/***
 * MARK: sessionCapabilities sibling tests
 * @description Direct impl-level coverage of the crew capability seam:
 *   dotted-path detection, non-object sessions, prototype-chain rejection,
 *   and the Fastify `reply.status().send()` 501 guard contract. (The
 *   route-level behaviour is also exercised via api/index.js in
 *   api/capabilityGuard.test.js; this file pins the crew module itself.)
 ***/

function mockReply() {
	const reply = {
		statusCode: null,
		body: null,
		status(code) {
			reply.statusCode = code;
			return reply;
		},
		send(body) {
			reply.body = body;
			return reply;
		},
	};
	return reply;
}

describe("hasSessionCapability", () => {
	it("returns true when the capability is a function", () => {
		expect(hasSessionCapability({ compact: async () => ({}) }, "compact")).toBe(
			true,
		);
	});

	it("resolves nested dotted paths", () => {
		const session = { sessionManager: { branch: () => {} } };
		expect(hasSessionCapability(session, "sessionManager.branch")).toBe(true);
	});

	it("returns false for missing or non-function members", () => {
		expect(hasSessionCapability({}, "compact")).toBe(false);
		expect(hasSessionCapability({ compact: "yes" }, "compact")).toBe(false);
		expect(hasSessionCapability({ compact: null }, "compact")).toBe(false);
	});

	it("returns false when an intermediate hop is missing or not an object", () => {
		expect(hasSessionCapability({}, "sessionManager.branch")).toBe(false);
		expect(
			hasSessionCapability({ sessionManager: null }, "sessionManager.branch"),
		).toBe(false);
		expect(
			hasSessionCapability({ sessionManager: 7 }, "sessionManager.branch"),
		).toBe(false);
	});

	it("returns false for non-object sessions", () => {
		expect(hasSessionCapability(null, "compact")).toBe(false);
		expect(hasSessionCapability(undefined, "compact")).toBe(false);
		expect(hasSessionCapability("session", "compact")).toBe(false);
	});

	it("rejects prototype-chain hops", () => {
		expect(hasSessionCapability({}, "__proto__")).toBe(false);
		expect(hasSessionCapability({}, "constructor")).toBe(false);
		expect(hasSessionCapability({}, "prototype")).toBe(false);
		expect(hasSessionCapability({ a: {} }, "a.__proto__.x")).toBe(false);
		expect(hasSessionCapability({ a: {} }, "a.constructor")).toBe(false);
	});
});

describe("guardSessionCapability", () => {
	it("returns true and sends nothing when the capability is present", () => {
		const reply = mockReply();
		expect(
			guardSessionCapability(reply, { steer: () => {} }, "steer", "Steering"),
		).toBe(true);
		expect(reply.statusCode).toBeNull();
		expect(reply.body).toBeNull();
	});

	it("sends 501 unsupported_by_harness and returns false when missing", () => {
		const reply = mockReply();
		expect(guardSessionCapability(reply, {}, "compact", "Compaction")).toBe(
			false,
		);
		expect(reply.statusCode).toBe(501);
		expect(reply.body).toEqual({
			error: "Compaction is not supported by the active harness",
			code: "unsupported_by_harness",
			capability: "compact",
		});
	});

	it("carries dotted capability paths through to the payload", () => {
		const reply = mockReply();
		expect(
			guardSessionCapability(
				reply,
				{},
				"sessionManager.branch",
				"Session forking",
			),
		).toBe(false);
		expect(reply.statusCode).toBe(501);
		expect(reply.body.capability).toBe("sessionManager.branch");
	});

	it("degrades non-object sessions to a 501", () => {
		const reply = mockReply();
		expect(guardSessionCapability(reply, null, "steer", "Steering")).toBe(false);
		expect(reply.statusCode).toBe(501);
		expect(reply.body.code).toBe("unsupported_by_harness");
	});
});
