import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	createStructuredEventSender,
	describeSendError,
	isPermanentSendFailure,
	isVersionSkewFailure,
	MAX_BATCH_EVENTS,
	MAX_STRUCTURED_SEND_FAILURES,
	sanitizeStructuredEvent,
	textForStructuredEvent,
} from "./logEvents.js";

function stubClient({ failAfter = Infinity } = {}) {
	const calls = [];
	let sends = 0;
	const client = {
		async logEvents(payload) {
			sends += 1;
			calls.push(payload);
			if (sends > failAfter) {
				const err = new Error("Backend 404 on /log-events");
				err.statusCode = 404;
				throw err;
			}
			return { accepted: true, seq: payload.seq };
		},
	};
	return { client, calls };
}

const failingClient = ({ statusCode = 500, message = "boom", failTimes = Infinity } = {}) => {
	const calls = [];
	let sends = 0;
	const client = {
		async logEvents(payload) {
			sends += 1;
			calls.push(payload);
			if (sends <= failTimes) {
				const err = new Error(message);
				if (statusCode !== null) err.statusCode = statusCode;
				throw err;
			}
			return { accepted: true, seq: payload.seq };
		},
	};
	return { client, calls };
};

const ids = { taskId: "t1", projectId: "p1", executionId: "e1", epoch: 1 };

describe("sanitizeStructuredEvent", () => {
	it("passes clean events through and drops typeless ones", () => {
		assert.deepEqual(
			sanitizeStructuredEvent({ type: "assistant_delta", delta: "hi" }),
			{ type: "assistant_delta", delta: "hi" },
		);
		assert.equal(sanitizeStructuredEvent(null), null);
		assert.equal(sanitizeStructuredEvent({ noType: true }), null);
	});

	it("redacts secrets before transport", () => {
		const out = sanitizeStructuredEvent({
			type: "tool_started",
			toolName: "bash",
			args: { apiKey: "supersecretvalue" },
		});
		assert.equal(out.args.apiKey, "[REDACTED]");
		const text = sanitizeStructuredEvent({
			type: "harness_log",
			text: "Authorization: Bearer abcdefgh123456",
		});
		assert.equal(text.text, "Authorization: Bearer [REDACTED]");
	});

	it("truncates oversized payloads with a marker instead of dropping", () => {
		const out = sanitizeStructuredEvent(
			{ type: "tool_finished", toolName: "bash", result: `ok\n${"x".repeat(2000)}` },
			1500,
		);
		assert.ok(out);
		assert.match(out.result, /truncated for transport/);
	});

	it("truncates oversized object-shaped results instead of dropping the event", () => {
		const out = sanitizeStructuredEvent(
			{
				type: "tool_finished",
				toolName: "bash",
				result: { content: [{ text: `ok\n${"x".repeat(2000)}` }] },
			},
			1500,
		);
		assert.ok(out);
		assert.equal(out.toolName, "bash");
		assert.match(out.result.content[0].text, /truncated for transport/);
	});
});

describe("textForStructuredEvent", () => {
	it("derives legacy text only for the two pre-structured shapes", () => {
		assert.equal(
			textForStructuredEvent({ type: "assistant_delta", delta: "hi" }),
			"hi",
		);
		assert.equal(
			textForStructuredEvent({ type: "harness_log", text: "hello" }),
			"hello",
		);
		assert.equal(
			textForStructuredEvent({ type: "tool_started", toolName: "bash" }),
			null,
		);
		assert.equal(textForStructuredEvent(null), null);
	});
});

describe("createStructuredEventSender", () => {
	it("ships sequenced batches on close", async () => {
		const { client, calls } = stubClient();
		const sender = createStructuredEventSender({ client, ...ids, flushMs: 0 });
		sender.queueEvent({ type: "run_started" });
		sender.queueEvent({ type: "assistant_delta", delta: "hi" });
		await sender.close();
		assert.equal(calls.length, 1);
		assert.equal(calls[0].seq, 0);
		assert.equal(calls[0].events.length, 2);
		assert.equal(calls[0].executionId, "e1");
	});

	it("flushes immediately on run-closing events", async () => {
		const { client, calls } = stubClient();
		const sender = createStructuredEventSender({ client, ...ids, flushMs: 60000 });
		sender.queueEvent({ type: "assistant_delta", delta: "hi" });
		assert.equal(calls.length, 0);
		sender.queueEvent({ type: "run_finished" });
		await sender.flush();
		assert.equal(calls.length, 1);
		assert.equal(calls[0].events.length, 2);
	});

	it("falls back to text on send failure and converts the failed batch", async () => {
		const { client, calls } = stubClient({ failAfter: 0 });
		const fallback = [];
		const sender = createStructuredEventSender({
			client,
			...ids,
			flushMs: 0,
			onTextFallback: (text) => fallback.push(text),
		});
		sender.queueEvent({ type: "assistant_delta", delta: "hello" });
		sender.queueEvent({ type: "tool_started", toolName: "bash" });
		await sender.flush();
		assert.equal(sender.isStructured(), false);
		// The convertible event in the failed batch reaches the text path;
		// the tool event has no legacy text form.
		assert.deepEqual(fallback, ["hello"]);
		// Later events stay out of the structured path entirely.
		sender.queueEvent({ type: "assistant_delta", delta: "later" });
		await sender.flush();
		assert.equal(calls.length, 1);
		assert.deepEqual(fallback, ["hello"]);
	});

	it("redacts secrets in queued batches", async () => {
		const { client, calls } = stubClient();
		const sender = createStructuredEventSender({ client, ...ids, flushMs: 0 });
		sender.queueEvent({
			type: "tool_started",
			toolName: "bash",
			args: { password: "hunter2hunter" },
		});
		await sender.close();
		assert.equal(calls[0].events[0].args.password, "[REDACTED]");
	});

	it("close() drains events queued while a batch is in flight", async () => {
		// A controllable client: the first batch stays in flight until we
		// release it, so the tail event lands in `pending` mid-send.
		const calls = [];
		let releaseFirst;
		const firstGate = new Promise((resolve) => {
			releaseFirst = resolve;
		});
		let sends = 0;
		const client = {
			async logEvents(payload) {
				sends += 1;
				calls.push(payload);
				if (sends === 1) await firstGate;
				return { accepted: true, seq: payload.seq };
			},
		};
		const sender = createStructuredEventSender({
			client,
			...ids,
			batchSize: 2,
			flushMs: 60000, // timer must not fire during the test
		});
		sender.queueEvent({ type: "assistant_delta", delta: "one" });
		sender.queueEvent({ type: "assistant_delta", delta: "two" }); // batch 0 ships, in flight
		sender.queueEvent({ type: "run_finished" }); // queued while batch 0 is in flight
		const closed = sender.close();
		// close() must not resolve while the tail event is still unsent.
		let resolvedEarly = false;
		closed.then(() => {
			resolvedEarly = true;
		});
		await new Promise((r) => setTimeout(r, 25));
		assert.equal(resolvedEarly, false);
		assert.equal(calls.length, 1);
		releaseFirst();
		await closed;
		// Both batches shipped before close() resolved, in order.
		assert.equal(calls.length, 2);
		assert.deepEqual(
			calls.map((c) => c.seq),
			[0, 1],
		);
		assert.deepEqual(
			calls[1].events.map((e) => e.type),
			["run_finished"],
		);
	});

	it("flushes pending events even when the closing event is too big to send", async () => {
		const { client, calls } = stubClient();
		const sender = createStructuredEventSender({ client, ...ids, flushMs: 60000 });
		sender.queueEvent({ type: "assistant_delta", delta: "hi" });
		assert.equal(calls.length, 0);
		// 100 untruncatable-named fields stay over the cap after truncation,
		// so the closing event itself is dropped — but the queued tail must
		// still ship immediately, not wait for the timer.
		const bulk = {};
		for (let i = 0; i < 100; i += 1) bulk[`field${i}`] = "x".repeat(2000);
		sender.queueEvent({ type: "run_finished", ...bulk });
		await new Promise((r) => setTimeout(r, 25));
		assert.equal(calls.length, 1);
		assert.deepEqual(
			calls[0].events.map((e) => e.type),
			["assistant_delta"],
		);
	});

	it("names an unknown send failure instead of logging undefined", async () => {
		const warnings = [];
		const client = {
			async logEvents() {
				throw undefined;
			},
		};
		const sender = createStructuredEventSender({
			client,
			...ids,
			flushMs: 0,
			logger: { warn: (message) => warnings.push(message) },
			onTextFallback: () => {},
		});
		sender.queueEvent({ type: "assistant_delta", delta: "hi" });
		// A status-less throw is transient: the sender retries until the
		// bound, then falls back.
		for (let i = 0; i < MAX_STRUCTURED_SEND_FAILURES; i += 1) {
			await sender.flush();
		}
		assert.equal(sender.isStructured(), false);
		assert.ok(warnings.length >= 1);
		assert.match(warnings.at(-1), /unknown error/);
		for (const warning of warnings) assert.doesNotMatch(warning, /undefined/);
	});

	it("fallback converts events queued during the failed batch too", async () => {
		const { client } = stubClient({ failAfter: 0 });
		const fallback = [];
		const sender = createStructuredEventSender({
			client,
			...ids,
			batchSize: 2,
			flushMs: 60000,
			onTextFallback: (text) => fallback.push(text),
		});
		sender.queueEvent({ type: "assistant_delta", delta: "one" });
		sender.queueEvent({ type: "assistant_delta", delta: "two" }); // batch 0 ships and fails
		sender.queueEvent({ type: "harness_log", text: "three" }); // still pending at failure
		await sender.flush();
		assert.equal(sender.isStructured(), false);
		// Nothing that was queued may vanish during the transition: every
		// convertible event — failed batch AND pending queue — reaches text.
		assert.deepEqual(fallback, ["one", "two", "three"]);
	});

	it("retries transient failures with the same seq and recovers in order", async () => {
		const { client, calls } = failingClient({ statusCode: 500, failTimes: 2 });
		const fallback = [];
		const sender = createStructuredEventSender({
			client,
			...ids,
			flushMs: 0,
			onTextFallback: (text) => fallback.push(text),
		});
		sender.queueEvent({ type: "assistant_delta", delta: "one" });
		sender.queueEvent({ type: "assistant_delta", delta: "two" });
		await sender.flush(); // attempt 1: 500, requeued
		assert.equal(sender.isStructured(), true);
		assert.deepEqual(fallback, []);
		await sender.flush(); // attempt 2: 500, requeued
		assert.equal(sender.isStructured(), true);
		await sender.flush(); // attempt 3: accepted
		assert.equal(sender.isStructured(), true);
		assert.deepEqual(fallback, []);
		// All three attempts carried seq 0 (the server dedupes a retry of
		// a batch that actually landed); the next batch moves to seq 1.
		assert.deepEqual(
			calls.map((c) => c.seq),
			[0, 0, 0],
		);
		assert.deepEqual(
			calls[2].events.map((e) => e.delta),
			["one", "two"],
		);
		sender.queueEvent({ type: "run_finished" });
		await sender.flush();
		assert.equal(calls[3].seq, 1);
	});

	it("resets the failure count on success, so a later outage gets a fresh bound", async () => {
		// Scripted backend: fail, fail, recover, then stay down. Without a
		// reset the sender would flip on the 3rd post-recovery failure;
		// with it, the fresh outage gets the full bound of 5.
		const script = [false, false, true, false, false, false, false, false];
		const calls = [];
		let sends = 0;
		const client = {
			async logEvents(payload) {
				calls.push(payload);
				const ok = script[sends] ?? false;
				sends += 1;
				if (!ok) {
					throw Object.assign(new Error("still down"), { statusCode: 503 });
				}
				return { accepted: true, seq: payload.seq };
			},
		};
		const sender = createStructuredEventSender({ client, ...ids, flushMs: 0 });
		sender.queueEvent({ type: "assistant_delta", delta: "one" });
		await sender.flush(); // fail 1
		await sender.flush(); // fail 2
		await sender.flush(); // success — counter resets
		assert.equal(sender.isStructured(), true);
		sender.queueEvent({ type: "assistant_delta", delta: "two" });
		for (let i = 0; i < MAX_STRUCTURED_SEND_FAILURES - 1; i += 1) {
			await sender.flush();
			assert.equal(sender.isStructured(), true);
		}
		await sender.flush();
		assert.equal(sender.isStructured(), false);
		assert.equal(calls.length, 3 + MAX_STRUCTURED_SEND_FAILURES);
	});

	it("chunks large queues to batchSize and never above the server cap", async () => {
		const { client, calls } = stubClient();
		const sender = createStructuredEventSender({
			client,
			...ids,
			batchSize: 10,
			flushMs: 0,
		});
		for (let i = 0; i < 25; i += 1) {
			sender.queueEvent({ type: "assistant_delta", delta: `line${i}` });
		}
		await sender.close();
		assert.deepEqual(
			calls.map((c) => c.events.length),
			[10, 10, 5],
		);
		assert.deepEqual(
			calls.map((c) => c.seq),
			[0, 1, 2],
		);
		assert.equal(
			calls.flatMap((c) => c.events).map((e) => e.delta).join(","),
			Array.from({ length: 25 }, (_, i) => `line${i}`).join(","),
		);
	});

	it("clamps even a huge batchSize to the server's per-batch cap", async () => {
		assert.equal(MAX_BATCH_EVENTS, 200);
		const { client, calls } = stubClient();
		const sender = createStructuredEventSender({
			client,
			...ids,
			batchSize: 500,
			flushMs: 60000,
		});
		for (let i = 0; i < 250; i += 1) {
			sender.queueEvent({ type: "assistant_delta", delta: `line${i}` });
		}
		await sender.close();
		assert.deepEqual(
			calls.map((c) => c.events.length),
			[200, 50],
		);
	});

	it("falls back immediately on a refused batch, with a visible marker", async () => {
		const { client, calls } = failingClient({ statusCode: 400 });
		const fallback = [];
		const sender = createStructuredEventSender({
			client,
			...ids,
			flushMs: 0,
			onTextFallback: (text) => fallback.push(text),
		});
		sender.queueEvent({ type: "assistant_delta", delta: "hello" });
		await sender.flush();
		assert.equal(sender.isStructured(), false);
		assert.equal(calls.length, 1);
		assert.equal(fallback.length, 2);
		assert.match(fallback[0], /structured log transport failed/);
		assert.match(fallback[0], /HTTP 400/);
		assert.equal(fallback[1], "hello");
	});

	it("degrades silently on version skew but marks unexpected outages", async () => {
		// 404 (old backend): the coarse text view IS the contract — no marker.
		const skewed = stubClient({ failAfter: 0 });
		const skewFallback = [];
		const skewSender = createStructuredEventSender({
			client: skewed.client,
			...ids,
			flushMs: 0,
			onTextFallback: (text) => skewFallback.push(text),
		});
		skewSender.queueEvent({ type: "assistant_delta", delta: "hello" });
		await skewSender.flush();
		assert.deepEqual(skewFallback, ["hello"]);
		// 500 past the bound: the reader must know the view is degraded.
		const { client } = failingClient({ statusCode: 500 });
		const outageFallback = [];
		const outageSender = createStructuredEventSender({
			client,
			...ids,
			flushMs: 0,
			onTextFallback: (text) => outageFallback.push(text),
		});
		outageSender.queueEvent({ type: "assistant_delta", delta: "hello" });
		await outageSender.close();
		assert.equal(outageSender.isStructured(), false);
		assert.match(outageFallback[0], /structured log transport failed/);
		assert.match(outageFallback[0], /HTTP 500/);
		assert.equal(outageFallback[1], "hello");
	});

	it("close() drains after a transient failure once the backend recovers", async () => {
		const { client, calls } = failingClient({ statusCode: 502, failTimes: 1 });
		const sender = createStructuredEventSender({ client, ...ids, flushMs: 0 });
		sender.queueEvent({ type: "assistant_delta", delta: "one" });
		sender.queueEvent({ type: "run_finished" });
		await sender.close();
		assert.equal(sender.isStructured(), true);
		assert.equal(calls.length, 2);
		assert.deepEqual(
			calls.map((c) => c.seq),
			[0, 0],
		);
		assert.deepEqual(
			calls[1].events.map((e) => e.type),
			["assistant_delta", "run_finished"],
		);
	});

	it("close() terminates by falling back when the backend stays down", async () => {
		const { client, calls } = failingClient({ statusCode: 500 });
		const fallback = [];
		const sender = createStructuredEventSender({
			client,
			...ids,
			flushMs: 0,
			onTextFallback: (text) => fallback.push(text),
		});
		sender.queueEvent({ type: "assistant_delta", delta: "tail" });
		await sender.close();
		assert.equal(sender.isStructured(), false);
		assert.equal(calls.length, MAX_STRUCTURED_SEND_FAILURES);
		// The tail attempts text delivery (marker first) instead of
		// vanishing silently.
		assert.match(fallback[0], /showing text only/);
		assert.equal(fallback[1], "tail");
	});
});

describe("send failure classification", () => {
	it("names version skew, permanent, and transient failures", () => {
		const skew = Object.assign(new Error("no route"), { statusCode: 404 });
		assert.equal(isVersionSkewFailure(skew), true);
		assert.equal(isVersionSkewFailure(new Error("fetch failed")), false);
		assert.equal(
			isPermanentSendFailure(Object.assign(new Error("bad"), { statusCode: 400 })),
			true,
		);
		assert.equal(isPermanentSendFailure(skew), true);
		assert.equal(
			isPermanentSendFailure(Object.assign(new Error("bad"), { statusCode: 500 })),
			false,
		);
		assert.equal(isPermanentSendFailure(new Error("fetch failed")), false);
		assert.equal(isPermanentSendFailure(undefined), false);
	});

	it("describes failures with status and never renders undefined", () => {
		assert.equal(
			describeSendError(Object.assign(new Error("nope"), { statusCode: 500 })),
			"HTTP 500 nope",
		);
		assert.equal(describeSendError(new Error("fetch failed")), "fetch failed");
		assert.equal(describeSendError(undefined), "unknown error");
		assert.equal(describeSendError(null), "unknown error");
	});
});
