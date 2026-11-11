import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	appendAttestationTrailers,
	attachAttestationToEntry,
	attestationHistoryFields,
	buildStageConfigInput,
	canonicalize,
	formatAttestationToken,
	formatAttestationTrailers,
	hashConfig,
	hashStageConfig,
	isWellFormedConfigHash,
	parseAttestationToken,
	parseAttestationTrailers,
	verifyAttestationLink,
} from "../shared/stageAttestation.js";

// Stage+config attestation: after a stage completes, the wrap-up commit and
// the stage-history entry carry the same config hash so a verifier can prove
// the task passed through that stage under that exact config. The canonical
// bytes, the hash, the commit trailers, and the history token all live in
// shared/stageAttestation/ so the embedded path and the Runner compute
// byte-identical values. History entries persist as prose markdown (see
// api/work/taskPersistence.js), so structured fields alone would not survive
// a reload — the prose token is the durable copy.

// Minted from the implementation, then pinned: any accidental algorithm
// change fails here instead of silently voiding every prior attestation.
const GOLDEN_INPUT = {
	taskId: "d20f0c83-d132-43aa-95e0-d9fac42c9e6b",
	goal: "Add a stage+config hash to commits and stage history",
	workflowId: "wf-default",
	stage: {
		id: "5",
		type: "agent",
		prompt: "Executing the task.",
		failback: "previous",
		harness: "pi",
	},
};
const GOLDEN_HASH = "sha256:e7e48b4603c73a1cfe31bc298a778405b2cb9c06135a1f931008f379e02b5715";

function backendTask() {
	return {
		id: "task-9",
		projectId: "proj-1",
		goal: "  Ship the thing\n",
		workflowId: "wf-default",
		status: "in_stage",
		branch: "kb/task-9",
		currentStageId: "5",
		history: [],
	};
}

function backendStage() {
	return {
		id: "5",
		name: "In Progress",
		type: "agent",
		prompt: "Executing the task.",
		failback: "previous",
		harness: "pi",
		model: "pi::openai::gpt-5",
		paused: false,
	};
}

describe("canonicalize — deterministic JSON bytes", () => {
	it("sorts object keys recursively", () => {
		expect(canonicalize({ b: 1, a: { d: 4, c: 3 } })).toBe(
			'{"a":{"c":3,"d":4},"b":1}',
		);
	});

	it("is independent of insertion order", () => {
		const one = { taskId: "t", stage: { id: "5", type: "agent" } };
		const two = { stage: { type: "agent", id: "5" }, taskId: "t" };
		expect(canonicalize(one)).toBe(canonicalize(two));
	});

	it("preserves array order and unicode bytes", () => {
		expect(canonicalize({ tags: ["b", "a"], note: "héllo — ✓" })).toBe(
			'{"note":"héllo — ✓","tags":["b","a"]}',
		);
	});

	it("matches JSON.stringify for supported primitives", () => {
		expect(canonicalize(null)).toBe("null");
		expect(canonicalize(true)).toBe("true");
		expect(canonicalize(42)).toBe("42");
		expect(canonicalize("a\nb")).toBe(JSON.stringify("a\nb"));
	});

	it("fails loud on non-plain-JSON values", () => {
		expect(() => canonicalize(undefined)).toThrow();
		expect(() => canonicalize(() => {})).toThrow();
		expect(() => canonicalize({ a: undefined })).toThrow();
		expect(() => canonicalize({ a: () => {} })).toThrow();
		expect(() => canonicalize([undefined])).toThrow();
		expect(() => canonicalize(10n)).toThrow();
		expect(() => canonicalize(Symbol("s"))).toThrow();
		expect(() => canonicalize(new Date())).toThrow();
		const circular = { a: 1 };
		circular.self = circular;
		expect(() => canonicalize(circular)).toThrow();
		const shared = { x: 1 };
		expect(canonicalize({ a: shared, b: shared })).toBe(
			'{"a":{"x":1},"b":{"x":1}}',
		);
	});
});

describe("hashConfig — sha256 over canonical bytes", () => {
	it("returns a self-identifying sha256 hex digest", () => {
		expect(hashConfig({ a: 1 })).toMatch(/^sha256:[0-9a-f]{64}$/);
	});

	it("is stable for key-order variants of the same object", () => {
		expect(hashConfig({ a: 1, b: 2 })).toBe(hashConfig({ b: 2, a: 1 }));
	});

	it("changes when any value changes", () => {
		expect(hashConfig({ a: 1 })).not.toBe(hashConfig({ a: 2 }));
	});

	it("pins the golden vector against algorithm drift", () => {
		expect(hashConfig(GOLDEN_INPUT)).toBe(GOLDEN_HASH);
	});

	it("fails loud on non-plain-JSON input", () => {
		expect(() => hashConfig({ a: undefined })).toThrow();
	});
});

describe("buildStageConfigInput — the exact hashed bytes", () => {
	it("keeps identity plus the whole stage definition", () => {
		expect(buildStageConfigInput({ task: backendTask(), stage: backendStage() })).toEqual({
			taskId: "task-9",
			goal: "  Ship the thing\n",
			workflowId: "wf-default",
			stage: {
				id: "5",
				type: "agent",
				prompt: "Executing the task.",
				failback: "previous",
				harness: "pi",
				model: "pi::openai::gpt-5",
			},
		});
	});

	it("excludes display and enable flags but keeps future settings", () => {
		const input = buildStageConfigInput({
			task: backendTask(),
			stage: {
				...backendStage(),
				name: "Renamed",
				paused: true,
				someFutureSetting: { deep: [1, 2] },
			},
		});
		expect(input.stage).not.toHaveProperty("name");
		expect(input.stage).not.toHaveProperty("paused");
		expect(input.stage).toMatchObject({ someFutureSetting: { deep: [1, 2] } });
		// Renames and pause flips must not void an existing attestation.
		expect(hashStageConfig({ task: backendTask(), stage: backendStage() })).toBe(
			hashStageConfig({
				task: backendTask(),
				stage: { ...backendStage(), name: "Renamed", paused: true },
			}),
		);
	});

	it("drops undefined so in-memory and wire shapes hash identically", () => {
		const withUndefined = buildStageConfigInput({
			task: { ...backendTask(), workflowId: undefined },
			stage: { ...backendStage(), customBranch: undefined },
		});
		expect(withUndefined.workflowId).toBeNull();
		expect(withUndefined.stage).not.toHaveProperty("customBranch");
	});

	it("returns null when the task or stage is unusable", () => {
		expect(buildStageConfigInput(null)).toBeNull();
		expect(buildStageConfigInput({})).toBeNull();
		expect(buildStageConfigInput({ task: backendTask() })).toBeNull();
		expect(buildStageConfigInput({ stage: backendStage() })).toBeNull();
		expect(
			buildStageConfigInput({ task: { id: "  " }, stage: backendStage() }),
		).toBeNull();
		expect(
			buildStageConfigInput({ task: backendTask(), stage: { id: "  " } }),
		).toBeNull();
		const circular = { id: "5" };
		circular.self = circular;
		expect(
			buildStageConfigInput({ task: backendTask(), stage: circular }),
		).toBeNull();
	});
});

describe("hashStageConfig — one call for producers", () => {
	it("hashes the built input", () => {
		const viaHelper = hashStageConfig({ task: backendTask(), stage: backendStage() });
		const viaParts = hashConfig(
			buildStageConfigInput({ task: backendTask(), stage: backendStage() }),
		);
		expect(viaHelper).toBe(viaParts);
		expect(viaHelper).toMatch(/^sha256:[0-9a-f]{64}$/);
	});

	it("returns null instead of throwing for unusable input", () => {
		expect(hashStageConfig(null)).toBeNull();
		expect(hashStageConfig({})).toBeNull();
		expect(hashStageConfig({ task: backendTask() })).toBeNull();
	});
});

describe("isWellFormedConfigHash — wire guard", () => {
	it("accepts single-token hashes", () => {
		expect(isWellFormedConfigHash("sha256:abc123")).toBe(true);
		expect(isWellFormedConfigHash("  sha256:abc123  ")).toBe(true);
	});

	it("rejects anything that could corrupt a message line", () => {
		expect(isWellFormedConfigHash(null)).toBe(false);
		expect(isWellFormedConfigHash("")).toBe(false);
		expect(isWellFormedConfigHash("   ")).toBe(false);
		expect(isWellFormedConfigHash("sha256:abc\ninjected: x")).toBe(false);
		expect(isWellFormedConfigHash("two tokens")).toBe(false);
		expect(isWellFormedConfigHash(`sha256:${"x".repeat(200)}`)).toBe(false);
		expect(isWellFormedConfigHash(42)).toBe(false);
	});
});

describe("cross-path equality — embedded and Runner agree byte-for-byte", () => {
	it("survives a JSON wire round-trip with shuffled keys", () => {
		const backendHash = hashStageConfig({ task: backendTask(), stage: backendStage() });
		// The Runner rebuilds the same objects from GET /projects/:id and
		// GET /tasks/:id: JSON transport drops undefined and reorders keys.
		const wireTask = JSON.parse(
			JSON.stringify({ ...backendTask(), extraVolatile: "ignored" }),
		);
		const wireStage = JSON.parse(
			JSON.stringify({
				type: backendStage().type,
				id: backendStage().id,
				model: backendStage().model,
				prompt: backendStage().prompt,
				name: backendStage().name,
				paused: backendStage().paused,
				failback: backendStage().failback,
				harness: backendStage().harness,
			}),
		);
		expect(hashStageConfig({ task: wireTask, stage: wireStage })).toBe(backendHash);
	});
});

describe("commit trailers — machine-parseable carriage", () => {
	const FIELDS = {
		taskId: "task-9",
		stageId: "5",
		configHash: "sha256:abc123",
	};

	it("formats a stable trailer block", () => {
		expect(formatAttestationTrailers(FIELDS)).toBe(
			"KainBain-Task: task-9\nKainBain-Stage: 5\nKainBain-Config-Hash: sha256:abc123",
		);
	});

	it("refuses blank fields instead of emitting a partial block", () => {
		expect(() => formatAttestationTrailers({ ...FIELDS, taskId: " " })).toThrow();
		expect(() => formatAttestationTrailers({ ...FIELDS, stageId: "" })).toThrow();
		expect(() => formatAttestationTrailers({ ...FIELDS, configHash: null })).toThrow();
	});

	it("round-trips through a commit body", () => {
		const body = `subject line\n\n# Task\nDo the thing.\n\n${formatAttestationTrailers(FIELDS)}\n`;
		expect(parseAttestationTrailers(body)).toEqual(FIELDS);
	});

	it("tolerates surrounding text, CRLF, and trailing spaces", () => {
		const body = "noise\r\nKainBain-Task: task-9  \r\nmiddle\r\nKainBain-Stage: 5\r\nKainBain-Config-Hash: sha256:abc123\r\ntrailing";
		expect(parseAttestationTrailers(body)).toEqual(FIELDS);
	});

	it("returns nulls when trailers are absent", () => {
		expect(parseAttestationTrailers("plain body")).toEqual({
			taskId: null,
			stageId: null,
			configHash: null,
		});
		expect(parseAttestationTrailers(null)).toEqual({
			taskId: null,
			stageId: null,
			configHash: null,
		});
	});

	it("appends after the existing body, or stands alone without one", () => {
		expect(appendAttestationTrailers("prompt body", FIELDS)).toBe(
			`prompt body\n\n${formatAttestationTrailers(FIELDS)}`,
		);
		expect(appendAttestationTrailers(null, FIELDS)).toBe(
			formatAttestationTrailers(FIELDS),
		);
		expect(appendAttestationTrailers("   \n ", FIELDS)).toBe(
			formatAttestationTrailers(FIELDS),
		);
	});
});

describe("history token — the durable prose copy", () => {
	const FIELDS = {
		taskId: "task-9",
		stageId: "5",
		configHash: "sha256:abc123",
		commitSha: "0123456789abcdef0123456789abcdef01234567",
	};

	it("formats a single-line token", () => {
		expect(formatAttestationToken(FIELDS)).toBe(
			"[attestation task=task-9 stage=5 config=sha256:abc123 commit=0123456789abcdef0123456789abcdef01234567]",
		);
		expect(formatAttestationToken({ ...FIELDS, commitSha: null })).toBe(
			"[attestation task=task-9 stage=5 config=sha256:abc123 commit=none]",
		);
	});

	it("refuses blank identity fields", () => {
		expect(() => formatAttestationToken({ ...FIELDS, taskId: "" })).toThrow();
		expect(() => formatAttestationToken({ ...FIELDS, stageId: "" })).toThrow();
		expect(() => formatAttestationToken({ ...FIELDS, configHash: "" })).toThrow();
	});

	it("round-trips through a history action line", () => {
		const action = `Auto-committed task work on 'kb/task-9' (abc1234) ${formatAttestationToken(FIELDS)}`;
		expect(parseAttestationToken(action)).toEqual(FIELDS);
	});

	it("returns null when no token is present", () => {
		expect(parseAttestationToken("Auto-committed task work (no attestation)")).toBeNull();
		expect(parseAttestationToken(null)).toBeNull();
	});
});

describe("history fields + entry attach", () => {
	it("builds structured fields with an explicit clean-tree null", () => {
		expect(
			attestationHistoryFields({
				taskId: "task-9",
				stageId: "5",
				configHash: "sha256:abc123",
				commitSha: "0123abcd",
			}),
		).toEqual({
			taskId: "task-9",
			stageId: "5",
			configHash: "sha256:abc123",
			commitSha: "0123abcd",
		});
		const clean = attestationHistoryFields({
			taskId: "task-9",
			stageId: "5",
			configHash: "sha256:abc123",
			commitSha: null,
		});
		expect(clean).toHaveProperty("commitSha", null);
		expect("commitSha" in clean).toBe(true);
	});

	it("blank-safe identity, but configHash is required", () => {
		expect(
			attestationHistoryFields({ taskId: " ", stageId: "", configHash: "sha256:x", commitSha: null }),
		).toEqual({ configHash: "sha256:x", commitSha: null });
		expect(() =>
			attestationHistoryFields({ taskId: "t", stageId: "s", configHash: " ", commitSha: null }),
		).toThrow();
	});

	it("attaches the token and fields to a live entry in place", () => {
		const entry = { timestamp: "2026-01-01T00:00:00.000Z", action: "Auto-committed task work" };
		const attached = attachAttestationToEntry(entry, {
			taskId: "task-9",
			stageId: "5",
			configHash: "sha256:abc123",
			commitSha: "0123abcd",
		});
		expect(attached).toBe(true);
		expect(entry.configHash).toBe("sha256:abc123");
		expect(entry.commitSha).toBe("0123abcd");
		expect(entry.action).toContain("[attestation task=task-9 stage=5 config=sha256:abc123 commit=0123abcd]");
		// Idempotent: a second attach is a no-op, never a doubled token.
		expect(
			attachAttestationToEntry(entry, {
				taskId: "task-9",
				stageId: "5",
				configHash: "sha256:abc123",
				commitSha: "0123abcd",
			}),
		).toBe(false);
		expect(entry.action.match(/\[attestation /g)).toHaveLength(1);
	});

	it("skips entries without a config hash", () => {
		const entry = { timestamp: "t", action: "Auto-committed task work" };
		expect(
			attachAttestationToEntry(entry, { taskId: "t", stageId: "s", commitSha: null }),
		).toBe(false);
		expect(entry.action).toBe("Auto-committed task work");
		expect(entry).not.toHaveProperty("configHash");
	});
});

describe("verifyAttestationLink — history entry vs commit", () => {
	const CONFIG = "sha256:abc123";
	const SHA = "0123456789abcdef0123456789abcdef01234567";
	const token = formatAttestationToken({
		taskId: "task-9",
		stageId: "5",
		configHash: CONFIG,
		commitSha: SHA,
	});
	const trailers = formatAttestationTrailers({
		taskId: "task-9",
		stageId: "5",
		configHash: CONFIG,
	});

	it("links a matching pair", () => {
		const report = verifyAttestationLink({
			historyAction: `Auto-committed ${token}`,
			commitBody: `body\n\n${trailers}\n`,
			commitSha: SHA,
		});
		expect(report.linked).toBe(true);
		expect(report.problems).toEqual([]);
		expect(report.history.configHash).toBe(CONFIG);
		expect(report.commit.configHash).toBe(CONFIG);
	});

	it("reports every mismatch instead of failing fast", () => {
		const other = formatAttestationTrailers({
			taskId: "task-9",
			stageId: "5",
			configHash: "sha256:ffff",
		});
		const report = verifyAttestationLink({
			historyAction: `Auto-committed ${token}`,
			commitBody: `body\n\n${other}\n`,
			commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		});
		expect(report.linked).toBe(false);
		expect(report.problems.length).toBeGreaterThanOrEqual(2);
		expect(report.problems.join(" ")).toMatch(/config/i);
		expect(report.problems.join(" ")).toMatch(/commit/i);
	});

	it("names missing evidence on either side", () => {
		const noHistory = verifyAttestationLink({
			historyAction: "Auto-committed task work (predates attestation)",
			commitBody: `body\n\n${trailers}\n`,
			commitSha: SHA,
		});
		expect(noHistory.linked).toBe(false);
		expect(noHistory.problems.join(" ")).toMatch(/history/i);
		const noCommit = verifyAttestationLink({
			historyAction: `Auto-committed ${token}`,
			commitBody: "plain body without trailers",
			commitSha: SHA,
		});
		expect(noCommit.linked).toBe(false);
		expect(noCommit.problems.join(" ")).toMatch(/trailer/i);
	});

	it("accepts a clean-tree attestation with no commit", () => {
		const cleanToken = formatAttestationToken({
			taskId: "task-9",
			stageId: "5",
			configHash: CONFIG,
			commitSha: null,
		});
		const report = verifyAttestationLink({
			historyAction: `Stage completed with a clean tree ${cleanToken}`,
			commitBody: null,
			commitSha: null,
		});
		expect(report.linked).toBe(true);
		expect(report.problems).toEqual([]);
	});
});

describe("stageAttestation — shared-module hygiene", () => {
	it("leaves import only relative or node: modules (never from api/)", () => {
		const dir = path.dirname(fileURLToPath(import.meta.url));
		const sharedDir = path.join(dir, "..", "shared", "stageAttestation");
		/* eslint-disable security/detect-non-literal-fs-filename -- test enumerates the repo's own shared/stageAttestation dir */
		for (const name of fs.readdirSync(sharedDir)) {
			if (!name.endsWith(".js")) continue;
			const text = fs.readFileSync(path.join(sharedDir, name), "utf8");
			for (const match of text.matchAll(/from\s+["']([^"']+)["']/g)) {
				const spec = match[1];
				expect(
					spec.startsWith(".") || spec.startsWith("node:"),
					`${name} imports ${spec}`,
				).toBe(true);
			}
		}
		/* eslint-enable security/detect-non-literal-fs-filename */
	});
});
