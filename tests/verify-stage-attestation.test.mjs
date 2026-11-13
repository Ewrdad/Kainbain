import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	findHistoryTokens,
	formatVerifyReport,
	parseVerifyArgs,
	verifyFromRepo,
} from "../scripts/verify-stage-attestation.mjs";
import {
	buildStageConfigInput,
	formatAttestationToken,
	formatAttestationTrailers,
	hashConfig,
} from "../shared/stageAttestation.js";

/***
 * MARK: verify-stage-attestation tests
 * @description Behavioural tests for the read-only compliance check
 *   (`scripts/verify-stage-attestation.mjs`): token discovery in task.md,
 *   the history↔commit link over a scratch git repo, the pinned-config
 *   re-hash, and every failure shape (missing token, unknown commit,
 *   tampered trailers, config drift). A CLI smoke test pins the exit codes.
 * @example run `node --test tests/verify-stage-attestation.test.mjs`
 ***/

const TASK = { id: "t9", goal: "Prove the stage ran", workflowId: "wf-default" };
const STAGE = { id: "s5", name: "Build", type: "agent", prompt: "Build it.", failback: "previous" };
const INPUT = buildStageConfigInput({ task: TASK, stage: STAGE });
const CONFIG_HASH = hashConfig(INPUT);

function git(dir, args) {
	execFileSync("git", args, { cwd: dir, stdio: "ignore" });
}

function attestedRepo() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-attest-verify-"));
	git(dir, ["init", "-q"]);
	git(dir, ["config", "user.email", "t@t.t"]);
	git(dir, ["config", "user.name", "t"]);
	fs.writeFileSync(path.join(dir, "f.txt"), "x");
	git(dir, ["add", "."]);
	git(dir, ["commit", "-qm", "init"]);
	const trailers = formatAttestationTrailers({ taskId: "t9", stageId: "s5", configHash: CONFIG_HASH });
	fs.writeFileSync(path.join(dir, "work.txt"), "work");
	git(dir, ["add", "."]);
	git(dir, ["commit", "-qm", "stage output", "-m", `prompt body\n\n${trailers}`]);
	const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
	const token = formatAttestationToken({ taskId: "t9", stageId: "s5", configHash: CONFIG_HASH, commitSha: sha });
	const docsDir = path.join(dir, "docs", "tasks", "t9");
	fs.mkdirSync(docsDir, { recursive: true });
	fs.writeFileSync(
		path.join(docsDir, "task.md"),
		["---", "id: t9", "---", "", "# Goal", TASK.goal, "", "# History", `- 2026-01-01T00:00:00.000Z: Auto-committed task work ${token}`, ""].join("\n"),
	);
	return { dir, sha };
}

describe("parseVerifyArgs", () => {
	it("parses flags with defaults", () => {
		assert.deepEqual(parseVerifyArgs(["--repo", "/r", "--task", "t"]), {
			repo: "/r",
			task: "t",
			sha: null,
			config: null,
			docsDir: "docs",
		});
		assert.equal(parseVerifyArgs(["--repo", "/r", "--task", "t", "--docs-dir", "d"]).docsDir, "d");
	});
});

describe("findHistoryTokens", () => {
	it("collects tokens in file order", () => {
		const one = formatAttestationToken({ taskId: "t", stageId: "s", configHash: "sha256:a", commitSha: null });
		const two = formatAttestationToken({ taskId: "t", stageId: "s", configHash: "sha256:b", commitSha: null });
		const found = findHistoryTokens(`# History\n- t1: first ${one}\n- t2: plain\n- t3: second ${two}\n`);
		assert.equal(found.length, 2);
		assert.equal(found[0].token.configHash, "sha256:a");
		assert.equal(found[1].token.configHash, "sha256:b");
	});
});

describe("verifyFromRepo", () => {
	let ctx = null;
	beforeEach(() => {
		ctx = null;
	});
	afterEach(() => {
		if (ctx) fs.rmSync(ctx.dir, { recursive: true, force: true });
	});

	it("links a matching history entry, commit, and pinned config", () => {
		ctx = attestedRepo();
		const pinned = path.join(ctx.dir, "pinned.json");
		fs.writeFileSync(pinned, JSON.stringify(INPUT));
		const result = verifyFromRepo({ repo: ctx.dir, taskId: "t9", sha: ctx.sha, configPath: pinned });
		assert.equal(result.linked, true);
		assert.deepEqual(result.problems, []);
		assert.equal(result.configMatch, true);
		assert.match(formatVerifyReport(result), /^PASS/);
	});

	it("defaults to the latest token when no SHA is given", () => {
		ctx = attestedRepo();
		const result = verifyFromRepo({ repo: ctx.dir, taskId: "t9" });
		assert.equal(result.linked, true);
	});

	it("fails when the history token was tampered with", () => {
		ctx = attestedRepo();
		// Forge the token's config hash in task.md: the commit still carries
		// the real trailers, so the link must break.
		const forged = formatAttestationToken({
			taskId: "t9",
			stageId: "s5",
			configHash: `sha256:${"0".repeat(64)}`,
			commitSha: ctx.sha,
		});
		const taskMd = path.join(ctx.dir, "docs", "tasks", "t9", "task.md");
		fs.writeFileSync(
			taskMd,
			["---", "id: t9", "---", "", "# Goal", TASK.goal, "", "# History", `- 2026-01-01T00:00:00.000Z: Auto-committed task work ${forged}`, ""].join("\n"),
		);
		const result = verifyFromRepo({ repo: ctx.dir, taskId: "t9" });
		assert.equal(result.linked, false);
		assert.ok(result.problems.join(" ").match(/config hash mismatch/i));
		assert.match(formatVerifyReport(result), /^FAIL/);
	});

	it("fails when history names a commit the repo does not know", () => {
		ctx = attestedRepo();
		const missing = "f".repeat(40);
		const token = formatAttestationToken({ taskId: "t9", stageId: "s5", configHash: CONFIG_HASH, commitSha: missing });
		const taskMd = path.join(ctx.dir, "docs", "tasks", "t9", "task.md");
		fs.writeFileSync(
			taskMd,
			["---", "id: t9", "---", "", "# Goal", TASK.goal, "", "# History", `- 2026-01-01T00:00:00.000Z: Auto-committed task work ${token}`, ""].join("\n"),
		);
		const result = verifyFromRepo({ repo: ctx.dir, taskId: "t9", sha: missing });
		assert.equal(result.linked, false);
		assert.ok(result.problems.join(" ").match(/unknown to this repo/i));
	});

	it("fails when history carries no token, and when the task file is missing", () => {
		ctx = attestedRepo();
		const taskMd = path.join(ctx.dir, "docs", "tasks", "t9", "task.md");
		fs.writeFileSync(taskMd, ["---", "id: t9", "---", "", "# Goal", TASK.goal, "", "# History", "- t: plain entry", ""].join("\n"));
		const noToken = verifyFromRepo({ repo: ctx.dir, taskId: "t9" });
		assert.equal(noToken.linked, false);
		assert.ok(noToken.problems.join(" ").match(/no attestation token/i));
		const missing = verifyFromRepo({ repo: ctx.dir, taskId: "nope" });
		assert.equal(missing.linked, false);
	});

	it("fails the pinned-config check on drifted config", () => {
		ctx = attestedRepo();
		const drifted = path.join(ctx.dir, "drifted.json");
		fs.writeFileSync(drifted, JSON.stringify({ ...INPUT, goal: "edited after the run" }));
		const result = verifyFromRepo({ repo: ctx.dir, taskId: "t9", configPath: drifted });
		assert.equal(result.linked, false);
		assert.equal(result.configMatch, false);
		assert.ok(result.problems.join(" ").match(/re-hash mismatch/i));
	});

	it("CLI smoke: exit 0 on PASS, 1 on FAIL, 2 on usage error", () => {
		ctx = attestedRepo();
		const script = new URL("../scripts/verify-stage-attestation.mjs", import.meta.url);
		const run = (args) => {
			try {
				const stdout = execFileSync("node", [script.pathname, ...args], { encoding: "utf8" });
				return { status: 0, stdout };
			} catch (err) {
				return { status: err.status, stdout: String(err.stdout || "") };
			}
		};
		const pass = run(["--repo", ctx.dir, "--task", "t9", "--sha", ctx.sha]);
		assert.equal(pass.status, 0);
		assert.match(pass.stdout, /^PASS/);
		const fail = run(["--repo", ctx.dir, "--task", "t9", "--sha", "0".repeat(40)]);
		assert.equal(fail.status, 1);
		assert.match(fail.stdout, /^FAIL/);
		const usage = run(["--repo", ctx.dir]);
		assert.equal(usage.status, 2);
	});
});
