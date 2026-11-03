import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WRAPPER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "bin", "kainbain-runner");

const haveBash = () => {
	try {
		const probed = spawnSync("bash", ["--version"], { stdio: "ignore" });
		return probed.status === 0;
	} catch {
		return false;
	}
};

// A fake install root: releases/<v>/unpacked/runner/main.js per version,
// plus the `current` symlink the wrapper resolves. The fake entrypoints
// are plain node scripts (the wrapper runs `node <tree>/runner/main.js`).
const fakeInstall = () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "kb-wrapper-"));
	const treeFor = (version) => {
		const unpacked = path.join(root, "releases", version, "unpacked");
		fs.mkdirSync(path.join(unpacked, "runner"), { recursive: true });
		return unpacked;
	};
	const writeEntry = (version, body) => {
		fs.writeFileSync(path.join(treeFor(version), "runner", "main.js"), body);
	};
	const pointCurrentAt = (version) => {
		const link = path.join(root, "current");
		try { fs.rmSync(link, { force: true }); } catch { /* ignore */ }
		fs.symlinkSync(treeFor(version), link);
	};
	return { root, writeEntry, pointCurrentAt };
};

const runWrapper = (root) =>
	spawnSync("bash", [WRAPPER], {
		env: { ...process.env, KAINBAIN_RUNNER_INSTALL_ROOT: root },
		encoding: "utf8",
	});

describe("kainbain-runner wrapper restart gate", () => {
	it("stops after a normal completion instead of re-running finished work", () => {
		if (!haveBash()) return;
		const { root, writeEntry, pointCurrentAt } = fakeInstall();
		const marker = path.join(root, "ran-v1");
		writeEntry("0.1.0", `require("fs").writeFileSync(${JSON.stringify(marker)}, "ran");\n`);
		pointCurrentAt("0.1.0");
		const got = runWrapper(root);
		assert.equal(got.status, 0);
		assert.ok(fs.existsSync(marker), "the installed tree ran once");
		assert.ok(!String(got.stdout || "").includes("restarting into"), "no restart without a staged update");
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("restarts exactly once into a staged update, then stops", () => {
		if (!haveBash()) return;
		const { root, writeEntry, pointCurrentAt } = fakeInstall();
		const markerV2 = path.join(root, "ran-v2");
		const v2Tree = path.join(root, "releases", "0.2.0", "unpacked");
		fs.mkdirSync(path.join(v2Tree, "runner"), { recursive: true });
		// v1 stages an update (flips `current`, like applyUpdate does) and
		// exits 0; v2 boots cleanly with nothing new staged.
		writeEntry(
			"0.1.0",
			`require("fs").symlinkSync(${JSON.stringify(v2Tree)}, ${JSON.stringify(path.join(root, "current.tmp"))});\n` +
				`require("fs").renameSync(${JSON.stringify(path.join(root, "current.tmp"))}, ${JSON.stringify(path.join(root, "current"))});\n`,
		);
		fs.writeFileSync(
			path.join(v2Tree, "runner", "main.js"),
			`require("fs").writeFileSync(${JSON.stringify(markerV2)}, "ran");\n`,
		);
		pointCurrentAt("0.1.0");
		const got = runWrapper(root);
		assert.equal(got.status, 0);
		assert.ok(fs.existsSync(markerV2), "the wrapper rebooted into the staged version");
		assert.ok(String(got.stdout || "").includes("restarting into"), "the restart is announced");
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("propagates a daemon failure without restarting", () => {
		if (!haveBash()) return;
		const { root, writeEntry, pointCurrentAt } = fakeInstall();
		writeEntry("0.1.0", `process.exit(3);\n`);
		pointCurrentAt("0.1.0");
		const got = runWrapper(root);
		assert.equal(got.status, 3);
		assert.ok(!String(got.stdout || "").includes("restarting into"), "a crash never restarts");
		fs.rmSync(root, { recursive: true, force: true });
	});
});
