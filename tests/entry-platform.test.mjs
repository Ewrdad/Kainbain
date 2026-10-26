import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

/***
 * MARK: entry-platform tests
 * @description Static regression gate for the cross-platform entry points:
 *   the `test`/`dev`/`setup` path must reference no Linux-only tooling, the
 *   root scripts must point at the Node runners, the workspace test scripts
 *   must carry no `VAR=` shell prefix (it breaks Windows `cmd`), and
 *   `run-tests.sh` must stay a thin shim over the Node gate.
 * @example run `node --test tests/entry-platform.test.mjs`
 ***/

// The Linux-only couplings the gate must never reintroduce on the
// build/test/dev path. NOTE: these literals live in this test file only;
// the scanned files below must not contain them, even in comments.
const BANNED = ["fuser", "flock", "systemd-run", "systemctl", "nginx-proxy", "nice -n"];

const ENTRY_FILES = [
	"scripts/run-tests.mjs",
	"scripts/depcheck.mjs",
	"scripts/dev.mjs",
	"scripts/setup.mjs",
	"scripts/free-port.mjs",
	"scripts/lib/run-parallel.mjs",
	"scripts/lib/run-supervised.mjs",
	"package.json",
];

function readRepoFile(relPath) {
	/* eslint-disable security/detect-non-literal-fs-filename -- fixed repo-relative paths under test */
	return fs.readFileSync(path.join(REPO_ROOT, relPath), "utf8");
	/* eslint-enable security/detect-non-literal-fs-filename */
}

describe("entry points stay free of Linux-only tooling", () => {
	for (const relPath of ENTRY_FILES) {
		it(`${relPath} references no Linux-only tooling`, () => {
			const body = readRepoFile(relPath);
			for (const needle of BANNED) {
				assert.ok(!body.includes(needle), `${relPath} contains banned ${JSON.stringify(needle)}`);
			}
		});
	}
});

describe("root scripts point at the Node runners", () => {
	const root = JSON.parse(readRepoFile("package.json"));

	it("test runs the Node gate", () => {
		assert.equal(root.scripts.test, "node scripts/run-tests.mjs");
	});

	it("dev runs the Node supervisor", () => {
		assert.equal(root.scripts.dev, "node scripts/dev.mjs");
	});

	it("setup runs the Node installer", () => {
		assert.equal(root.scripts.setup, "node scripts/setup.mjs");
	});

	it("depcheck runs the Node fan-out", () => {
		assert.equal(root.scripts.depcheck, "node scripts/depcheck.mjs");
	});
});

describe("workspace test scripts carry no shell env prefix", () => {
	for (const workspace of ["api", "frontend"]) {
		it(`${workspace} test runs under Windows cmd (no VAR= prefix)`, () => {
			const pkg = JSON.parse(readRepoFile(`${workspace}/package.json`));
			assert.match(pkg.scripts.test, /vitest run/);
			assert.ok(!/^[A-Z_]+=/.test(pkg.scripts.test), `${workspace} test still has a shell env prefix`);
		});
	}
});

describe("run-tests.sh stays a thin shim", () => {
	it("delegates to the Node gate without its own runner", () => {
		const shim = readRepoFile("run-tests.sh");
		assert.match(shim, /node scripts\/run-tests\.mjs/);
		assert.ok(!shim.includes("run_parallel"), "shim must not carry the old runner");
	});
});

describe("installs resolve the way the lockfiles were built", () => {
	it("root .npmrc pins legacy peer resolution (frontend needs it)", () => {
		const npmrc = readRepoFile(".npmrc");
		assert.match(npmrc, /^legacy-peer-deps=true/m);
	});
});
