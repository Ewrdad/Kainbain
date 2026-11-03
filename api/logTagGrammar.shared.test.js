import { describe, it, expect } from "vitest";
import { classifyLogLineTag } from "../shared/logTagGrammar.js";

/**
 * MARK: logTagGrammar (shared tag contract)
 * @description The ONE tag grammar both log readers delegate to — backend
 *   synthesis (`api/watch/processLogs.js`) and the frontend legacy parse
 *   (`frontend/src/components/tasks/logEntryModel.js`). This suite pins the
 *   contract at the source so a grammar change fails here first, with the
 *   consumer suites proving the delegation on top.
 */
describe("classifyLogLineTag — every tag maps to one kind and feed", () => {
	const cases = [
		["[TOOL] bash(ls)", "tool", "tools"],
		["[RESULT] ok", "tool", "tools"],
		["[RUNNER] legacy caps", "runner", "main"],
		["[runner local-alpha] doing work", "runner", "main"],
		["[THINKING] hmm", "thinking", "thinking"],
		["[USAGE] tokens=1/2/3", "telemetry", "telemetry"],
		["[RAW] message_end: unmapped", "raw", "raw"],
		["[PERM] request bash", "permission", "main"],
		["[PLAN] updated", "plan", "main"],
		["[ERROR] boom", "error", "main"],
		["[FAIL] boom", "error", "main"],
		["[STDERR] boom", "error", "main"],
		["[error] lowercase still errors", "error", "main"],
		["[INFO] boot", "system", "main"],
		["[SYSTEM] boot", "system", "main"],
		["[GIT] main", "system", "main"],
		["[CI] ok", "system", "main"],
		["[CI/CMD] make test", "system", "main"],
		["[HUMAN] approve?", "system", "main"],
		["[WARN] careful", "system", "main"],
		["[AGENT] reasoning", "assistant", "main"],
		["plain narrative text", "assistant", "main"],
		["[FOO] unknown tags are narrative", "assistant", "main"],
		["", "assistant", "main"],
	];
	for (const [line, kind, feed] of cases) {
		it(`maps ${JSON.stringify(line.slice(0, 40))} to kind=${kind} feed=${feed}`, () => {
			expect(classifyLogLineTag(line)).toEqual({ kind, feed });
		});
	}
});

describe("classifyLogLineTag — stream wrappers and multi-line chunks", () => {
	it("unwraps a [STDOUT] wrapper so the content tag classifies", () => {
		expect(classifyLogLineTag("[STDOUT]\n[TOOL] x")).toEqual({
			kind: "tool",
			feed: "tools",
		});
		expect(classifyLogLineTag("[stdout]\n[TOOL] x")).toEqual({
			kind: "tool",
			feed: "tools",
		});
	});
	it("keeps the [STDERR] marker even when line two has its own tag", () => {
		// Only [STDOUT] unwraps: the error stream marker itself is the
		// classification, never the content beneath it.
		expect(classifyLogLineTag("[STDERR]\n[TOOL] x")).toEqual({
			kind: "error",
			feed: "main",
		});
	});
	it("classifies by the first line only", () => {
		expect(classifyLogLineTag("[TOOL] x\n[ERROR] y")).toEqual({
			kind: "tool",
			feed: "tools",
		});
		expect(classifyLogLineTag("[STDOUT]")).toEqual({
			kind: "assistant",
			feed: "main",
		});
	});
	it("never throws on non-string input", () => {
		for (const input of [null, undefined, 42, { tag: "[TOOL]" }]) {
			expect(() => classifyLogLineTag(input)).not.toThrow();
			expect(classifyLogLineTag(input)).toEqual({
				kind: "assistant",
				feed: "main",
			});
		}
	});
	it("treats a value whose string conversion throws as narrative", () => {
		const hostile = {
			toString() {
				throw new Error("conversion exploded");
			},
		};
		expect(() => classifyLogLineTag(hostile)).not.toThrow();
		expect(classifyLogLineTag(hostile)).toEqual({
			kind: "assistant",
			feed: "main",
		});
	});
});
