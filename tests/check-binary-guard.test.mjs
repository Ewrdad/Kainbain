import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	BINARY_MAGIC,
	binaryMagicForExtension,
	checkBinaryMagic,
	checkPaths,
	formatGuardFailure,
	isGuardedPath,
	listChangedFiles,
	main,
	parsePorcelainZero,
} from "../scripts/check-binary-guard.mjs";
import { MAGIC_TABLE } from "../scripts/check-proof-and-hygiene.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, "..", "scripts", "check-binary-guard.mjs");

/***
 * MARK: makeFixtureTree
 * @description Builds a scratch fixture tree under the OS temp dir with the
 *   given repo-relative files (parents created on demand). Callers remove
 *   the tree with fs.rmSync(..., { recursive: true }).
 ***/
function makeFixtureTree(files) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "binary-guard-"));
	for (const [relPath, content] of Object.entries(files)) {
		const full = path.join(root, relPath);
		fs.mkdirSync(path.dirname(full), { recursive: true });
		fs.writeFileSync(full, content);
	}
	return root;
}

/***
 * MARK: makeGitTree
 * @description Builds a fixture tree that is also a git repository, so the
 *   guard's changed-file modes can run without touching the real checkout.
 ***/
function makeGitTree(files) {
	const root = makeFixtureTree(files);
	execFileSync("git", ["init", "-q"], { cwd: root });
	execFileSync("git", ["config", "user.email", "guard-test@example.com"], { cwd: root });
	execFileSync("git", ["config", "user.name", "guard-test"], { cwd: root });
	return root;
}

const VALID_PNG = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
// The text-round-trip corruption signature: U+FFFD (ef bf bd) where 0x89 belongs.
const CORRUPT_PNG = Buffer.from([
	0xef, 0xbf, 0xbd, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);
const VALID_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
const CORRUPT_ZIP = Buffer.from([0xef, 0xbf, 0xbd, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const VALID_GZIP = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]);

describe("BINARY_MAGIC", () => {
	it("reuses the detector magic for every image type (single source of truth)", () => {
		for (const [ext, magic] of Object.entries(MAGIC_TABLE)) {
			assert.equal(BINARY_MAGIC[ext], magic, ext);
		}
	});

	it("extends coverage to archive binaries so future types slot in as data", () => {
		assert.equal(BINARY_MAGIC[".zip"], "504b0304");
		assert.equal(BINARY_MAGIC[".gz"], "1f8b");
		assert.equal(BINARY_MAGIC[".tgz"], "1f8b");
	});
});

describe("binaryMagicForExtension", () => {
	it("pins PNG magic first", () => {
		assert.equal(binaryMagicForExtension(".png"), "89504e47");
	});

	it("is case-insensitive and tolerates a missing dot", () => {
		assert.equal(binaryMagicForExtension(".PNG"), "89504e47");
		assert.equal(binaryMagicForExtension("ZIP"), "504b0304");
	});

	it("returns null for unknown extensions and bad input instead of throwing", () => {
		assert.equal(binaryMagicForExtension(".svg"), null);
		assert.equal(binaryMagicForExtension(".mp4"), null);
		assert.equal(binaryMagicForExtension(""), null);
		assert.equal(binaryMagicForExtension(undefined), null);
		assert.equal(binaryMagicForExtension(null), null);
	});
});

describe("isGuardedPath", () => {
	it("guards proof images under docs/tasks", () => {
		assert.equal(isGuardedPath("docs/tasks/abc/pretty-proof.png"), true);
	});

	it("guards binary extensions anywhere (broader than proof paths)", () => {
		assert.equal(isGuardedPath("frontend/src/logo.png"), true);
		assert.equal(isGuardedPath("docs/bundle.zip"), true);
		assert.equal(isGuardedPath("evidence/archive.tgz"), true);
	});

	it("ignores text and unknown extensions", () => {
		assert.equal(isGuardedPath("docs/tasks/abc/notes.md"), false);
		assert.equal(isGuardedPath("docs/tasks/abc/diagram-proof.svg"), false);
	});

	it("matches ./-prefixed and backslash paths the same as bare ones", () => {
		assert.equal(isGuardedPath("./docs/tasks/abc/p.png"), true);
		assert.equal(isGuardedPath("docs\\tasks\\abc\\p.png"), true);
	});

	it("returns false for missing or non-string input instead of throwing", () => {
		assert.equal(isGuardedPath(""), false);
		assert.equal(isGuardedPath(undefined), false);
		assert.equal(isGuardedPath(null), false);
	});
});

describe("checkBinaryMagic", () => {
	it("passes a valid PNG", () => {
		const root = makeFixtureTree({ "ok.png": VALID_PNG });
		try {
			const result = checkBinaryMagic(path.join(root, "ok.png"));
			assert.equal(result.ok, true);
			assert.equal(result.expected, "89504e47");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("fails the text-corrupted PNG with expected vs actual magic", () => {
		const root = makeFixtureTree({ "bad.png": CORRUPT_PNG });
		try {
			const result = checkBinaryMagic(path.join(root, "bad.png"));
			assert.equal(result.ok, false);
			assert.equal(result.expected, "89504e47");
			assert.ok(result.actual.startsWith("efbfbd"), `actual was ${result.actual}`);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("passes a valid zip and fails a text-corrupted one", () => {
		const root = makeFixtureTree({ "ok.zip": VALID_ZIP, "bad.zip": CORRUPT_ZIP });
		try {
			assert.equal(checkBinaryMagic(path.join(root, "ok.zip")).ok, true);
			const result = checkBinaryMagic(path.join(root, "bad.zip"));
			assert.equal(result.ok, false);
			assert.equal(result.expected, "504b0304");
			assert.ok(result.actual.startsWith("efbfbd"), `actual was ${result.actual}`);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("passes valid gzip bytes under .gz and .tgz names", () => {
		const root = makeFixtureTree({ "ok.gz": VALID_GZIP, "ok.tgz": VALID_GZIP });
		try {
			assert.equal(checkBinaryMagic(path.join(root, "ok.gz")).ok, true);
			assert.equal(checkBinaryMagic(path.join(root, "ok.tgz")).ok, true);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("validates WebP on both the RIFF and WEBP markers", () => {
		const good = Buffer.from("RIFF\x00\x00\x00\x00WEBP chambers");
		const bad = Buffer.from("RIFF\x00\x00\x00\x00XXXX chambers");
		const root = makeFixtureTree({ "good.webp": good, "bad.webp": bad });
		try {
			assert.equal(checkBinaryMagic(path.join(root, "good.webp")).ok, true);
			assert.equal(checkBinaryMagic(path.join(root, "bad.webp")).ok, false);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("fails an empty PNG instead of passing it", () => {
		const root = makeFixtureTree({ "empty.png": Buffer.alloc(0) });
		try {
			assert.equal(checkBinaryMagic(path.join(root, "empty.png")).ok, false);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("skips unknown extensions and missing files instead of failing", () => {
		const root = makeFixtureTree({ "notes.svg": Buffer.from("<svg/>") });
		try {
			const svg = checkBinaryMagic(path.join(root, "notes.svg"));
			assert.equal(svg.ok, true);
			assert.ok(svg.skipped);
			const missing = checkBinaryMagic(path.join(root, "gone.png"));
			assert.equal(missing.ok, true);
			assert.ok(missing.skipped);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("fails an unreadable binary path instead of passing it", () => {
		const root = makeFixtureTree({ "placeholder.txt": Buffer.from("x\n") });
		try {
			const dirAsPng = path.join(root, "bad.png");
			fs.mkdirSync(dirAsPng);
			const result = checkBinaryMagic(dirAsPng);
			assert.equal(result.ok, false);
			assert.equal(result.expected, "89504e47");
			assert.equal(result.actual, null);
			assert.ok(result.readError, "expected a read-error reason");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("follows a symlink to its target bytes: corrupt target fails, broken link is skipped", () => {
		const root = makeFixtureTree({ "real-corrupt.png": CORRUPT_PNG, "real-ok.png": VALID_PNG });
		try {
			fs.symlinkSync(path.join(root, "real-corrupt.png"), path.join(root, "link-corrupt.png"));
			fs.symlinkSync(path.join(root, "real-ok.png"), path.join(root, "link-ok.png"));
			fs.symlinkSync(path.join(root, "nowhere.png"), path.join(root, "link-broken.png"));
			assert.equal(checkBinaryMagic(path.join(root, "link-corrupt.png")).ok, false);
			assert.equal(checkBinaryMagic(path.join(root, "link-ok.png")).ok, true);
			const broken = checkBinaryMagic(path.join(root, "link-broken.png"));
			assert.equal(broken.ok, true);
			assert.ok(broken.skipped);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("formatGuardFailure", () => {
	it("names the file with expected vs actual magic and the safe remedy", () => {
		const text = formatGuardFailure({
			relPath: "docs/tasks/x/pretty-proof.png",
			expected: "89504e47",
			actual: "efbfbd50",
		});
		assert.match(text, /docs\/tasks\/x\/pretty-proof\.png/);
		assert.match(text, /expected magic 89504e47, found efbfbd50/);
		assert.match(text, /capture-screenshot\.mjs/);
		assert.match(text, /git checkout/);
		assert.match(text, /xxd -l 8/);
	});

	it("never prints a bare null/undefined for an unreadable file", () => {
		const text = formatGuardFailure({
			relPath: "docs/tasks/x/bad.png",
			expected: "89504e47",
			actual: null,
			readError: "EISDIR: weird",
		});
		assert.match(text, /bad\.png/);
		assert.doesNotMatch(text, /null|undefined/);
	});
});

describe("parsePorcelainZero", () => {
	it("parses plain records and drops the trailing empty field after the final NUL", () => {
		assert.deepEqual(parsePorcelainZero("?? new.png\0M  mod.png\0"), ["new.png", "mod.png"]);
		assert.deepEqual(parsePorcelainZero(""), []);
	});

	it("consumes the source field of rename/copy records and keeps the current path", () => {
		// In -z format the record is `XY PATH\0ORIG_PATH\0` (order reversed vs the arrow form).
		assert.deepEqual(parsePorcelainZero("R  new.png\0old.png\0"), ["new.png"]);
		assert.deepEqual(parsePorcelainZero("C  copy.png\0orig.png\0"), ["copy.png"]);
	});

	it("drops deletions on either side (no bytes left to verify)", () => {
		assert.deepEqual(parsePorcelainZero(" D gone.png\0D  gone2.png\0"), []);
		assert.deepEqual(parsePorcelainZero("RD new.png\0old.png\0"), []);
	});

	it("keeps unmerged and path-with-spaces records intact", () => {
		assert.deepEqual(parsePorcelainZero("UU both.png\0?? my proof.png\0"), ["both.png", "my proof.png"]);
	});
});

describe("checkPaths", () => {
	it("skips unguarded candidates and collects only guarded violations with their relPath", () => {
		const root = makeFixtureTree({
			"ok.png": VALID_PNG,
			"bad.png": CORRUPT_PNG,
			"notes.md": Buffer.from("text\n"),
		});
		try {
			const violations = checkPaths([
				{ relPath: "ok.png", absPath: path.join(root, "ok.png") },
				{ relPath: "bad.png", absPath: path.join(root, "bad.png") },
				{ relPath: "notes.md", absPath: path.join(root, "notes.md") },
			]);
			assert.equal(violations.length, 1);
			assert.equal(violations[0].relPath, "bad.png");
			assert.equal(violations[0].expected, "89504e47");
			assert.ok(violations[0].actual.startsWith("efbfbd"));
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("listChangedFiles", () => {
	it("lists staged and unstaged worktree files by repo-relative path", () => {
		const root = makeGitTree({
			"docs/tasks/demo/staged-proof.png": CORRUPT_PNG,
			"docs/tasks/demo/worktree-proof.png": CORRUPT_PNG,
			"docs/tasks/demo/notes.md": Buffer.from("text\n"),
		});
		try {
			execFileSync("git", ["add", "docs/tasks/demo/staged-proof.png"], { cwd: root });
			const files = listChangedFiles({ root });
			const relPaths = files.map((entry) => entry.relPath);
			assert.ok(relPaths.includes("docs/tasks/demo/staged-proof.png"));
			assert.ok(relPaths.includes("docs/tasks/demo/worktree-proof.png"));
			assert.ok(relPaths.includes("docs/tasks/demo/notes.md"));
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("lists only staged files when stagedOnly is set", () => {
		const root = makeGitTree({
			"docs/tasks/demo/staged-proof.png": CORRUPT_PNG,
			"docs/tasks/demo/worktree-proof.png": CORRUPT_PNG,
		});
		try {
			execFileSync("git", ["add", "docs/tasks/demo/staged-proof.png"], { cwd: root });
			const files = listChangedFiles({ root, stagedOnly: true });
			const relPaths = files.map((entry) => entry.relPath);
			assert.deepEqual(relPaths, ["docs/tasks/demo/staged-proof.png"]);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("skips deleted files (there are no bytes left to verify)", () => {
		const root = makeGitTree({ "docs/tasks/demo/doomed.png": VALID_PNG });
		try {
			execFileSync("git", ["add", "docs/tasks/demo/doomed.png"], { cwd: root });
			execFileSync("git", ["commit", "-q", "-m", "add"], { cwd: root });
			execFileSync("git", ["rm", "-q", "docs/tasks/demo/doomed.png"], { cwd: root });
			const files = listChangedFiles({ root });
			assert.deepEqual(files.map((entry) => entry.relPath), []);
			const staged = listChangedFiles({ root, stagedOnly: true });
			assert.deepEqual(staged.map((entry) => entry.relPath), []);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("throws a helpful error outside a git repository", () => {
		const root = makeFixtureTree({ "docs/tasks/demo/p.png": VALID_PNG });
		try {
			assert.throws(() => listChangedFiles({ root }), /not a git repository|git status failed/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("CLI exit contract", () => {
	function runGuard(...cliArgs) {
		return spawnSync(process.execPath, [GUARD, ...cliArgs], { encoding: "utf8" });
	}

	it("exits 1 naming the corrupt PNG with expected vs actual and the remedy", () => {
		const root = makeFixtureTree({ "docs/tasks/demo/pretty-proof.png": CORRUPT_PNG });
		try {
			const result = runGuard("--root", root, "docs/tasks/demo/pretty-proof.png");
			assert.equal(result.status, 1);
			assert.match(result.stderr, /pretty-proof\.png/);
			assert.match(result.stderr, /expected magic 89504e47, found efbfbd/);
			assert.match(result.stderr, /capture-screenshot\.mjs/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("exits 0 on a valid PNG proof", () => {
		const root = makeFixtureTree({ "docs/tasks/demo/pretty-proof.png": VALID_PNG });
		try {
			const result = runGuard("--root", root, "docs/tasks/demo/pretty-proof.png");
			assert.equal(result.status, 0);
			assert.match(result.stdout, /OK/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("skips unknown extensions passed explicitly instead of failing", () => {
		const root = makeFixtureTree({ "docs/tasks/demo/notes.md": Buffer.from("text\n") });
		try {
			const result = runGuard("--root", root, "docs/tasks/demo/notes.md");
			assert.equal(result.status, 0);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("catches a staged corrupt PNG in --staged mode (the pre-commit path)", () => {
		const root = makeGitTree({ "docs/tasks/demo/pretty-proof.png": CORRUPT_PNG });
		try {
			execFileSync("git", ["add", "docs/tasks/demo/pretty-proof.png"], { cwd: root });
			const result = runGuard("--staged", "--root", root);
			assert.equal(result.status, 1);
			assert.match(result.stderr, /pretty-proof\.png/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("passes --staged mode when the staged PNG is valid", () => {
		const root = makeGitTree({ "docs/tasks/demo/pretty-proof.png": VALID_PNG });
		try {
			execFileSync("git", ["add", "docs/tasks/demo/pretty-proof.png"], { cwd: root });
			const result = runGuard("--staged", "--root", root);
			assert.equal(result.status, 0);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("catches an unstaged worktree corruption in default changed-file mode", () => {
		const root = makeGitTree({ "docs/tasks/demo/pretty-proof.png": VALID_PNG });
		try {
			execFileSync("git", ["add", "docs/tasks/demo/pretty-proof.png"], { cwd: root });
			execFileSync("git", ["commit", "-q", "-m", "add proof"], { cwd: root });
			fs.writeFileSync(path.join(root, "docs/tasks/demo/pretty-proof.png"), CORRUPT_PNG);
			const result = runGuard("--root", root);
			assert.equal(result.status, 1);
			assert.match(result.stderr, /pretty-proof\.png/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("exits 2 outside a git repository with no explicit paths (never a false PASS)", () => {
		const root = makeFixtureTree({ "docs/tasks/demo/p.png": VALID_PNG });
		try {
			const result = runGuard("--root", root);
			assert.equal(result.status, 2);
			assert.match(result.stderr, /not a git repository|explicit file path/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("exits 2 on an unknown flag instead of silently passing", () => {
		const root = makeFixtureTree({ "package.json": Buffer.from("{}\n") });
		try {
			const result = runGuard("--root", root, "--strcit");
			assert.equal(result.status, 2);
			assert.match(result.stderr, /unknown flag/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("exits 2 when --root steals another flag as its value", () => {
		const result = runGuard("--root", "--staged");
		assert.equal(result.status, 2);
		assert.match(result.stderr, /--root requires a directory argument/);
	});

	it("exits 2 on a missing or non-directory --root instead of a false PASS", () => {
		const root = makeFixtureTree({ "package.json": Buffer.from("{}\n") });
		try {
			const missing = runGuard("--root", path.join(root, "does-not-exist"), "x.png");
			assert.equal(missing.status, 2);
			assert.match(missing.stderr, /not a readable directory/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("exits 2 naming an explicit path that does not exist (never a false PASS on a typo)", () => {
		const root = makeFixtureTree({ "docs/tasks/demo/real.png": VALID_PNG });
		try {
			const result = runGuard("--root", root, "docs/tasks/demo/typo.png");
			assert.equal(result.status, 2);
			assert.match(result.stderr, /typo\.png/);
			assert.match(result.stderr, /does not exist/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("exits 2 naming an explicit path that is a broken symlink", () => {
		const root = makeFixtureTree({ "placeholder.txt": Buffer.from("x\n") });
		try {
			const link = path.join(root, "link.png");
			fs.symlinkSync(path.join(root, "gone.png"), link);
			const result = runGuard("--root", root, "link.png");
			assert.equal(result.status, 2);
			assert.match(result.stderr, /link\.png/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("documents the exit-code contract in --help", () => {
		const result = runGuard("--help");
		assert.equal(result.status, 0);
		assert.match(result.stdout, /exit 0/);
		assert.match(result.stdout, /exit 1/);
		assert.match(result.stdout, /exit 2/);
	});

	it("rejects main() argument errors with exit 2 without touching the filesystem", () => {
		assert.equal(main(["node", "check-binary-guard.mjs", "--nope"]), 2);
		assert.equal(main(["node", "check-binary-guard.mjs", "--root"]), 2);
		assert.equal(
			main(["node", "check-binary-guard.mjs", "--root", path.join(os.tmpdir(), "binary-guard-nope")]),
			2,
		);
	});
});
