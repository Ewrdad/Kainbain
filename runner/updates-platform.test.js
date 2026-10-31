import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assetNameFor, detectUpdatePlatform } from "./updates/platform.js";

describe("detectUpdatePlatform", () => {
	it("accepts the four v1 targets", () => {
		for (const [platform, arch] of [["linux", "x64"], ["linux", "arm64"], ["darwin", "x64"], ["darwin", "arm64"]]) {
			const got = detectUpdatePlatform({ platform, arch });
			assert.equal(got.ok, true);
			assert.equal(got.key, `${platform}-${arch}`);
		}
	});

	it("rejects Windows and unknown arches", () => {
		assert.equal(detectUpdatePlatform({ platform: "win32", arch: "x64" }).ok, false);
		assert.equal(detectUpdatePlatform({ platform: "win32", arch: "x64" }).reason, "UNSUPPORTED_PLATFORM");
		assert.equal(detectUpdatePlatform({ platform: "linux", arch: "ia32" }).ok, false);
		assert.equal(detectUpdatePlatform({ platform: "freebsd", arch: "x64" }).ok, false);
	});
});

describe("assetNameFor", () => {
	it("builds the canonical filename and strips a v prefix", () => {
		assert.equal(
			assetNameFor({ version: "1.2.3", platform: "linux", arch: "x64" }),
			"kainbain-runner-1.2.3-linux-x64.tar.gz",
		);
		assert.equal(
			assetNameFor({ version: "v1.2.3", platform: "darwin", arch: "arm64" }),
			"kainbain-runner-1.2.3-darwin-arm64.tar.gz",
		);
	});

	it("throws UNSUPPORTED_PLATFORM for Windows", () => {
		assert.throws(
			() => assetNameFor({ version: "1.0.0", platform: "win32", arch: "x64" }),
			(err) => err?.code === "UNSUPPORTED_PLATFORM",
		);
	});
});
