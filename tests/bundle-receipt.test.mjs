import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIB = path.join(ROOT, "scripts", "lib", "bundle-receipt.sh");

// print_bundle_receipt runs in a child bash that sources the lib, so the
// tests exercise the real sourced-shell behavior (return codes included).
const runReceipt = (tarball) =>
	spawnSync("bash", ["-c", `. ${JSON.stringify(LIB)} && print_bundle_receipt ${JSON.stringify(tarball)}`], {
		encoding: "utf8",
	});

// Builds a fake runner bundle tarball: <name>/version.json at the archive
// root (the stamped identity) plus a nested <name>/runner/version.json with
// a DIFFERENT sha, so a receipt that picks the wrong entry is caught.
const makeBundle = ({ name = "kainbain-runner-0.9.0-linux-x64", rootSha = "abc123def456", nestedSha = "nested-should-not-win", nestedFirst = false } = {}) => {
	const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "kb-receipt-"));
	const stage = path.join(sandbox, name);
	fs.mkdirSync(path.join(stage, "runner"), { recursive: true });
	fs.writeFileSync(path.join(stage, "version.json"), JSON.stringify({ runnerVersion: "0.9.0", build: { sha: rootSha, builtAt: "2026-11-23T00:00:00.000Z", dirty: false } }));
	fs.writeFileSync(path.join(stage, "runner", "version.json"), JSON.stringify({ runnerVersion: "0.9.0", build: { sha: nestedSha, builtAt: null, dirty: null } }));
	fs.writeFileSync(path.join(stage, "runner", "main.js"), "export const main = () => 0;\n");
	const tarball = path.join(sandbox, `${name}.tar.gz`);
	if (nestedFirst) {
		// List the nested version.json first: a receipt that trusts tar's
		// first entry (the old `head -n 1` behavior) reads the wrong file.
		spawnSync("tar", ["-czf", tarball, "-C", stage, "runner/version.json", "--transform", `s|^runner/|${name}/runner/|`, "-C", stage, "version.json", "--transform", `s|^version.json$|${name}/version.json|`, "-C", stage, "runner/main.js", "--transform", `s|^runner/|${name}/runner/|`], { stdio: "inherit" });
	} else {
		spawnSync("tar", ["-czf", tarball, "-C", sandbox, name]);
	}
	return { sandbox, tarball };
};

describe("bundle-receipt.sh print_bundle_receipt", () => {
	it("prints the re-hashable sha256 and the stamped build.sha of a bundle", () => {
		const { sandbox, tarball } = makeBundle({ rootSha: "abc123def456" });
		try {
			const got = runReceipt(tarball);
			assert.equal(got.status, 0, got.stderr);
			const expectedSha256 = crypto.createHash("sha256").update(fs.readFileSync(tarball)).digest("hex");
			assert.match(got.stdout, new RegExp(`^sha256: ${expectedSha256}$`, "m"), "the receipt sha256 matches an independent re-hash");
			assert.match(got.stdout, /^stamped build\.sha: abc123def456$/m, "the receipt names the archive-root stamped sha");
		} finally {
			fs.rmSync(sandbox, { recursive: true, force: true });
		}
	});

	it("picks the archive-ROOT version.json even when tar lists the nested one first", () => {
		const { sandbox, tarball } = makeBundle({ rootSha: "root-sha-wins", nestedSha: "nested-should-not-win", nestedFirst: true });
		try {
			const listing = spawnSync("tar", ["tzf", tarball], { encoding: "utf8" }).stdout;
			assert.ok(listing.indexOf("runner/version.json") < listing.indexOf("version.json\n"), "the nested entry really is listed first");
			const got = runReceipt(tarball);
			assert.equal(got.status, 0, got.stderr);
			assert.match(got.stdout, /^stamped build\.sha: root-sha-wins$/m, "the root copy wins over the nested copy regardless of entry order");
			assert.doesNotMatch(got.stdout, /nested-should-not-win/);
		} finally {
			fs.rmSync(sandbox, { recursive: true, force: true });
		}
	});

	it("reports an unknown stamp (not a crash) when the bundle was built outside a checkout", () => {
		const { sandbox, tarball } = makeBundle();
		try {
			const stageVersion = JSON.parse(fs.readFileSync(tarball, "utf8") && "{}"); // placeholder, rewritten below
			void stageVersion;
		} finally {
			// rebuild with a null stamp
		}
		const sandbox2 = fs.mkdtempSync(path.join(os.tmpdir(), "kb-receipt-null-"));
		try {
			const stage = path.join(sandbox2, "kainbain-runner-0.9.0-linux-x64");
			fs.mkdirSync(stage, { recursive: true });
			fs.writeFileSync(path.join(stage, "version.json"), JSON.stringify({ runnerVersion: "0.9.0", build: { sha: null, builtAt: null, dirty: null } }));
			const tarball2 = path.join(sandbox2, "bundle.tar.gz");
			spawnSync("tar", ["-czf", tarball2, "-C", sandbox2, "kainbain-runner-0.9.0-linux-x64"]);
			const got = runReceipt(tarball2);
			assert.equal(got.status, 0, got.stderr);
			assert.match(got.stdout, /^stamped build\.sha: \(unknown — no git checkout at build time\)$/m);
		} finally {
			fs.rmSync(sandbox, { recursive: true, force: true });
			fs.rmSync(sandbox2, { recursive: true, force: true });
		}
	});

	it("fails loudly when the tarball is missing or empty", () => {
		const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "kb-receipt-missing-"));
		try {
			const got = runReceipt(path.join(sandbox, "no-such.tar.gz"));
			assert.notEqual(got.status, 0);
			assert.match(got.stderr, /no readable tarball/, "the error names the missing tarball");
			const bare = runReceipt("");
			assert.notEqual(bare.status, 0);
			assert.match(bare.stderr, /<empty arg>/);
		} finally {
			fs.rmSync(sandbox, { recursive: true, force: true });
		}
	});

	it("fails loudly when the archive has no root version.json (not a runner bundle)", () => {
		const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "kb-receipt-noroot-"));
		try {
			fs.mkdirSync(path.join(sandbox, "some-other-thing"), { recursive: true });
			fs.writeFileSync(path.join(sandbox, "some-other-thing", "README"), "not a runner bundle\n");
			const tarball = path.join(sandbox, "other.tar.gz");
			spawnSync("tar", ["-czf", tarball, "-C", sandbox, "some-other-thing"]);
			const got = runReceipt(tarball);
			assert.notEqual(got.status, 0);
			assert.match(got.stderr, /no archive-root version\.json/, "the error says what is missing");
		} finally {
			fs.rmSync(sandbox, { recursive: true, force: true });
		}
	});

	it("fails loudly when the bundled version.json is not parseable", () => {
		const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "kb-receipt-badjson-"));
		try {
			const stage = path.join(sandbox, "kainbain-runner-0.9.0-linux-x64");
			fs.mkdirSync(stage, { recursive: true });
			fs.writeFileSync(path.join(stage, "version.json"), "{not json");
			const tarball = path.join(sandbox, "bundle.tar.gz");
			spawnSync("tar", ["-czf", tarball, "-C", sandbox, "kainbain-runner-0.9.0-linux-x64"]);
			const got = runReceipt(tarball);
			assert.notEqual(got.status, 0);
			assert.match(got.stderr, /not parseable JSON/, "a corrupt identity fails the receipt instead of shipping silently");
		} finally {
			fs.rmSync(sandbox, { recursive: true, force: true });
		}
	});

	it("package-runner.sh sources the receipt lib instead of a non-portable sha256sum call", () => {
		const wrapper = fs.readFileSync(path.join(ROOT, "scripts", "package-runner.sh"), "utf8");
		assert.match(wrapper, /lib\/bundle-receipt\.sh/, "the wrapper sources the shared receipt lib");
		assert.match(wrapper, /print_bundle_receipt "\$OUT"/, "the wrapper prints the receipt for the produced tarball");
		// Strip full-line comments: the header documents WHY sha256sum is
		// avoided (absent on macOS), which must not read as a call site.
		const code = wrapper
			.split("\n")
			.filter((line) => !/^\s*#/.test(line))
			.join("\n");
		assert.doesNotMatch(code, /[^a-z]sha256sum /, "no bare sha256sum call (absent on macOS) — hashing goes through node");
	});
});
