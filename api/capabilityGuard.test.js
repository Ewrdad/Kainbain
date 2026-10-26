import { describe, it, expect, vi } from "vitest";
// Seam-only import: both functions are pure and live in the crew domain
// module (re-exported by the crew barrel). Importing the app (./index.js)
// for them booted prepareProjects at import time, seeding sample projects
// into the LIVE projects/notes roots on every suite run (task 99eef182
// residue). Never import the app from a pure-seam suite; see
// api/docs/testing-with-temporary-roots.md.
import {
	hasSessionCapability,
	guardSessionCapability,
} from "./crew/sessionCapabilities.js";

/***
 * MARK: Capability Guard Unit Tests
 * @description Verifies the engine-side capability guard seam used by the
 *   optional harness-surface routes: dotted-path capability detection and the
 *   standardized `501 unsupported_by_harness` degradation payload.
 ***/

/***
 * MARK: mockReply
 * @description A Fastify-like reply double recording status/send calls.
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
		const session = { compact: async () => ({}) };
		expect(hasSessionCapability(session, "compact")).toBe(true);
	});

	it("resolves dotted paths through nested members", () => {
		const session = { sessionManager: { branch: () => {} } };
		expect(hasSessionCapability(session, "sessionManager.branch")).toBe(true);
	});

	it("returns false when the member is missing or not a function", () => {
		expect(hasSessionCapability({ compact: "yes" }, "compact")).toBe(false);
		expect(hasSessionCapability({}, "compact")).toBe(false);
		expect(hasSessionCapability({ compact: null }, "compact")).toBe(false);
	});

	it("returns false when an intermediate hop is missing or not an object", () => {
		expect(hasSessionCapability({}, "sessionManager.branch")).toBe(false);
		expect(hasSessionCapability({ sessionManager: null }, "sessionManager.branch")).toBe(
			false,
		);
		expect(hasSessionCapability({ sessionManager: 7 }, "sessionManager.branch")).toBe(
			false,
		);
	});

	it("returns false for a non-object session", () => {
		expect(hasSessionCapability(null, "compact")).toBe(false);
		expect(hasSessionCapability(undefined, "compact")).toBe(false);
		expect(hasSessionCapability("session", "compact")).toBe(false);
	});

	it("rejects prototype-chain hops so crafted paths can never resolve", () => {
		expect(hasSessionCapability({}, "__proto__")).toBe(false);
		expect(hasSessionCapability({}, "constructor")).toBe(false);
		expect(hasSessionCapability({}, "prototype")).toBe(false);
		expect(hasSessionCapability({ a: {} }, "a.__proto__.toString")).toBe(false);
		expect(hasSessionCapability({ a: {} }, "a.constructor")).toBe(false);
	});
});

describe("guardSessionCapability", () => {
	it("returns true and sends nothing when the capability is present", () => {
		const reply = mockReply();
		const session = { compact: async () => ({}) };

		expect(guardSessionCapability(reply, session, "compact", "Compaction")).toBe(
			true,
		);
		expect(reply.statusCode).toBeNull();
		expect(reply.body).toBeNull();
	});

	it("sends 501 unsupported_by_harness and returns false when missing", () => {
		const reply = mockReply();

		expect(guardSessionCapability(reply, {}, "compact", "Compaction")).toBe(false);
		expect(reply.statusCode).toBe(501);
		expect(reply.body).toEqual({
			error: "Compaction is not supported by the active harness",
			code: "unsupported_by_harness",
			capability: "compact",
		});
	});

	it("supports dotted capability paths in the payload", () => {
		const reply = mockReply();

		expect(
			guardSessionCapability(reply, {}, "sessionManager.branch", "Session forking"),
		).toBe(false);
		expect(reply.statusCode).toBe(501);
		expect(reply.body.capability).toBe("sessionManager.branch");
	});

	it("degrades non-object sessions to a 501", () => {
		const reply = mockReply();

		expect(guardSessionCapability(reply, null, "steer", "Steering")).toBe(false);
		expect(reply.statusCode).toBe(501);
		expect(reply.body).toEqual({
			error: "Steering is not supported by the active harness",
			code: "unsupported_by_harness",
			capability: "steer",
		});
	});
});
