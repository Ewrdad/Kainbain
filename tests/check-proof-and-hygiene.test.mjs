import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	checkFileMagic,
	checkTree,
	formatFailure,
	formatKnown,
	isProofPath,
	isRootScratch,
	loadAllowlist,
	loadBaseline,
	magicForExtension,
	matchBaseline,
	matchScratchPattern,
} from "../scripts/check-proof-and-hygiene.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHECKER = path.join(HERE, "..", "scripts", "check-proof-and-hygiene.mjs");

/***
 * MARK: makeFixtureTree
 * @description Builds a scratch fixture tree under the OS temp dir with the
 *   given repo-relative files (parents created on demand). Callers remove
 *   the tree with fs.rmSync(..., { recursive: true }).
 ***/
function makeFixtureTree(files) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "proof-hygiene-"));
	for (const [relPath, content] of Object.entries(files)) {
		const full = path.join(root, relPath);
		fs.mkdirSync(path.dirname(full), { recursive: true });
		fs.writeFileSync(full, content);
	}
	return root;
}

const VALID_PNG = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
// The 5a38ad45 corruption signature: U+FFFD (ef bf bd) where 0x89 belongs.
const CORRUPT_PNG = Buffer.from([
	0xef, 0xbf, 0xbd, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);

describe("magicForExtension", () => {
	it("pins PNG magic first", () => {
		assert.equal(magicForExtension(".png"), "89504e47");
	});

	it("covers JPEG, GIF, and WebP", () => {
		assert.equal(magicForExtension(".jpg"), "ffd8ff");
		assert.equal(magicForExtension(".jpeg"), "ffd8ff");
		assert.equal(magicForExtension(".gif"), "47494638");
		assert.equal(magicForExtension(".webp"), "52494646-57454250");
	});

	it("is case-insensitive and tolerates a missing dot", () => {
		assert.equal(magicForExtension(".PNG"), "89504e47");
		assert.equal(magicForExtension("JPG"), "ffd8ff");
	});

	it("returns null for unknown extensions", () => {
		assert.equal(magicForExtension(".svg"), null);
		assert.equal(magicForExtension(".mp4"), null);
	});
});

describe("isProofPath", () => {
	it("matches images under docs/tasks regardless of name", () => {
		assert.equal(isProofPath("docs/tasks/abc/pretty-proof.png"), true);
		assert.equal(isProofPath("docs/tasks/abc/shot.jpg"), true);
	});

	it("matches proof/screenshot image names outside docs/tasks", () => {
		assert.equal(isProofPath("docs/manual/screenshot-login.png"), true);
		assert.equal(isProofPath("docs/manual/flow-proof.gif"), true);
	});

	it("ignores non-images, even with proof names", () => {
		assert.equal(isProofPath("docs/tasks/abc/notes.md"), false);
		assert.equal(isProofPath("docs/tasks/abc/diagram-proof.svg"), false);
	});

	it("ignores images that are not proof artifacts", () => {
		assert.equal(isProofPath("api/work/icon.png"), false);
		assert.equal(isProofPath("frontend/src/logo.webp"), false);
	});
});

describe("isRootScratch", () => {
	it("flags each scratch shape at the root", () => {
		for (const name of ["rt.mjs", "rt.js", "repro.mjs", "probe.cjs", "debug.log", "out.tmp", "shot.png", "t1.json"]) {
			assert.equal(isRootScratch(name, []), true, name);
		}
	});

	it("passes legitimate root files", () => {
		for (const name of ["package.json", "README.md", "deploy.sh", "Dockerfile", "CHANGELOG.md"]) {
			assert.equal(isRootScratch(name, []), false, name);
		}
	});

	it("ignores nested files, even scratch-shaped ones", () => {
		assert.equal(isRootScratch("docs/tasks/x.png", []), false);
		assert.equal(isRootScratch("scripts/rt.mjs", []), false);
	});

	it("honours exact-path allowlist entries", () => {
		assert.equal(isRootScratch("rt.mjs", ["rt.mjs"]), false);
		assert.equal(isRootScratch("other.mjs", ["rt.mjs"]), true);
	});
});

describe("matchScratchPattern", () => {
	it("names the matched pattern for messages", () => {
		assert.equal(matchScratchPattern("rt.mjs"), "rt.*");
		assert.equal(matchScratchPattern("debug.log"), "*.log");
	});

	it("returns null when nothing matches", () => {
		assert.equal(matchScratchPattern("package.json"), null);
	});
});

describe("checkFileMagic", () => {
	it("passes a valid PNG", () => {
		const root = makeFixtureTree({ "ok.png": VALID_PNG });
		try {
			const result = checkFileMagic(path.join(root, "ok.png"));
			assert.equal(result.ok, true);
			assert.equal(result.expected, "89504e47");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("fails the text-corrupted PNG with expected vs actual magic", () => {
		const root = makeFixtureTree({ "bad.png": CORRUPT_PNG });
		try {
			const result = checkFileMagic(path.join(root, "bad.png"));
			assert.equal(result.ok, false);
			assert.equal(result.expected, "89504e47");
			assert.ok(result.actual.startsWith("efbfbd"), `actual was ${result.actual}`);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("passes a valid JPEG prefix", () => {
		const root = makeFixtureTree({ "ok.jpg": Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]) });
		try {
			assert.equal(checkFileMagic(path.join(root, "ok.jpg")).ok, true);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("validates WebP on both the RIFF and WEBP markers", () => {
		const good = Buffer.from("RIFF\x00\x00\x00\x00WEBP chambers");
		const bad = Buffer.from("RIFF\x00\x00\x00\x00XXXX chambers");
		const root = makeFixtureTree({ "good.webp": good, "bad.webp": bad });
		try {
			assert.equal(checkFileMagic(path.join(root, "good.webp")).ok, true);
			const result = checkFileMagic(path.join(root, "bad.webp"));
			assert.equal(result.ok, false);
			assert.equal(result.expected, "52494646-57454250");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("skips unknown extensions and missing files instead of failing", () => {
		const root = makeFixtureTree({ "notes.svg": Buffer.from("<svg/>") });
		try {
			const svg = checkFileMagic(path.join(root, "notes.svg"));
			assert.equal(svg.ok, true);
			assert.ok(svg.skipped);
			const missing = checkFileMagic(path.join(root, "gone.png"));
			assert.equal(missing.ok, true);
			assert.ok(missing.skipped);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("formatFailure", () => {
	it("names the file with expected vs actual magic and a remedy", () => {
		const text = formatFailure({
			kind: "magic",
			relPath: "docs/tasks/x/pretty-proof.png",
			expected: "89504e47",
			actual: "efbfbd50",
		});
		assert.match(text, /docs\/tasks\/x\/pretty-proof\.png/);
		assert.match(text, /expected magic 89504e47, found efbfbd50/);
		assert.match(text, /xxd -l 8/);
	});

	it("names the scratch pattern and the remedy", () => {
		const text = formatFailure({ kind: "scratch", relPath: "rt.mjs", pattern: "rt.*" });
		assert.match(text, /rt\.mjs/);
		assert.match(text, /rt\.\*/);
		assert.match(text, /repo-root-files\.json/);
	});
});

describe("loadAllowlist", () => {
	it("reads the shipped allowlist file", () => {
		const repoRoot = path.resolve(HERE, "..");
		assert.ok(Array.isArray(loadAllowlist(repoRoot)));
	});

	it("degrades to an empty list outside a repo checkout", () => {
		assert.deepEqual(loadAllowlist(path.join(os.tmpdir(), "proof-hygiene-nope")), []);
	});
});

describe("checkTree acceptance scenarios", () => {
	it("fails a committed-style corrupt PNG naming file and expected vs actual", () => {
		const root = makeFixtureTree({ "docs/tasks/demo/pretty-proof.png": CORRUPT_PNG });
		try {
			const { magicViolations, scratchViolations } = checkTree({ root, allowlist: [] });
			assert.equal(magicViolations.length, 1);
			assert.equal(scratchViolations.length, 0);
			const line = formatFailure(magicViolations[0]);
			assert.match(line, /pretty-proof\.png/);
			assert.match(line, /expected magic 89504e47, found efbfbd/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("fails a root scratch file", () => {
		const root = makeFixtureTree({ "rt.mjs": Buffer.from("import x from './nope';\n") });
		try {
			const { magicViolations, scratchViolations } = checkTree({ root, allowlist: [] });
			assert.equal(magicViolations.length, 0);
			assert.equal(scratchViolations.length, 1);
			assert.equal(scratchViolations[0].relPath, "rt.mjs");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("passes a valid PNG proof with a clean root", () => {
		const root = makeFixtureTree({
			"docs/tasks/demo/pretty-proof.png": VALID_PNG,
			"package.json": Buffer.from("{}\n"),
		});
		try {
			const { magicViolations, scratchViolations } = checkTree({ root, allowlist: [] });
			assert.deepEqual(magicViolations, []);
			assert.deepEqual(scratchViolations, []);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("baseline", () => {
	it("loads the shipped baseline with the recorded bytes", () => {
		const repoRoot = path.resolve(HERE, "..");
		const baseline = loadBaseline(repoRoot);
		assert.ok(baseline.length >= 11);
		for (const entry of baseline) {
			assert.ok(entry.relPath.endsWith(".png"));
			assert.equal(entry.expected, "89504e47");
			assert.ok(entry.actual.startsWith("efbfbd"));
			assert.ok(entry.note.length > 0);
		}
	});

	it("degrades to an empty list outside a repo checkout", () => {
		assert.deepEqual(loadBaseline(path.join(os.tmpdir(), "proof-hygiene-nope")), []);
	});

	it("covers a violation only while its bytes still match the recording", () => {
		const baseline = [
			{ relPath: "docs/tasks/x/p.png", expected: "89504e47", actual: "efbfbd50", note: "old" },
		];
		const same = matchBaseline({ relPath: "docs/tasks/x/p.png", expected: "89504e47", actual: "efbfbd50" }, baseline);
		assert.equal(same.note, "old");
		assert.equal(matchBaseline({ relPath: "docs/tasks/x/p.png", expected: "89504e47", actual: "00000000" }, baseline), null);
		assert.equal(matchBaseline({ relPath: "docs/tasks/y/p.png", expected: "89504e47", actual: "efbfbd50" }, baseline), null);
	});

	it("files baselined violations as known instead of failing", () => {
		const root = makeFixtureTree({ "docs/tasks/x/p.png": CORRUPT_PNG });
		try {
			const baseline = [
				{ relPath: "docs/tasks/x/p.png", expected: "89504e47", actual: "efbfbd504e470d0a", note: "recorded" },
			];
			const result = checkTree({ root, allowlist: [], baseline });
			assert.deepEqual(result.magicViolations, []);
			assert.equal(result.knownViolations.length, 1);
			assert.match(formatKnown(result.knownViolations[0]), /known pre-existing issue/);
			assert.match(formatKnown(result.knownViolations[0]), /p\.png/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("re-fails a baselined path whose bytes changed", () => {
		const root = makeFixtureTree({ "docs/tasks/x/p.png": Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]) });
		try {
			const baseline = [
				{ relPath: "docs/tasks/x/p.png", expected: "89504e47", actual: "efbfbd504e470d0a", note: "recorded" },
			];
			const result = checkTree({ root, allowlist: [], baseline });
			assert.equal(result.magicViolations.length, 1);
			assert.deepEqual(result.knownViolations, []);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("CLI exit contract", () => {
	function runCli(root) {
		return spawnSync(process.execPath, [CHECKER, "--root", root], { encoding: "utf8" });
	}

	it("exits 1 naming the corrupt PNG with expected vs actual", () => {
		const root = makeFixtureTree({ "docs/tasks/demo/pretty-proof.png": CORRUPT_PNG });
		try {
			const result = runCli(root);
			assert.equal(result.status, 1);
			assert.match(result.stderr, /pretty-proof\.png/);
			assert.match(result.stderr, /expected magic 89504e47, found efbfbd/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("exits 1 on a root scratch file", () => {
		const root = makeFixtureTree({ "rt.mjs": Buffer.from("import x from './nope';\n") });
		try {
			const result = runCli(root);
			assert.equal(result.status, 1);
			assert.match(result.stderr, /rt\.mjs/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("exits 0 on a valid PNG proof with a clean root", () => {
		const root = makeFixtureTree({
			"docs/tasks/demo/pretty-proof.png": VALID_PNG,
			"package.json": Buffer.from("{}\n"),
		});
		try {
			const result = runCli(root);
			assert.equal(result.status, 0);
			assert.match(result.stdout, /OK/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("exits 0 by default but 1 under --strict on a baselined violation", () => {
		const root = makeFixtureTree({
			"docs/tasks/demo/pretty-proof.png": CORRUPT_PNG,
			"scripts/baselines/proof-hygiene-known-violations.json": Buffer.from(JSON.stringify({
				violations: [{
					relPath: "docs/tasks/demo/pretty-proof.png",
					expected: "89504e47",
					actual: "efbfbd504e470d0a",
					note: "recorded for this test",
				}],
			})),
		});
		try {
			const lax = spawnSync(process.execPath, [CHECKER, "--root", root], { encoding: "utf8" });
			assert.equal(lax.status, 0);
			assert.match(lax.stdout, /known pre-existing/);
			const strict = spawnSync(process.execPath, [CHECKER, "--root", root, "--strict"], { encoding: "utf8" });
			assert.equal(strict.status, 1);
			assert.match(strict.stderr, /pretty-proof\.png/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
