#!/usr/bin/env node
/***
 * MARK: verify-stage-attestation
 * @description Read-only compliance check for stage+config attestation: given
 *   a repo, a task id, and (optionally) a wrap-up commit SHA, it reads the
 *   attestation token from the task's stage history, the trailers from the
 *   commit, and confirms history ↔ commit ↔ config agree. With `--config`
 *   it additionally re-hashes a pinned attestation-input JSON file and
 *   compares it to the recorded hash. Prints PASS/FAIL plus every problem
 *   and exits 0/1. Never writes: the only git invocations are `log`, and
 *   task files are only read.
 * @example node scripts/verify-stage-attestation.mjs --repo /repo --task t1 --sha abc123
 * @example node scripts/verify-stage-attestation.mjs --repo /repo --task t1 --config pinned-input.json
 ***/
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	hashConfig,
	parseAttestationToken,
	verifyAttestationLink,
} from "../shared/stageAttestation.js";

/***
 * MARK: parseVerifyArgs
 * @description Parses the verify CLI's `--key value` arguments.
 * @example parseVerifyArgs(['--repo', '/r', '--task', 't']) => { repo: '/r', task: 't' }
 * @param {Array<string>} argv - Arguments after the script name.
 * @returns {Object} Parsed `{ repo, task, sha, config, docsDir }`.
 ***/
export function parseVerifyArgs(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (!arg.startsWith("--")) continue;
		const key = arg.slice(2);
		const next = argv[i + 1];
		if (next !== undefined && !next.startsWith("--")) {
			out[key] = next;
			i += 1;
		} else {
			out[key] = "true";
		}
	}
	return {
		repo: out.repo || null,
		task: out.task || null,
		sha: out.sha || null,
		config: out.config || null,
		docsDir: out["docs-dir"] || "docs",
	};
}

/***
 * MARK: findHistoryTokens
 * @description Collects every attestation token from a task.md's History
 *   section, in file order, as `{ line, token }` pairs.
 * @example findHistoryTokens('# History\n- t: did x [attestation task=t stage=s config=c commit=none]') => [{ line: '…', token: { … } }]
 * @param {string} taskMd - Raw task.md text.
 * @returns {Array<Object>} Tokens in file order.
 ***/
export function findHistoryTokens(taskMd) {
	const section = String(taskMd || "").match(/# History\r?\n([\s\S]*?)(?=(?:\r?\n# )|$)/);
	const body = section ? section[1] : String(taskMd || "");
	const found = [];
	for (const rawLine of body.split(/\r?\n/)) {
		const token = parseAttestationToken(rawLine);
		if (token) found.push({ line: rawLine.trim(), token });
	}
	return found;
}

/***
 * MARK: readCommitBody
 * @description Reads one commit's full message (`%B`) from a repo.
 * @example readCommitBody('/repo', 'abc123') => 'subject\n\nKainBain-Task: t\n…'
 * @param {string} repo - Repo working directory.
 * @param {string} sha - Commit SHA (full or abbreviated).
 * @returns {string} Full commit message.
 ***/
export function readCommitBody(repo, sha) {
	return execFileSync("git", ["-C", repo, "log", "--format=%B", "-n", "1", sha], {
		encoding: "utf8",
	});
}

/***
 * MARK: verifyFromRepo
 * @description Verifies one attestation link from repo files on disk: picks
 *   the history token (the one naming `--sha`, or the last token when no
 *   SHA is given), loads the commit it names, and checks the link plus an
 *   optional pinned-config re-hash. Read-only.
 * @example verifyFromRepo({ repo: '/r', taskId: 't', sha: null, configPath: null, docsDir: 'docs' }).linked => true
 * @param {Object} input - Labelled inputs.
 * @param {string} input.repo - Repo working directory.
 * @param {string} input.taskId - Task id under `<docsDir>/tasks/`.
 * @param {string|null} [input.sha] - Wrap-up commit SHA to check (else the latest token).
 * @param {string|null} [input.configPath] - Pinned attestation-input JSON to re-hash.
 * @param {string} [input.docsDir] - Docs dir name, defaults to `docs`.
 * @returns {Object} `{ linked, problems, history, commit, configMatch }`.
 ***/
export function verifyFromRepo({ repo, taskId, sha = null, configPath = null, docsDir = "docs" }) {
	const problems = [];
	if (!repo || !taskId) {
		return { linked: false, problems: ["--repo and --task are required"], history: null, commit: null, configMatch: null };
	}
	let taskMd;
	try {
		taskMd = fs.readFileSync(path.join(repo, docsDir, "tasks", taskId, "task.md"), "utf8");
	} catch {
		return {
			linked: false,
			problems: [`no task file at ${docsDir}/tasks/${taskId}/task.md`],
			history: null,
			commit: null,
			configMatch: null,
		};
	}
	const tokens = findHistoryTokens(taskMd);
	if (tokens.length === 0) {
		return {
			linked: false,
			problems: ["stage history carries no attestation token (predates the feature, or the stage never attested)"],
			history: null,
			commit: null,
			configMatch: null,
		};
	}
	let picked = null;
	if (sha) {
		picked =
			tokens.find((t) => (t.token.commitSha || "").toLowerCase() === String(sha).toLowerCase()) ||
			null;
		if (!picked) {
			const known = tokens.map((t) => t.token.commitSha || "none").join(", ");
			return {
				linked: false,
				problems: [`no history token names commit ${sha} (tokens name: ${known})`],
				history: null,
				commit: null,
				configMatch: null,
			};
		}
	} else {
		picked = tokens[tokens.length - 1];
	}
	let commitBody = null;
	if (picked.token.commitSha) {
		try {
			commitBody = readCommitBody(repo, picked.token.commitSha);
		} catch {
			problems.push(`commit ${picked.token.commitSha} is unknown to this repo`);
		}
	}
	const link = verifyAttestationLink({
		historyAction: picked.line,
		commitBody,
		commitSha: picked.token.commitSha,
	});
	problems.push(...link.problems);
	let configMatch = null;
	if (configPath) {
		try {
			const pinned = JSON.parse(fs.readFileSync(configPath, "utf8"));
			const recomputed = hashConfig(pinned);
			configMatch = recomputed === picked.token.configHash;
			if (!configMatch) {
				problems.push(
					`config re-hash mismatch: pinned input hashes to ${recomputed} but history records ${picked.token.configHash}`,
				);
			}
		} catch (err) {
			problems.push(`cannot re-hash ${configPath}: ${err?.message || err}`);
		}
	}
	return { linked: problems.length === 0, problems, history: link.history, commit: link.commit, configMatch };
}

/***
 * MARK: formatVerifyReport
 * @description Renders a verify result as human-readable PASS/FAIL text.
 * @example formatVerifyReport({ linked: true, problems: [], history: {}, commit: {}, configMatch: null }) starts with 'PASS'
 * @param {Object} result - verifyFromRepo result.
 * @returns {string} Report text.
 ***/
export function formatVerifyReport(result) {
	const lines = [result.linked ? "PASS: stage attestation links history, commit, and config." : "FAIL: stage attestation does not link."];
	if (result.history) {
		lines.push(
			`history: task=${result.history.taskId} stage=${result.history.stageId} config=${result.history.configHash} commit=${result.history.commitSha || "none"}`,
		);
	}
	if (result.commit && result.commit.configHash) {
		lines.push(
			`commit:   task=${result.commit.taskId} stage=${result.commit.stageId} config=${result.commit.configHash}`,
		);
	}
	if (result.configMatch === true) lines.push("config:  pinned input re-hashes to the recorded hash.");
	if (result.configMatch === false) lines.push("config:  pinned input does NOT re-hash to the recorded hash.");
	for (const problem of result.problems || []) lines.push(`problem: ${problem}`);
	return `${lines.join("\n")}\n`;
}

const invokedDirectly =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	const args = parseVerifyArgs(process.argv.slice(2));
	if (!args.repo || !args.task) {
		console.error(
			"usage: node scripts/verify-stage-attestation.mjs --repo <path> --task <id> [--sha <sha>] [--config <input.json>] [--docs-dir <name>]",
		);
		process.exit(2);
	}
	const result = verifyFromRepo({
		repo: args.repo,
		taskId: args.task,
		sha: args.sha,
		configPath: args.config,
		docsDir: args.docsDir,
	});
	process.stdout.write(formatVerifyReport(result));
	process.exit(result.linked ? 0 : 1);
}
