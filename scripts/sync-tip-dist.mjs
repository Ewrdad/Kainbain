#!/usr/bin/env node
/***
 * MARK: sync-tip-dist.mjs
 * @description Copies publish output from a tip-worktree dist/ back to the
 *   primary checkout's dist/ so update.sh (which reads the primary dist by
 *   default) can see releases published from the detached tip worktree.
 *   A publish that re-exec'd into the tip worktree writes dist/ THERE, while
 *   update.sh diffs the PRIMARY dist against the installed manifest — without
 *   this sync-back the new release is stranded and update reports "already
 *   current" (2026-11-02: tip published 674ae08, primary/apps stayed 06e8949).
 *   Also records the just-published release in the last-publish pointer file
 *   the Update stage feeds to update.sh --expect-commit.
 *
 *   Sync rules (idempotent, safe to re-run):
 *   - manifest: copied when missing or when its commit moved.
 *   - history: tip lines whose commit is absent are appended (primary
 *     lineage is preserved, never rewritten).
 *   - runner tarballs: copied when absent from the primary dist.
 *
 *   Warn-only contract: this script exits 0 in every case, including skips
 *   and failures, so it can never fail a publish that already pushed images.
 *   Callers check stdout ("synced ...", "skipped ...") for what happened.
 * @example KAINBAIN_PUBLISH_FROM_TIP_WORKTREE=1 SYNC_PRIMARY_TOP=/repo node scripts/sync-tip-dist.mjs
 ***/

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/***
 * MARK: readManifestCommit
 * @description Reads the commit field from a release-manifest.json file.
 * @example readManifestCommit("dist/release-manifest.json") => "674ae08d6b..." or ""
 * @param {string} file - Path to the manifest file.
 * @returns {string} The commit string, or "" when unreadable/absent.
 ***/
export function readManifestCommit(file) {
	try {
		const m = JSON.parse(fs.readFileSync(file, "utf8"));
		return typeof m?.commit === "string" ? m.commit : "";
	} catch {
		return "";
	}
}

/***
 * MARK: historyCommits
 * @description Collects the commit values present in a release-history.jsonl file.
 * @example historyCommits("dist/release-history.jsonl") => new Set(["abc...", "def..."])
 * @param {string} file - Path to the history file.
 * @returns {Set<string>} Commits already recorded (empty when unreadable).
 ***/
export function historyCommits(file) {
	const out = new Set();
	try {
		for (const line of fs.readFileSync(file, "utf8").split("\n")) {
			if (!line.trim()) continue;
			try {
				const c = JSON.parse(line)?.commit;
				if (typeof c === "string" && c) out.add(c);
			} catch {
				/* skip malformed lines */
			}
		}
	} catch {
		/* missing file means no commits recorded */
	}
	return out;
}

/***
 * MARK: commitOfLine
 * @description Extracts the commit value from one release-history.jsonl line.
 * @example commitOfLine('{"commit":"abc","publishedAt":"..."}') => "abc"
 * @param {string} line - One JSON line.
 * @returns {string} The commit string, or "" when unparseable.
 ***/
export function commitOfLine(line) {
	try {
		const c = JSON.parse(line)?.commit;
		return typeof c === "string" ? c : "";
	} catch {
		return "";
	}
}

/***
 * MARK: syncTipDist
 * @description Performs the manifest/history/tarball sync plus the pointer
 *   write. Pure side effects on the two dist directories; never throws.
 * @example syncTipDist({ tipDist: "a/dist", primaryDist: "b/dist", ... }) => { syncedManifest: true, ... }
 * @param {object} opts - Sync options.
 * @param {string} opts.tipDist - Tip-worktree dist directory (source of truth).
 * @param {string} opts.primaryDist - Primary checkout dist directory (target).
 * @param {string[]} opts.published - Components just published (for the pointer).
 * @param {string} opts.short - Short SHA just published (for the pointer).
 * @param {string} opts.pointerFile - Where to write the last-publish pointer.
 * @returns {object} Counts/flags describing what was synced.
 ***/
export function syncTipDist({ tipDist, primaryDist, published = [], short = "", pointerFile = "" }) {
	const result = {
		syncedManifest: false,
		appendedHistory: 0,
		copiedTarballs: [],
		pointerWritten: false,
	};
	const tipManifest = path.join(tipDist, "release-manifest.json");
	const primaryManifest = path.join(primaryDist, "release-manifest.json");
	const tipCommit = readManifestCommit(tipManifest);
	if (!tipCommit) return { ...result, warning: `no tip manifest commit in ${tipManifest}` };
	fs.mkdirSync(primaryDist, { recursive: true });
	if (readManifestCommit(primaryManifest) !== tipCommit) {
		fs.copyFileSync(tipManifest, primaryManifest);
		result.syncedManifest = true;
	}
	const tipHistory = path.join(tipDist, "release-history.jsonl");
	const primaryHistory = path.join(primaryDist, "release-history.jsonl");
	if (fs.existsSync(tipHistory)) {
		if (!fs.existsSync(primaryHistory)) {
			fs.copyFileSync(tipHistory, primaryHistory);
			result.appendedHistory = historyCommits(tipHistory).size;
		} else {
			const seen = historyCommits(primaryHistory);
			for (const line of fs.readFileSync(tipHistory, "utf8").split("\n")) {
				if (!line.trim()) continue;
				const c = commitOfLine(line);
				if (c && !seen.has(c)) {
					fs.appendFileSync(primaryHistory, line + "\n");
					seen.add(c);
					result.appendedHistory += 1;
				}
			}
		}
	}
	for (const entry of fs.readdirSync(tipDist)) {
		if (!/^kainbain-runner-.*\.tar\.gz$/.test(entry)) continue;
		if (!fs.existsSync(path.join(primaryDist, entry))) {
			fs.copyFileSync(path.join(tipDist, entry), path.join(primaryDist, entry));
			result.copiedTarballs.push(entry);
		}
	}
	if (pointerFile) {
		const manifest = JSON.parse(fs.readFileSync(tipManifest, "utf8"));
		fs.mkdirSync(path.dirname(pointerFile), { recursive: true });
		fs.writeFileSync(
			pointerFile,
			JSON.stringify(
				{
					commit: tipCommit,
					short,
					publishedAt: manifest?.publishedAt ?? new Date().toISOString(),
					components: published,
				},
				null,
				2,
			) + "\n",
		);
		result.pointerWritten = true;
	}
	return result;
}

/***
 * MARK: sync CLI
 * @description `SYNC_PRIMARY_TOP=/repo node scripts/sync-tip-dist.mjs`: env-driven
 *   entry point used by publish.sh after a tip-worktree publish. Skips (exit 0)
 *   unless KAINBAIN_PUBLISH_FROM_TIP_WORKTREE=1 with a distinct primary top.
 ***/
const invokedAsScript =
	typeof process.argv[1] === "string" && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (invokedAsScript) {
	try {
		// Either re-exec marker counts: publish.sh's own tip re-exec
		// (KAINBAIN_PUBLISH_FROM_TIP_WORKTREE) or deploy.sh's tip re-exec
		// (KAINBAIN_DEPLOY_FROM_TIP_WORKTREE, set before deploy.sh invokes
		// publish.sh). Checking only the first stranded every pipeline
		// release in the tip worktree (task a654a254, 2026-11-02).
		if (
			process.env.KAINBAIN_PUBLISH_FROM_TIP_WORKTREE !== "1" &&
			process.env.KAINBAIN_DEPLOY_FROM_TIP_WORKTREE !== "1"
		) {
			console.log("sync-tip-dist: skipped (not a tip-worktree publish).");
			process.exit(0);
		}
		const tipTop = process.cwd();
		const primaryTop = process.env.SYNC_PRIMARY_TOP || "";
		if (!primaryTop || path.resolve(primaryTop) === path.resolve(tipTop)) {
			console.log("sync-tip-dist: skipped (primary checkout not resolved).");
			process.exit(0);
		}
		const published = (process.env.SYNC_PUBLISHED || "").trim().split(/\s+/).filter(Boolean);
		const pointerFile =
			process.env.KAINBAIN_LAST_PUBLISH_FILE ||
			path.join(os.homedir(), ".kainbain", "deploy", "last-publish.json");
		const result = syncTipDist({
			tipDist: path.join(tipTop, "dist"),
			primaryDist: path.join(primaryTop, "dist"),
			published,
			short: process.env.SYNC_SHORTSHA || "",
			pointerFile,
		});
		if (result.warning) {
			console.error(`sync-tip-dist: warning: ${result.warning}`);
			process.exit(0);
		}
		console.log(
			`sync-tip-dist: synced to ${primaryTop}/dist ` +
				`(manifest=${result.syncedManifest}, history+=${result.appendedHistory}, ` +
				`tarballs=${result.copiedTarballs.length}, pointer=${result.pointerWritten}).`,
		);
	} catch (err) {
		console.error(`sync-tip-dist: warning: ${err?.message || err}`);
	}
	process.exit(0);
}
