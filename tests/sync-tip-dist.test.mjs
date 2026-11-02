import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "sync-tip-dist.mjs");

const manifest = (commit, extra = {}) => ({
	commit,
	publishedAt: "2026-11-02T02:03:02.757Z",
	components: {
		backend: { apiVersion: "1.0.0", tag: `1.0.0-${commit.slice(0, 7)}` },
		...extra,
	},
});
const historyLine = (commit) => JSON.stringify({ publishedAt: "2026-11-02T02:03:02.757Z", commit, components: {} });

// Fixture pair: tip dist holds the fresh publish, primary dist is stale.
const setup = () => {
	const base = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-sync-tip-"));
	const tip = path.join(base, "tip", "dist");
	const primary = path.join(base, "primary", "dist");
	fs.mkdirSync(tip, { recursive: true });
	fs.mkdirSync(primary, { recursive: true });
	fs.writeFileSync(path.join(tip, "release-manifest.json"), JSON.stringify(manifest("newsha")) + "\n");
	fs.writeFileSync(
		path.join(tip, "release-history.jsonl"),
		historyLine("oldsha") + "\n" + historyLine("newsha") + "\n",
	);
	fs.writeFileSync(path.join(tip, "kainbain-runner-newsha.tar.gz"), "tarball\n");
	fs.writeFileSync(path.join(primary, "release-manifest.json"), JSON.stringify(manifest("oldsha")) + "\n");
	fs.writeFileSync(path.join(primary, "release-history.jsonl"), historyLine("oldsha") + "\n");
	const pointer = path.join(base, "last-publish.json");
	return { base, tip, tipTop: path.join(base, "tip"), primary, primaryTop: path.join(base, "primary"), pointer };
};
const run = (tipTop, env = {}) =>
	spawnSync("node", [SCRIPT], {
		cwd: tipTop,
		encoding: "utf8",
		env: { ...process.env, ...env },
	});

describe("scripts/sync-tip-dist.mjs", () => {
	it("skips (exit 0, primary untouched) without the tip-worktree marker", () => {
		const { tipTop, primaryTop, primary, pointer } = setup();
		const r = run(tipTop, { SYNC_PRIMARY_TOP: primaryTop });
		assert.equal(r.status, 0, r.stderr + r.stdout);
		assert.match(r.stdout, /skipped/);
		assert.ok(!fs.existsSync(pointer));
		assert.equal(JSON.parse(fs.readFileSync(path.join(primary, "release-manifest.json"), "utf8")).commit, "oldsha");
	});

	it("syncs manifest, appends unseen history, copies tarballs, writes the pointer", () => {
		const { tipTop, primaryTop, primary, pointer } = setup();
		const r = run(tipTop, {
			KAINBAIN_PUBLISH_FROM_TIP_WORKTREE: "1",
			SYNC_PRIMARY_TOP: primaryTop,
			SYNC_PUBLISHED: "backend frontend",
			SYNC_SHORTSHA: "newsha",
			KAINBAIN_LAST_PUBLISH_FILE: pointer,
		});
		assert.equal(r.status, 0, r.stderr + r.stdout);
		assert.match(r.stdout, /synced to .*\/dist/);
		assert.equal(JSON.parse(fs.readFileSync(path.join(primary, "release-manifest.json"), "utf8")).commit, "newsha");
		const history = fs.readFileSync(path.join(primary, "release-history.jsonl"), "utf8").trim().split("\n");
		assert.deepEqual(
			history.map((l) => JSON.parse(l).commit),
			["oldsha", "newsha"],
		);
		assert.equal(fs.readFileSync(path.join(primary, "kainbain-runner-newsha.tar.gz"), "utf8"), "tarball\n");
		assert.deepEqual(JSON.parse(fs.readFileSync(pointer, "utf8")), {
			commit: "newsha",
			short: "newsha",
			publishedAt: "2026-11-02T02:03:02.757Z",
			components: ["backend", "frontend"],
		});
	});

	it("syncs under deploy.sh's tip re-exec marker alone (pipeline Publish path)", () => {
		const { tipTop, primaryTop, primary, pointer } = setup();
		const r = run(tipTop, {
			KAINBAIN_DEPLOY_FROM_TIP_WORKTREE: "1",
			SYNC_PRIMARY_TOP: primaryTop,
			SYNC_PUBLISHED: "backend frontend runner",
			SYNC_SHORTSHA: "newsha",
			KAINBAIN_LAST_PUBLISH_FILE: pointer,
		});
		assert.equal(r.status, 0, r.stderr + r.stdout);
		assert.match(r.stdout, /synced to .*\/dist/);
		assert.equal(JSON.parse(fs.readFileSync(path.join(primary, "release-manifest.json"), "utf8")).commit, "newsha");
		assert.equal(JSON.parse(fs.readFileSync(pointer, "utf8")).commit, "newsha");
	});

	it("is idempotent: a second run appends no duplicate history", () => {
		const { tipTop, primaryTop, primary, pointer } = setup();
		const env = {
			KAINBAIN_PUBLISH_FROM_TIP_WORKTREE: "1",
			SYNC_PRIMARY_TOP: primaryTop,
			KAINBAIN_LAST_PUBLISH_FILE: pointer,
		};
		assert.equal(run(tipTop, env).status, 0);
		assert.equal(run(tipTop, env).status, 0);
		const history = fs.readFileSync(path.join(primary, "release-history.jsonl"), "utf8").trim().split("\n");
		assert.deepEqual(
			history.map((l) => JSON.parse(l).commit),
			["oldsha", "newsha"],
		);
	});

	it("leaves an already-current primary manifest alone", () => {
		const { tipTop, primaryTop, primary, pointer } = setup();
		fs.writeFileSync(path.join(primary, "release-manifest.json"), JSON.stringify(manifest("newsha")) + "\n");
		const before = fs.statSync(path.join(primary, "release-manifest.json")).mtimeMs;
		const r = run(tipTop, {
			KAINBAIN_PUBLISH_FROM_TIP_WORKTREE: "1",
			SYNC_PRIMARY_TOP: primaryTop,
			KAINBAIN_LAST_PUBLISH_FILE: pointer,
		});
		assert.equal(r.status, 0, r.stderr + r.stdout);
		assert.equal(fs.statSync(path.join(primary, "release-manifest.json")).mtimeMs, before);
	});
});
