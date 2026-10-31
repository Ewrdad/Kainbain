import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	createStructuredEventSender,
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
});
