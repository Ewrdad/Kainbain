// Domain: The Flow — guard test: the generic pipeline must not contain
// deploy-specific behaviour.
//
// A deploy-command stage is an ordinary ci stage. The generic pipeline
// (api/flow) must never:
//   - import deploy-specific modules (deployMarkers, deployStageFailure,
//     deployFailureReason, sharedGateAttribution, deployManager);
//   - branch on the literal `deploy.sh` command text;
//   - reference deploy attempt ids, deploy operation keys, deploy build
//     markers, or the `running_deploy` status for command dispatch;
//   - read `last-result.json` or per-attempt checkpoints;
//   - set `KAINBAIN_DEPLOY_ATTEMPT_ID` / `KAINBAIN_DEPLOY_OPERATION_KEY`
//     in the child environment.
//
// KainBain's own cross-restart continuity lives in `api/continuity/`,
// enabled only by `KAINBAIN_SELF_DEPLOY_CONTINUITY=1`. Legacy aliases
// (`type: "deploy"` → `ci`, `running_deploy` in orphan reconciliation)
// are allowed for backward compatibility with persisted task records.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const flowDir = __dirname;

/** All non-test .js files in api/flow (recursively). */
function listFlowModules() {
	const entries = fs.readdirSync(flowDir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const full = path.join(flowDir, entry.name);
		if (entry.isDirectory()) {
			for (const sub of fs.readdirSync(full, { withFileTypes: true })) {
				if (
					sub.isFile() &&
					sub.name.endsWith(".js") &&
					!sub.name.endsWith(".test.js") &&
					!sub.name.includes(".guard.test.")
				) {
					files.push(path.join(full, sub.name));
				}
			}
		} else if (
			entry.isFile() &&
			entry.name.endsWith(".js") &&
			!entry.name.endsWith(".test.js") &&
			!entry.name.includes(".guard.test.")
		) {
			files.push(full);
		}
	}
	return files;
}

/** Strip comments and strings so only real code is scanned. */
function stripCommentsAndStrings(source) {
	// Remove block comments.
	let out = source.replace(/\/\*[\s\S]*?\*\//g, "");
	// Remove line comments.
	out = out.replace(/\/\/[^\n]*/g, "");
	// Remove template literals (backtick strings).
	out = out.replace(/`(?:[^`\\]|\\.)*`/g, '""');
	// Remove double-quoted strings.
	out = out.replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
	// Remove single-quoted strings.
	out = out.replace(/'(?:[^'\\\n]|\\.)*'/g, '""');
	return out;
}

const flowModules = listFlowModules();

describe("generic flow modules have no deploy-specific imports", () => {
	it("no api/flow module imports deploy markers, deploy failure, or shared-gate modules", () => {
		const forbiddenImports = [
			"deployMarkers",
			"deployStageFailure",
			"deployFailureReason",
			"sharedGateAttribution",
			"deployManager",
			"/continuity/",
		];
		const violations = [];
		for (const file of flowModules) {
			const source = fs.readFileSync(file, "utf8");
			const code = stripCommentsAndStrings(source);
			for (const forbidden of forbiddenImports) {
				if (code.includes(forbidden)) {
					violations.push(
						`${path.relative(flowDir, file)}: imports/references "${forbidden}"`,
					);
				}
			}
		}
		expect(violations).toEqual([]);
	});

	it("no api/flow module branches on deploy.sh command text", () => {
		const violations = [];
		for (const file of flowModules) {
			const source = fs.readFileSync(file, "utf8");
			const code = stripCommentsAndStrings(source);
			// Match deploy.sh as a command reference (not in a comment).
			if (/deploy\.sh/.test(code)) {
				violations.push(
					`${path.relative(flowDir, file)}: references "deploy.sh" in code`,
				);
			}
		}
		expect(violations).toEqual([]);
	});

	it("no api/flow module reads last-result.json or deploy checkpoints", () => {
		const violations = [];
		for (const file of flowModules) {
			const source = fs.readFileSync(file, "utf8");
			const code = stripCommentsAndStrings(source);
			if (/last-result\.json/.test(code)) {
				violations.push(
					`${path.relative(flowDir, file)}: references "last-result.json" in code`,
				);
			}
			if (/attempt-.*\.json|deployAttempt|deployOperationKey|deployBuildAtEntry/.test(code)) {
				violations.push(
					`${path.relative(flowDir, file)}: references deploy attempt markers in code`,
				);
			}
		}
		expect(violations).toEqual([]);
	});

	it("no api/flow module sets KAINBAIN_DEPLOY_* environment variables", () => {
		const violations = [];
		for (const file of flowModules) {
			const source = fs.readFileSync(file, "utf8");
			const code = stripCommentsAndStrings(source);
			if (/KAINBAIN_DEPLOY_/.test(code)) {
				violations.push(
					`${path.relative(flowDir, file)}: references "KAINBAIN_DEPLOY_*" in code`,
				);
			}
		}
		expect(violations).toEqual([]);
	});

	it("no api/flow module dispatches on running_deploy status (legacy label only in orphan set)", () => {
		// `running_deploy` is allowed ONLY in ORPHANED_RUNNING_STATUSES (backward
		// compat for pre-migration task records). It must never gate dispatch.
		const violations = [];
		for (const file of flowModules) {
			const source = fs.readFileSync(file, "utf8");
			const code = stripCommentsAndStrings(source);
			const lines = code.split("\n");
			lines.forEach((line, idx) => {
				if (!line.includes("running_deploy")) return;
				// Allow the ORPHANED_RUNNING_STATUSES set entry.
				const isOrphanSetEntry =
					file.endsWith("taskScheduler.js") &&
					/ORPHANED_RUNNING_STATUSES|"running_deploy"/.test(
						lines.slice(Math.max(0, idx - 5), idx + 1).join("\n"),
					);
				if (!isOrphanSetEntry) {
					violations.push(
						`${path.relative(flowDir, file)}:${idx + 1}: references "running_deploy" outside ORPHANED_RUNNING_STATUSES`,
					);
				}
			});
		}
		expect(violations).toEqual([]);
	});
});

describe("generic flow modules exist (sanity)", () => {
	it("finds the expected flow modules", () => {
		const names = flowModules.map((f) => path.basename(f));
		expect(names).toContain("stageExecution.js");
		expect(names).toContain("commandStages.js");
		expect(names).toContain("taskScheduler.js");
		expect(names).toContain("stageLifecycle.js");
	});
});
