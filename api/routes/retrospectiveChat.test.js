import { describe, it, expect, vi } from "vitest";
import {
	runChatTurn,
	normalizeTimeoutMs,
	truncateOutputTail,
	CHAT_OUTPUT_TAIL_MAX_CHARS,
	CHAT_OUTPUT_TRUNCATED_MARKER,
} from "./retrospectiveChat.js";
import { createReferenceMockSession } from "../agent/harnesses/mock/mockHarness.js";

describe("runChatTurn", () => {
	it("resolves replyText on successful prompt resolution", async () => {
		const session = createReferenceMockSession();
		const promptSpy = vi.spyOn(session, "prompt");
		const { replyText } = await runChatTurn({
			session,
			promptText: "Hello assistant",
			timeoutMs: 1000,
		});
		expect(promptSpy).toHaveBeenCalledWith(
			"Hello assistant",
			expect.objectContaining({ onChunk: expect.any(Function) }),
		);
		expect(replyText).toContain("Mock reply: Hello assistant");
	});

	it("throws coded timeout error when prompt does not resolve in time", async () => {
		const session = {
			prompt: () => new Promise(() => {}), // never settles
		};
		await expect(
			runChatTurn({ session, promptText: "hang", timeoutMs: 20 }),
		).rejects.toMatchObject({
			code: "chat_prompt_timeout",
			message: expect.stringContaining("timed out after 20ms"),
		});
	});

	it("runs with no timeout by default: a hanging prompt settles only when the model answers", async () => {
		// No-timeout default (timeoutMs omitted/0): the turn must outlive
		// any timer and resolve with the late answer, not chat_prompt_timeout.
		let resolvePrompt;
		const session = {
			prompt: () =>
				new Promise((resolve) => {
					resolvePrompt = resolve;
				}),
		};
		const pending = runChatTurn({ session, promptText: "slow model" });
		let settled = false;
		void pending.then(() => {
			settled = true;
		});
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(settled).toBe(false);
		resolvePrompt("late answer");
		const { replyText } = await pending;
		expect(settled).toBe(true);
		expect(typeof replyText).toBe("string");
	});

	it("throws coded failure error when prompt throws", async () => {
		const session = {
			prompt: async () => {
				throw new Error("Model exploded");
			},
		};
		await expect(
			runChatTurn({ session, promptText: "boom", timeoutMs: 1000 }),
		).rejects.toMatchObject({
			code: "chat_prompt_failed",
			message: expect.stringContaining("Model exploded"),
		});
	});

	it("forwards assistant deltas to the onProgress sink when provided", async () => {
		const session = createReferenceMockSession();
		const seen = [];
		const { replyText } = await runChatTurn({
			session,
			promptText: "Hello assistant",
			timeoutMs: 1000,
			onProgress: (delta) => seen.push(delta),
		});
		expect(seen.join("")).toContain("Mock reply: Hello assistant");
		expect(replyText).toContain("Mock reply: Hello assistant");
	});

	it("tags onProgress reports by stream so callers keep the winner rule", async () => {
		const session = createReferenceMockSession();
		const bySource = { chunk: [], subscribed: [] };
		const { replyText } = await runChatTurn({
			session,
			promptText: "Hello assistant",
			timeoutMs: 1000,
			// eslint-disable-next-line security/detect-object-injection -- source is the harness-reported stream tag ("chunk" | "subscribed"), never external input
			onProgress: (delta, source) => bySource[source].push(delta),
		});
		// The mock emits the same delta through BOTH paths (like the real
		// agy/muse/custom harnesses): each stream alone reconstructs the
		// reply, so a caller that keeps one winner never double-counts.
		expect(bySource.chunk.join("")).toBe(replyText);
		expect(bySource.subscribed.join("")).toBe(replyText);
	});

	it("reports subscribe-only harnesses (pi-style) through onProgress", async () => {
		const handlers = new Set();
		const session = {
			subscribe: (handler) => {
				handlers.add(handler);
				return () => handlers.delete(handler);
			},
			prompt: async () => {
				for (const handler of [...handlers]) {
					handler({ type: "assistant_delta", delta: "subscribed only" });
				}
				return "subscribed only";
			},
		};
		const seen = [];
		await runChatTurn({
			session,
			promptText: "hi",
			timeoutMs: 1000,
			onProgress: (delta, source) => seen.push([delta, source]),
		});
		expect(seen).toEqual([["subscribed only", "subscribed"]]);
	});

	it("never reports silent turns to onProgress", async () => {
		const session = {
			prompt: async () => "silent reply",
		};
		const seen = [];
		await runChatTurn({
			session,
			promptText: "hi",
			timeoutMs: 1000,
			onProgress: (delta, source) => seen.push([delta, source]),
		});
		expect(seen).toEqual([]);
	});

	it("returns the streamed output tail on success", async () => {
		const session = createReferenceMockSession();
		const { replyText, output } = await runChatTurn({
			session,
			promptText: "Hello assistant",
			timeoutMs: 1000,
		});
		expect(output).toBe(replyText);
		expect(output).toContain("Mock reply: Hello assistant");
	});

	it("returns an empty tail when the session streams nothing", async () => {
		const session = {
			prompt: async () => "silent reply",
		};
		const { replyText, output } = await runChatTurn({
			session,
			promptText: "hi",
			timeoutMs: 1000,
		});
		expect(replyText).toBe("silent reply");
		expect(output).toBe("");
	});

	it("prefers onChunk over subscribe instead of double-counting shared deltas", async () => {
		const handlers = new Set();
		const session = {
			subscribe: (handler) => {
				handlers.add(handler);
				return () => handlers.delete(handler);
			},
			prompt: async (text, { onChunk } = {}) => {
				// Same delta through both paths, like the mock/muse/custom harnesses.
				for (const handler of [...handlers]) {
					handler({ type: "assistant_delta", delta: "half " });
				}
				onChunk?.("half ");
				for (const handler of [...handlers]) {
					handler({ type: "assistant_delta", delta: "turn" });
				}
				onChunk?.("turn");
				return "half turn";
			},
		};
		const { output } = await runChatTurn({ session, promptText: "hi", timeoutMs: 1000 });
		expect(output).toBe("half turn");
	});

	it("falls back to subscribed deltas when onChunk yields nothing", async () => {
		const handlers = new Set();
		const session = {
			subscribe: (handler) => {
				handlers.add(handler);
				return () => handlers.delete(handler);
			},
			prompt: async () => {
				for (const handler of [...handlers]) {
					handler({ type: "assistant_delta", delta: "subscribed only" });
				}
				return "subscribed only";
			},
		};
		const { output } = await runChatTurn({ session, promptText: "hi", timeoutMs: 1000 });
		expect(output).toBe("subscribed only");
	});

	it("attaches partial output to the timeout error when deltas arrived first", async () => {
		const session = {
			prompt: (_text, { onChunk } = {}) =>
				new Promise(() => {
					onChunk?.("warming up…");
				}), // never settles
		};
		const failure = await runChatTurn({ session, promptText: "hang", timeoutMs: 20 }).catch(
			(err) => err,
		);
		expect(failure.code).toBe("chat_prompt_timeout");
		expect(failure.partialOutput).toBe("warming up…");
	});

	it("falls back to getLastAssistantText for partial output at timeout", async () => {
		const session = {
			prompt: () => new Promise(() => {}), // never settles, streams nothing
			getLastAssistantText: () => "partial thought",
		};
		const failure = await runChatTurn({ session, promptText: "hang", timeoutMs: 20 }).catch(
			(err) => err,
		);
		expect(failure.code).toBe("chat_prompt_timeout");
		expect(failure.partialOutput).toBe("partial thought");
	});

	it("reports an empty partial tail when nothing is observable at timeout", async () => {
		const session = {
			prompt: () => new Promise(() => {}), // never settles
		};
		const failure = await runChatTurn({ session, promptText: "hang", timeoutMs: 20 }).catch(
			(err) => err,
		);
		expect(failure.code).toBe("chat_prompt_timeout");
		expect(failure.partialOutput).toBe("");
	});

	it("attaches partial output to the failure error when deltas arrived first", async () => {
		const session = {
			prompt: async (_text, { onChunk } = {}) => {
				onChunk?.("before the boom");
				throw new Error("Model exploded");
			},
		};
		const failure = await runChatTurn({ session, promptText: "boom", timeoutMs: 1000 }).catch(
			(err) => err,
		);
		expect(failure.code).toBe("chat_prompt_failed");
		expect(failure.partialOutput).toBe("before the boom");
	});

	it("bounds the captured tail and unsubscribes after the turn", async () => {
		const handlers = new Set();
		const session = {
			subscribe: (handler) => {
				handlers.add(handler);
				return () => handlers.delete(handler);
			},
			prompt: async (_text, { onChunk } = {}) => {
				onChunk?.("x".repeat(CHAT_OUTPUT_TAIL_MAX_CHARS + 500));
				return "done";
			},
		};
		const { output } = await runChatTurn({ session, promptText: "hi", timeoutMs: 1000 });
		expect(output.length).toBeLessThanOrEqual(CHAT_OUTPUT_TAIL_MAX_CHARS);
		expect(output.startsWith(CHAT_OUTPUT_TRUNCATED_MARKER)).toBe(true);
		expect(handlers.size).toBe(0);
	});
});

describe("normalizeTimeoutMs", () => {
	it("passes finite positive ceilings through", () => {
		expect(normalizeTimeoutMs(1000)).toBe(1000);
		expect(normalizeTimeoutMs(0.5)).toBe(0.5);
	});

	it("disables the documented opt-outs", () => {
		expect(normalizeTimeoutMs(0)).toBe(0);
		expect(normalizeTimeoutMs(null)).toBe(0);
		expect(normalizeTimeoutMs(undefined)).toBe(0);
	});

	it("degrades degenerate inputs to disabled instead of false-firing", () => {
		// NaN/negative/Infinity/non-numbers must never arm an instant
		// timeout: the turn runs until the model settles (fail-safe).
		expect(normalizeTimeoutMs(Number.NaN)).toBe(0);
		expect(normalizeTimeoutMs(-1)).toBe(0);
		expect(normalizeTimeoutMs(Number.POSITIVE_INFINITY)).toBe(0);
		expect(normalizeTimeoutMs("1000")).toBe(0);
		expect(normalizeTimeoutMs({})).toBe(0);
	});
});

describe("runChatTurn degenerate ceilings", () => {
	it.each([Number.NaN, -100, Number.POSITIVE_INFINITY, "1000"])(
		"never times out a hanging prompt on ceiling %p",
		async (timeoutMs) => {
			let resolvePrompt;
			const session = {
				prompt: () =>
					new Promise((resolve) => {
						resolvePrompt = resolve;
					}),
			};
			const pending = runChatTurn({ session, promptText: "slow model", timeoutMs });
			let settled = false;
			void pending.then(() => {
				settled = true;
			});
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(settled).toBe(false);
			resolvePrompt("late answer");
			const { replyText } = await pending;
			expect(replyText).toBe("late answer");
		},
	);
});

describe("truncateOutputTail", () => {
	it("passes short text through and bounds long text behind the marker", () => {
		expect(truncateOutputTail("short")).toBe("short");
		expect(truncateOutputTail("")).toBe("");
		expect(truncateOutputTail(null)).toBe("");
		const long = "a".repeat(100);
		const bounded = truncateOutputTail(long, 20);
		expect(bounded.length).toBeLessThanOrEqual(20);
		expect(bounded.startsWith(`${CHAT_OUTPUT_TRUNCATED_MARKER}\n`)).toBe(true);
		expect(bounded.endsWith("a".repeat(5))).toBe(true);
		// Degenerate cap (no room for the marker): the raw tail wins, bound kept.
		expect(truncateOutputTail("abcdef", 4)).toBe("cdef");
	});
});
