import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OpencodeSessionWrapper } from "./OpencodeSessionWrapper.js";

/**
 * MARK: OpencodeSessionWrapper unit tests
 * @description Focused unit tests for the session wrapper's pure behaviors
 *   that the mock-server contract tests exercise only indirectly: session
 *   scoping of raw events, the model reference normalization, sticky model
 *   overrides, and transcript bookkeeping.
 */

function makeWrapper(overrides = {}) {
	return new OpencodeSessionWrapper({
		client: {
			session: {
				prompt: vi.fn(async () => ({ data: { info: { id: "a1" } } })),
				messages: vi.fn(async () => ({ data: [] })),
			},
		},
		sessionId: "ses-1",
		cwd: "/tmp/wrapper-test",
		// Unit-test clients have no SSE stream, so the idle signal never
		// fires: keep the prompt-settling wait instant.
		idleSignalTimeoutMs: 10,
		...overrides,
	});
}

describe("OpencodeSessionWrapper — harness identity", () => {
	it("tags the opencode harness identity for reliability attribution", () => {
		const wrapper = makeWrapper();
		expect(wrapper.harnessId).toBe("opencode");
		expect(wrapper.harnessName).toBe("opencode");
	});
});

describe("OpencodeSessionWrapper — session scoping", () => {
	it("ignores events belonging to other sessions", () => {
		const wrapper = makeWrapper();
		const seen = [];
		wrapper.subscribe((e) => seen.push(e));

		wrapper.handleRawEvent({
			type: "session.idle",
			properties: { sessionID: "ses-OTHER" },
		});
		wrapper.handleRawEvent({
			type: "message.part.updated",
			properties: {
				sessionID: "ses-OTHER",
				part: { id: "p", type: "text", text: "x" },
				delta: "x",
			},
		});

		expect(seen).toEqual([]);
	});

	it("dispatches translated events for its own session", () => {
		const wrapper = makeWrapper();
		const seen = [];
		wrapper.subscribe((e) => seen.push(e));

		wrapper.handleRawEvent({
			type: "session.status",
			properties: { sessionID: "ses-1", status: { type: "busy" } },
		});

		expect(seen).toEqual([{ type: "run_started" }]);
	});

	it("never emits a raw event name even from a malformed translation", () => {
		const wrapper = makeWrapper();
		const seen = [];
		wrapper.subscribe((e) => seen.push(e));

		wrapper.handleRawEvent({ type: "totally.unknown", properties: {} });
		wrapper.handleRawEvent({ type: "session.idle", properties: { sessionID: "ses-1" } });

		expect(seen.map((e) => e.type)).toEqual(["run_finished"]);
	});

	it("stops dispatching after dispose", async () => {
		const wrapper = makeWrapper();
		const seen = [];
		wrapper.subscribe((e) => seen.push(e));
		await wrapper.dispose();

		wrapper.handleRawEvent({
			type: "session.idle",
			properties: { sessionID: "ses-1" },
		});

		expect(seen).toEqual([]);
	});
});

describe("OpencodeSessionWrapper — model references", () => {
	it("normalizes engine, server and composite-key shapes", () => {
		const wrapper = makeWrapper();
		expect(wrapper.toServerModel({ provider: "p", id: "m" })).toEqual({
			providerID: "p",
			modelID: "m",
		});
		expect(wrapper.toServerModel({ providerID: "p", modelID: "m" })).toEqual({
			providerID: "p",
			modelID: "m",
		});
		expect(wrapper.toServerModel("p::m")).toEqual({ providerID: "p", modelID: "m" });
		expect(wrapper.toServerModel("bare")).toBeNull();
		expect(wrapper.toServerModel(null)).toBeNull();
	});

	it("keeps the model override sticky across prompts", async () => {
		const prompt = vi.fn(async () => ({ data: { info: { id: "a1" } } }));
		const wrapper = makeWrapper({
			client: { session: { prompt, messages: async () => ({ data: [] }) } },
		});

		await wrapper.switchModel({ provider: "p", id: "m1" });
		await wrapper.prompt("one");
		await wrapper.prompt("two");

		const bodies = prompt.mock.calls.map((c) => c[0].body);
		expect(bodies[0].model).toEqual({ providerID: "p", modelID: "m1" });
		expect(bodies[1].model).toEqual({ providerID: "p", modelID: "m1" });
	});

	it("omits the model field entirely when no override is active", async () => {
		const prompt = vi.fn(async () => ({ data: { info: { id: "a1" } } }));
		const wrapper = makeWrapper({
			client: { session: { prompt, messages: async () => ({ data: [] }) } },
		});

		await wrapper.prompt("no model");

		expect(prompt.mock.calls[0][0].body.model).toBeUndefined();
	});
});

describe("OpencodeSessionWrapper — prompt", () => {
	it("dispatches run_error and rethrows when the server rejects the prompt", async () => {
		const wrapper = makeWrapper({
			client: {
				session: {
					prompt: async () => {
						throw new Error("boom");
					},
					messages: async () => ({ data: [] }),
				},
			},
		});
		const seen = [];
		wrapper.subscribe((e) => seen.push(e));

		await expect(wrapper.prompt("fails")).rejects.toThrow("boom");
		expect(seen).toEqual([
			{ type: "run_error", error: { message: "boom" } },
		]);
		expect(wrapper.isStreaming).toBe(false);
	});

	it("writes the user and assistant turns to the transcript", async () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-wrapper-"));
		try {
			const wrapper = makeWrapper({
				cwd,
				client: {
					session: {
						prompt: async () => ({ data: { info: { id: "a1" } } }),
						messages: async () => ({
							data: [
								{
									info: { id: "u1", role: "user" },
									parts: [{ type: "text", text: "hello" }],
								},
								{
									info: { id: "a1", role: "assistant" },
									parts: [{ type: "text", text: "hi there" }],
								},
							],
						}),
					},
				},
			});

			const reply = await wrapper.prompt("hello");

			expect(reply).toBe("hi there");
			/* eslint-disable security/detect-non-literal-fs-filename -- test fixture path under a throwaway tmp cwd */
			const transcript = fs
				.readFileSync(path.join(cwd, ".kainbain", "opencode_transcript.jsonl"), "utf8")
				.trim()
				.split("\n")
				.map((l) => JSON.parse(l));
			/* eslint-enable security/detect-non-literal-fs-filename */
			expect(transcript.map((e) => e.message.role)).toEqual(["user", "assistant"]);
			expect(transcript[1].message.content).toBe("hi there");
		} finally {
			fs.rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("marks itself streaming during the prompt and clears it after", async () => {
		let resolvePrompt;
		const wrapper = makeWrapper({
			client: {
				session: {
					prompt: () => new Promise((resolve) => { resolvePrompt = resolve; }),
					messages: async () => ({ data: [] }),
				},
			},
		});

		const pending = wrapper.prompt("slow");
		expect(wrapper.isStreaming).toBe(true);
		resolvePrompt({ data: {} });
		await pending;
		expect(wrapper.isStreaming).toBe(false);
	});
});