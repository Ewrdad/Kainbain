import crypto from "node:crypto";

// TEST-ONLY minisign-format keypair for runner update-channel tests.
// The private half is committed deliberately: it signs fixtures inside
// tests and nothing else. NEVER use this key for real releases — real
// releases are signed in CI with RUNNER_RELEASE_SIGNING_KEY and verified
// against the pinned key in runner/updates/verify.js.
export const TEST_PUBLIC_KEY = "RWRCUzB8t/wIMINJBGGtm39SH7ufwmtf2HmzN2km1Ntdgr4uo/2CVDSV";
const TEST_KEYNUM_HEX = "4253307cb7fc0830";
const TEST_PRIV_RAW_HEX = "4a51021400d9e8ffb78e4a1675b91fb7757f4e92c2e4c045d1cf8aa40286daf4";

const pkcs8DerFor = (privRaw) =>
	Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(privRaw)]);

export const signTestManifest = (manifestBytes) => {
	const priv = crypto.createPrivateKey({
		key: pkcs8DerFor(Buffer.from(TEST_PRIV_RAW_HEX, "hex")),
		format: "der",
		type: "pkcs8",
	});
	const sig = crypto.sign(null, Buffer.from(manifestBytes), priv);
	const envelope = Buffer.concat([
		Buffer.from([0x45, 0x64]),
		Buffer.from(TEST_KEYNUM_HEX, "hex"),
		sig,
	]).toString("base64");
	return `untrusted comment: test signature (NOT a release)\n${envelope}\n`;
};

export const fixtureManifest = (overrides = {}) => ({
	schema: 1,
	component: "runner",
	version: "0.2.0",
	releasedAt: "2026-10-31T00:00:00.000Z",
	assetBase: "http://127.0.0.1/releases/",
	assets: [
		{
			platform: "linux",
			arch: "x64",
			filename: "kainbain-runner-0.2.0-linux-x64.tar.gz",
			sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			size: 1234,
		},
		{
			platform: "linux",
			arch: "arm64",
			filename: "kainbain-runner-0.2.0-linux-arm64.tar.gz",
			sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			size: 1234,
		},
		{
			platform: "darwin",
			arch: "x64",
			filename: "kainbain-runner-0.2.0-darwin-x64.tar.gz",
			sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			size: 1234,
		},
		{
			platform: "darwin",
			arch: "arm64",
			filename: "kainbain-runner-0.2.0-darwin-arm64.tar.gz",
			sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			size: 1234,
		},
	],
	...overrides,
});
