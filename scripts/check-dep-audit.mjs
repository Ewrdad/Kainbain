#!/usr/bin/env node
/***
 * MARK: check-dep-audit
 * @description Dependency health gate for the four npm workspaces (root, api,
 *   frontend, canary-e2e). Default mode runs `npm audit` in each workspace
 *   and fails when a high or critical finding is not covered by a live
 *   (dated, unexpired) entry in `scripts/dep-audit-allowlist.json` — every
 *   accepted exception carries its advisory source id, a reason, and an
 *   expiry date, so deferrals stay visible and time-boxed (see
 *   DEPRECATIONS.md). `--report` mode instead prints the full
 *   outdated/audit/depcheck health summary (`npm run audit:deprecations`)
 *   and always exits 0.
 * @example node scripts/check-dep-audit.mjs => exit 0 when no new high/critical findings
 * @example node scripts/check-dep-audit.mjs --report => prints the health summary
 ***/

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowlistPath = path.join(repoRoot, "scripts", "dep-audit-allowlist.json");

const WORKSPACES = ["", "api", "frontend", "canary-e2e"];
const BLOCKING_SEVERITIES = new Set(["high", "critical"]);

/***
 * MARK: loadAuditAllowlist
 * @description Reads the audit allowlist; a missing or invalid file means no
 *   exceptions (fail-closed), never a crash.
 * @example loadAuditAllowlist() => { advisories: [] }
 ***/
export function loadAuditAllowlist() {
	try {
		const parsed = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
		if (parsed && Array.isArray(parsed.advisories)) return parsed;
		return { advisories: [] };
	} catch {
		return { advisories: [] };
	}
}

/***
 * MARK: liveAdvisorySources
 * @description The allowlisted advisory source ids whose expiry date is today
 *   or later; expired or dateless entries never suppress.
 * @example liveAdvisorySources({ advisories: [{ source: 1, expires: "2099-01-01" }] }) => new Set([1])
 ***/
export function liveAdvisorySources(allowlist) {
	const today = new Date().toISOString().slice(0, 10);
	const live = new Set();
	for (const entry of allowlist?.advisories ?? []) {
		if (entry?.source && entry?.expires && entry.expires >= today) live.add(entry.source);
	}
	return live;
}

/***
 * MARK: reachableAdvisories
 * @description Collects every advisory id reachable from one audit finding by
 *   following string `via` edges (e.g. tailwindcss -> chokidar -> braces ->
 *   advisory #1240992): dependents carry no advisory of their own, so the
 *   reachable set is what an allowlist entry must cover.
 * @example reachableAdvisories({ braces: { via: [{ source: 1 }] } }, { via: ["braces"] }) => [{ source: 1, title: "…" }]
 ***/
export function reachableAdvisories(vulnerabilities, finding) {
	const found = new Map();
	const visited = new Set();
	const visit = (node) => {
		for (const via of node?.via ?? []) {
			if (typeof via === "object" && via?.source) {
				if (!found.has(via.source)) found.set(via.source, { source: via.source, title: via.title ?? "advisory" });
			} else if (typeof via === "string" && !visited.has(via)) {
				visited.add(via);
				visit(vulnerabilities[via]);
			}
		}
	};
	visit(finding);
	return [...found.values()];
}

/***
 * MARK: evaluateAudit
 * @description Splits one workspace's `npm audit --json` result into blocking
 *   (high/critical, not allowlisted) and suppressed findings. A finding is
 *   suppressed only when every advisory reachable through its dependency
 *   chain is allowlisted and unexpired.
 * @example evaluateAudit("api", { vulnerabilities: {} }, { advisories: [] }) => { blocking: [], suppressed: [] }
 ***/
export function evaluateAudit(workspaceName, auditJson, allowlist) {
	const live = liveAdvisorySources(allowlist);
	const blocking = [];
	const suppressed = [];
	const vulnerabilities = auditJson?.vulnerabilities ?? {};
	for (const [moduleName, finding] of Object.entries(vulnerabilities)) {
		if (!BLOCKING_SEVERITIES.has(finding?.severity)) continue;
		const sources = reachableAdvisories(vulnerabilities, finding);
		const entry = {
			workspace: workspaceName,
			module: moduleName,
			severity: finding.severity,
			range: finding.range ?? "*",
			sources,
		};
		const covered = sources.length > 0 && sources.every((item) => live.has(item.source));
		(covered ? suppressed : blocking).push(entry);
	}
	return { blocking, suppressed };
}

/***
 * MARK: runWorkspaceAudit
 * @description Runs `npm audit --json` for one workspace; npm exits non-zero
 *   when findings exist, so output is used regardless of status.
 * @example runWorkspaceAudit("api").vulnerabilities => {...}
 ***/
function runWorkspaceAudit(workspaceName) {
	const label = workspaceName === "" ? "(root)" : workspaceName;
	const args = ["audit", "--json", "--audit-level=moderate"];
	if (workspaceName !== "") args.push("--prefix", workspaceName);
	const result = spawnSync("npm", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
	if (result.error) {
		return { label, failed: `cannot run npm audit: ${result.error.message}` };
	}
	try {
		return { label, json: JSON.parse(result.stdout || "{}") };
	} catch {
		return { label, failed: "npm audit printed no JSON (registry unreachable?)" };
	}
}

/***
 * MARK: runGate
 * @description Fails (exit 1) on any non-allowlisted high/critical finding, or
 *   when an audit itself cannot run; prints suppressed exceptions for review.
 * @example await runGate() => 0
 ***/
export async function runGate() {
	const allowlist = loadAuditAllowlist();
	let blocking = [];
	let suppressed = [];
	const seenSources = new Set();
	for (const workspaceName of WORKSPACES) {
		const { label, json, failed } = runWorkspaceAudit(workspaceName);
		if (failed) {
			console.error(`check-dep-audit: ${label}: ${failed}`);
			return 1;
		}
		const verdict = evaluateAudit(label, json, allowlist);
		blocking = blocking.concat(verdict.blocking);
		suppressed = suppressed.concat(verdict.suppressed);
		for (const entry of verdict.blocking.concat(verdict.suppressed)) {
			for (const item of entry.sources) seenSources.add(item.source);
		}
	}
	for (const entry of liveAdvisorySources(allowlist)) {
		if (!seenSources.has(entry)) {
			console.log(`check-dep-audit: allowlist entry #${entry} matched no current finding — remove it if the fix landed.`);
		}
	}
	for (const entry of suppressed) {
		console.log(
			`check-dep-audit: allowed ${entry.severity} ${entry.module}@${entry.workspace} (${entry.sources.map((item) => `#${item.source}`).join(",")}) — allowlisted, see scripts/dep-audit-allowlist.json`,
		);
	}
	if (blocking.length > 0) {
		console.error(`check-dep-audit: ${blocking.length} non-allowlisted high/critical finding(s):`);
		for (const entry of blocking) {
			console.error(
				`  - [${entry.severity}] ${entry.module}@${entry.workspace} range ${entry.range} (${entry.sources.map((item) => `#${item.source} ${item.title}`).join("; ") || "no advisory id"})`,
			);
		}
		console.error("Fix the finding (preferred) or add a dated entry to scripts/dep-audit-allowlist.json.");
		return 1;
	}
	console.log("check-dep-audit: no non-allowlisted high/critical findings.");
	return 0;
}

/***
 * MARK: runReport
 * @description Prints the outdated/audit/depcheck health summary for every
 *   workspace (`npm run audit:deprecations`); informational, always exits 0.
 * @example await runReport() => 0
 ***/
export async function runReport() {
	for (const workspaceName of WORKSPACES) {
		const label = workspaceName === "" ? "(root)" : workspaceName;
		console.log(`\n### ${label}`);
		const outdated = spawnSync("npm", ["outdated", ...(workspaceName ? ["--prefix", workspaceName] : [])], {
			cwd: repoRoot,
			encoding: "utf8",
		});
		console.log("--- npm outdated ---");
		console.log((outdated.stdout || "(all current)").trim());
		const { json, failed } = runWorkspaceAudit(workspaceName);
		console.log("--- npm audit (moderate+) ---");
		if (failed) {
			console.log(failed);
		} else {
			console.log(JSON.stringify(json?.metadata?.vulnerabilities ?? {}, null, 0));
		}
	}
	console.log("\n--- depcheck ---");
	const depcheck = spawnSync("npm", ["run", "depcheck"], { cwd: repoRoot, encoding: "utf8" });
	console.log(((depcheck.stdout || "") + (depcheck.stderr || "")).trim().slice(-2000));
	return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	const status = process.argv.includes("--report") ? await runReport() : await runGate();
	process.exit(status);
}
