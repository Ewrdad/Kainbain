import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRunnerClient, isTransientBackendError } from "./client.js";

/***
 * MARK: backend-outage tests
 * @description Regression suite for S4 (transient backend errors are
 *   non-fatal to the runner): the `isTransientBackendError` classifier
 *   boundary (GUIDE-04 section 3, flipped red — transient returns,
 *   stale-epoch/auth/unknown stay fatal) and the outage wire shapes
 *   through the real client call path (GUIDE-04 section 2 — 502 shape,
 *   dropped-socket shape, recovery).
 * @example run `node --test runner/client.backendOutage.test.js`
 ***/

function stubFetch(handler) {
	const calls = [];
	const fetchImpl = async (url, opts) => {
		calls.push({ url, opts });
		return handler(url, opts, calls);
	};
	return { fetchImpl, calls };
}

const ok = (data) => ({ ok: true, status: 200, json: async () => data });
const fail = (status, data) => ({ ok: false, status, json: async () => data });
// Proxy-restart shape: a gateway 502 usually carries an HTML body, so
// `res.json()` rejects and the client reports `{ statusCode: 502, code: null }`.
const failHtml = (status) => ({
	ok: false,
	status,
	json: async () => {
		throw new Error("Unexpected token '<'");
	},
});
const httpError = (status, code = null, message = `Backend ${status}`) =>
	Object.assign(new Error(message), { statusCode: status, code });
// Undici fetch-failure shape (observed on Node 24): `TypeError: fetch
// failed` with the system error nested under `cause`.
const socketError = (code, message = "fetch failed") =>
	Object.assign(new TypeError(message), { cause: Object.assign(new Error(code), { code }) });

describe("isTransientBackendError", () => {
	it("matches gateway outages with and without a backend code", () => {
		for (const status of [502, 503, 504]) {
			assert.equal(isTransientBackendError(httpError(status)), true, `status ${status}`);
			assert.equal(isTransientBackendError(httpError(status, "SOME_CODE")), true, `status ${status} + code`);
		}
		// A real backend shape: the integration queue answers 503 with a
		// semantic code when unavailable — still a gateway outage.
		assert.equal(isTransientBackendError(httpError(503, "NO_INTEGRATION_QUEUE")), true);
	});

	it("matches dropped-socket and network-layer failures by stable codes", () => {
		for (const code of [
			"ECONNREFUSED",
			"ECONNRESET",
			"ETIMEDOUT",
			"EAI_AGAIN",
			"ENOTFOUND",
			"EPIPE",
			"EHOSTUNREACH",
			"ENETUNREACH",
			"UND_ERR_SOCKET",
			"UND_ERR_CONNECT_TIMEOUT",
			"UND_ERR_HEADERS_TIMEOUT",
			"UND_ERR_BODY_TIMEOUT",
		]) {
			assert.equal(isTransientBackendError(socketError(code)), true, `cause ${code}`);
			assert.equal(
				isTransientBackendError(Object.assign(new Error(code), { code })),
				true,
				`direct ${code}`,
			);
		}
		// The system code may nest deeper than one cause level.
		const nested = new TypeError("fetch failed");
		nested.cause = new Error("outer");
		nested.cause.cause = Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" });
		assert.equal(isTransientBackendError(nested), true);
	});

	it("keeps STALE_EPOCH, auth failures, and other statuses fatal", () => {
		assert.equal(isTransientBackendError(httpError(409, "STALE_EPOCH", "Stale")), false);
		assert.equal(isTransientBackendError(httpError(401, "INVALID_CREDENTIAL", "Unknown credential")), false);
		assert.equal(isTransientBackendError(httpError(403, "RUNNER_REVOKED", "Revoked")), false);
		assert.equal(isTransientBackendError(httpError(429, "FLEET_CONCURRENCY_EXHAUSTED", "Busy")), false);
		// A 500 is a backend bug, not an outage: it stays loud.
		assert.equal(isTransientBackendError(httpError(500, null, "Backend 500")), false);
		assert.equal(isTransientBackendError(httpError(404, null, "Not found")), false);
	});

	it("keeps unknown and ambiguous errors fatal (never an inverted catch-all)", () => {
		assert.equal(isTransientBackendError(new Error("boom")), false);
		assert.equal(
			isTransientBackendError(Object.assign(new Error("cap"), { code: "WORKTREE_CAP_REACHED" })),
			false,
		);
		// Bare `fetch failed` with no recognized code (e.g. a
		// misconfigured backendUrl) stays loud — ambiguous failures
		// must not spin the loop forever.
		assert.equal(isTransientBackendError(new TypeError("fetch failed")), false);
		const unrecognized = new TypeError("fetch failed");
		unrecognized.cause = new Error("bad port");
		assert.equal(isTransientBackendError(unrecognized), false);
		assert.equal(isTransientBackendError(null), false);
		assert.equal(isTransientBackendError(undefined), false);
		assert.equal(isTransientBackendError("502"), false);
		assert.equal(isTransientBackendError(502), false);
	});
});

describe("backend outage shapes through the client", () => {
	it("a 502 surfaces as a transient error (json and proxy-html bodies)", async () => {
		for (const res of [fail(502, { error: "Bad Gateway", code: null }), failHtml(502)]) {
			const { fetchImpl } = stubFetch(() => res);
			const client = createRunnerClient({ backendUrl: "http://x:3100", fetchImpl });
			const err = await client.dispatchClaim({}).then(
				() => null,
				(e) => e,
			);
			assert.ok(err, "expected dispatchClaim to reject");
			assert.equal(err.statusCode, 502);
			assert.equal(isTransientBackendError(err), true);
		}
	});

	it("503 and 504 surface as transient errors", async () => {
		for (const status of [503, 504]) {
			const { fetchImpl } = stubFetch(() => fail(status, { error: "Down", code: null }));
			const client = createRunnerClient({ backendUrl: "http://x:3100", fetchImpl });
			const err = await client.heartbeat({ runnerId: "r1", facts: {} }).then(
				() => null,
				(e) => e,
			);
			assert.ok(err, `expected heartbeat to reject on ${status}`);
			assert.equal(isTransientBackendError(err), true);
		}
	});

	it("a dropped socket surfaces as a transient error", async () => {
		for (const code of ["ECONNREFUSED", "UND_ERR_SOCKET", "ECONNRESET"]) {
			const { fetchImpl } = stubFetch(async () => {
				throw socketError(code);
			});
			const client = createRunnerClient({ backendUrl: "http://x:3100", fetchImpl });
			const err = await client.dispatchClaim({}).then(
				() => null,
				(e) => e,
			);
			assert.ok(err, `expected dispatchClaim to reject on ${code}`);
			assert.equal(err.statusCode, undefined);
			assert.equal(isTransientBackendError(err), true);
		}
	});

	it("recovers after an outage: no wedged state once the backend answers", async () => {
		let n = 0;
		const { fetchImpl, calls } = stubFetch(async () => {
			n += 1;
			if (n === 1) return failHtml(502);
			if (n === 2) throw socketError("ECONNREFUSED");
			return ok({ assigned: false, code: "NO_CLAIMABLE_TASKS" });
		});
		const client = createRunnerClient({ backendUrl: "http://x:3100", fetchImpl });
		const first = await client.dispatchClaim({}).then(
			() => null,
			(e) => e,
		);
		assert.ok(first && isTransientBackendError(first));
		const second = await client.dispatchClaim({}).then(
			() => null,
			(e) => e,
		);
		assert.ok(second && isTransientBackendError(second));
		const third = await client.dispatchClaim({});
		assert.deepEqual(third, { assigned: false, code: "NO_CLAIMABLE_TASKS" });
		assert.equal(calls.length, 3);
	});
});
