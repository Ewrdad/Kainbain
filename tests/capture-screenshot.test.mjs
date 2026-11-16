import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { verifyPngMagic } from "../scripts/capture-screenshot.mjs";

const VALID_PNG = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
// The text-round-trip corruption signature: U+FFFD (ef bf bd) where 0x89 belongs.
const CORRUPT_PNG = Buffer.from([
	0xef, 0xbf, 0xbd, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);

/***
 * MARK: makeFixtureTree
 * @description Builds a scratch fixture tree under the OS temp dir with the
 *   given repo-relative files (parents created on demand). Callers remove
 *   the tree with fs.rmSync(..., { recursive: true }).
 ***/
function makeFixtureTree(files) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "capture-verify-"));
	for (const [relPath, content] of Object.entries(files)) {
		const full = path.join(root, relPath);
		fs.mkdirSync(path.dirname(full), { recursive: true });
		fs.writeFileSync(full, content);
	}
	return root;
}

describe("verifyPngMagic", () => {
	it("passes a freshly captured PNG head", () => {
		const root = makeFixtureTree({ "shot-proof.png": VALID_PNG });
		try {
			const result = verifyPngMagic(path.join(root, "shot-proof.png"));
			assert.equal(result.ok, true);
			assert.equal(result.expected, "89504e47");
			assert.ok(result.actual.startsWith("89504e47"), `actual was ${result.actual}`);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("fails a text-corrupted capture with expected vs actual magic", () => {
		const root = makeFixtureTree({ "shot-proof.png": CORRUPT_PNG });
		try {
			const result = verifyPngMagic(path.join(root, "shot-proof.png"));
			assert.equal(result.ok, false);
			assert.equal(result.expected, "89504e47");
			assert.ok(result.actual.startsWith("efbfbd"), `actual was ${result.actual}`);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("fails a missing or empty capture instead of passing it", () => {
		const root = makeFixtureTree({ "empty-proof.png": Buffer.alloc(0) });
		try {
			assert.equal(verifyPngMagic(path.join(root, "empty-proof.png")).ok, false);
			const missing = verifyPngMagic(path.join(root, "never-written.png"));
			assert.equal(missing.ok, false);
			assert.equal(missing.actual, null);
			assert.ok(missing.error, "expected an error reason");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("skips non-PNG outputs (the capture may target other image types)", () => {
		const root = makeFixtureTree({ "shot.jpg": Buffer.from([0xff, 0xd8, 0xff, 0xe0]) });
		try {
			const result = verifyPngMagic(path.join(root, "shot.jpg"));
			assert.equal(result.ok, true);
			assert.ok(result.skipped);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
