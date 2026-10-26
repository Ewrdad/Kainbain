import { describe, it, expect, vi } from "vitest";

// Mock child_process.spawn so no real git runs: each spawned child stays
// open until the test releases it, which makes overlapping git invocations
// observable deterministically.
const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
	spawn: (...args) => spawnMock(...args),
}));

const { git } = await import("./git.js");

/***
 * MARK: git serialization-gate repro
 * @description Root-cause repro for the multi-task git pile-up: two engine
 *   git operations on the SAME repository (e.g. task-creation branch
 *   provisioning racing a running stage's checkout) must never overlap in
 *   time — overlapping processes are exactly what produces
 *   `.git/index.lock` collisions. Deterministic: with deferred mock closes,
 *   overlapping invocations are directly observable as in-flight count > 1.
 ***/

function deferredChild() {
	let closeFn = null;
	let closed = false;
	let exitCode = 0;
	const child = {
		kill: vi.fn(),
		stdout: { on: vi.fn() },
		stderr: { on: vi.fn() },
		on: (event, fn) => {
			if (event === "close") {
				closeFn = fn;
				if (closed) {
					queueMicrotask(() => closeFn(exitCode, null));
				}
			}
		},
	};
	return {
		child,
		close: (code = 0) => {
			closed = true;
			exitCode = code;
			if (closeFn) closeFn(code, null);
		},
	};
}

// The engine's full gate overlaps the api suite with the frontend suite,
// lint, the build, the security scans and (in its own phase) Playwright on a
// 4-core, swap-full host. Every wait below is a poll on the event loop, so a
// starved worker can stretch a normally millisecond-long test past a wall
// clock that was never meant to observe scheduling pressure. These are
// generous ceilings, not expected durations: a real regression still fires
// them long before the deploy gate's own timeout.
const STARVATION_BUDGET_MS = 900000;

async function waitForCondition(predicate, { timeoutMs = 60000, stepMs = 5 } = {}) {
	const started = Date.now();
	while (!predicate()) {
		if (Date.now() - started > timeoutMs) {
			throw new Error("timed out waiting for condition");
		}
		await new Promise((resolve) => setTimeout(resolve, stepMs));
	}
}

describe("git() per-repository serialization gate", () => {
	// All children here are test-controlled mocks that only close when the
	// test says so; the 60s production default is a wall-clock timer that can
	// fire under full-gate CPU starvation (the worker is starved for tens of
	// seconds while 250+ parallel suites run), turning a load spike into a
	// false GitError. Raise the ceiling so the test observes only overlap.
	const opts = { timeout: 600000 };

	it("never runs two git processes on the same repo at once", { timeout: STARVATION_BUDGET_MS }, async () => {
		spawnMock.mockReset();
		const first = deferredChild();
		const second = deferredChild();
		spawnMock
			.mockImplementationOnce(() => first.child)
			.mockImplementationOnce(() => second.child);

		const p1 = git("/gate-repro-repo", ["checkout", "kb/task-a"], opts);
		const p2 = git("/gate-repro-repo", ["checkout", "kb/task-b"], opts);
		await waitForCondition(() => spawnMock.mock.calls.length === 1);

		// The second operation must wait for the first to finish: only one
		// git process may exist at a time per repository.
		expect(spawnMock).toHaveBeenCalledTimes(1);

		first.close();
		await p1;
		await waitForCondition(() => spawnMock.mock.calls.length === 2);
		expect(spawnMock).toHaveBeenCalledTimes(2);
		second.close();
		await p2;
	});

	it("still runs git for different repos in parallel", { timeout: STARVATION_BUDGET_MS }, async () => {
		spawnMock.mockReset();
		const a = deferredChild();
		const b = deferredChild();
		spawnMock
			.mockImplementationOnce(() => a.child)
			.mockImplementationOnce(() => b.child);

		const p1 = git("/gate-repro-repo-a", ["status"], opts);
		const p2 = git("/gate-repro-repo-b", ["status"], opts);
		await waitForCondition(() => spawnMock.mock.calls.length === 2);

		expect(spawnMock).toHaveBeenCalledTimes(2);
		a.close();
		b.close();
		await p1;
		await p2;
	});
});
