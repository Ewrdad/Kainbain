import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sha256HexOf, verifyAssetBytes, verifyAssetFile, verifyManifestSignature } from "./updates/verify.js";
import { fixtureManifest, signTestManifest, TEST_PUBLIC_KEY } from "./updates/testkey.js";

describe("verifyManifestSignature", () => {
	it("accepts a manifest signed by the test key", () => {
		const bytes = Buffer.from(JSON.stringify(fixtureManifest()), "utf8");
		const sig = signTestManifest(bytes);
		const got = verifyManifestSignature({ manifestBytes: bytes, signatureText: sig, publicKey: TEST_PUBLIC_KEY });
		assert.equal(got.ok, true);
	});

	it("rejects a tampered manifest (version bumped after signing)", () => {
		const manifest = fixtureManifest();
		const bytes = Buffer.from(JSON.stringify(manifest), "utf8");
		const sig = signTestManifest(bytes);
		const tampered = Buffer.from(JSON.stringify({ ...manifest, version: "9.9.9" }), "utf8");
		const got = verifyManifestSignature({ manifestBytes: tampered, signatureText: sig, publicKey: TEST_PUBLIC_KEY });
		assert.equal(got.ok, false);
		assert.match(got.reason, /FAILED/i);
	});

	it("rejects a tampered signature", () => {
		const bytes = Buffer.from(JSON.stringify(fixtureManifest()), "utf8");
		const signed = signTestManifest(bytes).trim().split("\n");
		// Flip a mid-string base64 char: guaranteed to change decoded bytes
		// (the final char may be padding and decode identically).
		const body = signed[1];
		const flipped = body.slice(0, 20) + (body[20] === "A" ? "B" : "A") + body.slice(21);
		const sig = `${signed[0]}\n${flipped}\n`;
		const got = verifyManifestSignature({ manifestBytes: bytes, signatureText: sig, publicKey: TEST_PUBLIC_KEY });
		assert.equal(got.ok, false);
	});

	it("rejects a signature from a different key", () => {
		const bytes = Buffer.from(JSON.stringify(fixtureManifest()), "utf8");
		const sig = signTestManifest(bytes);
		const other = "RWR8CRkuyEfBxwUaaAnqo8ZXL7XgO8G2H8ZhAe6YoOr7+EfDVsoWznZG";
		const got = verifyManifestSignature({ manifestBytes: bytes, signatureText: sig, publicKey: other });
		assert.equal(got.ok, false);
		assert.match(got.reason, /key id/i);
	});

	it("rejects against the pinned release key (test sig is not a release sig)", () => {
		const bytes = Buffer.from(JSON.stringify(fixtureManifest()), "utf8");
		const sig = signTestManifest(bytes);
		const got = verifyManifestSignature({ manifestBytes: bytes, signatureText: sig });
		assert.equal(got.ok, false);
	});
});

describe("verifyAssetBytes / verifyAssetFile", () => {
	it("accepts matching bytes and rejects flipped bytes", () => {
		const bytes = Buffer.from("runner-bytes");
		const hex = sha256HexOf(bytes);
		assert.equal(verifyAssetBytes({ bytes, expectedSha256: hex }).ok, true);
		const bad = Buffer.from("runner-bytez");
		const res = verifyAssetBytes({ bytes: bad, expectedSha256: hex });
		assert.equal(res.ok, false);
		assert.match(res.reason, /mismatch/i);
	});

	it("verifies a file on disk by streaming", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-verify-"));
		const file = path.join(dir, "asset.bin");
		fs.writeFileSync(file, Buffer.from("on-disk-bytes"));
		const hex = sha256HexOf(Buffer.from("on-disk-bytes"));
		assert.equal((await verifyAssetFile({ filePath: file, expectedSha256: hex })).ok, true);
		assert.equal((await verifyAssetFile({ filePath: file, expectedSha256: "0".repeat(64) })).ok, false);
		fs.rmSync(dir, { recursive: true, force: true });
	});
});
